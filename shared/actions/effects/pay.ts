import type {
  ActionDefinition,
  ActionExecutionResult,
  CardCostCandidateMetadata,
  CardProvidedPaymentResourceProvider,
  ComplexCost,
  CostModifierType,
  GameState,
  PaymentResourceKey,
  PaymentResourceMap,
  PaymentSolution,
  PlayerState,
  Resource,
} from '../../contract/types'
import type { EventSink, PaymentPurpose, ResourceLocation } from '../../contract/events'
import { addCardResourcePaid, recordCardCostAttribution } from '../../cards/helpers/card-state'
// PaymentSolver namespace (S3 Task 7b): core payment APIs migrated to
// the new payment module. Other helpers (preview-cost / typed-flat /
// room-payment / cost-modifier internals) remain on the shim through S3.
import { PaymentSolver } from '../payment'
import type { PaymentCtx } from '../payment'
import {
  canConsumePaymentResourceProviders,
  cardCostCandidateMetadataForSolution,
  executePaymentSolution,
  payResources,
  paySupplyTokens,
} from '../payment/internal'
import { returnCardToBoard } from '../../cards/helpers/return-card'
import {
  filterPaymentSolutionsByReserve,
  preservesResourceReserve,
  payTypedFlatCostDetailed,
  resolveCostPaymentSelection,
  resolvePaymentSolutionSelection,
} from '../payment/internal'
import { isPaymentResourceKey } from '../../contract/resource-keys'

/**
 * Construct a minimal GameState wrapping a single player. Used by
 * pay's PaymentSolver.canAfford / computeOptions calls where the function
 * signature doesn't carry GameState (canExecute callback). Safe ONLY for
 * simple-cost and ComplexCost affordability checks — do not pass to
 * hook-firing code paths.
 */
const buildSingletonState = (player: PlayerState): GameState =>
  ({ ...({} as GameState), players: [player] })

export type PayParams = {
  cost: PaymentResourceMap | ComplexCost
  costType?: CostModifierType
  optionPrefix?: string
  paymentChoice?: string
  sourceActionId?: string
  includeReturnedCard?: boolean
  playedCards?: string[]
  reserveResources?: Partial<Resource>
  candidateMetadataByFeeIndex?: Record<number, CardCostCandidateMetadata>
  trackSourceCardPaymentStats?: boolean
}

/**
 * Pay leaf success result includes `extraData.bonusUsed` (string[] of card ids
 * whose BonusModifier.sources fired this payment), `bonusChoiceIndex`
 * (per-card chosen variant index, only when the bonus had multiple choices),
 * `feeIndex` (which fee variant in a fees[] array was paid), and
 * `returnedCardId` (when `includeReturnedCard` was set on params and the
 * payment consumed a card).
 *
 * Listeners on `actions: ['pay']` read these via `context.result.extraData`.
 * This is the canonical signal for "the card I own contributed to this
 * payment" — see E054_Contraband / E122_Cottar / E128_Saddler /
 * E123_ResourceHoarder for examples.
 *
 * Current attribution note: `player._activeActionBonusSources` is still maintained by
 * `executePaymentSolution` for `log.actionDetail` attribution (read by
 * `GameCore.buildActionDetailParts`) and the direct `playOccupation` /
 * `playImprovement` HTTP entries that don't go through the `pay` leaf.
 * New listeners should not depend on it.
 */

const PAY_PARAM_KEYS = new Set([
  'cost',
  'costType',
  'optionPrefix',
  'paymentChoice',
  'sourceActionId',
  'includeReturnedCard',
  'playedCards',
  'reserveResources',
  'candidateMetadataByFeeIndex',
  'trackSourceCardPaymentStats',
])

const looksLikeFlatResource = (
  raw: Record<string, unknown> | undefined,
): boolean => {
  if (!raw) return false
  const keys = Object.keys(raw)
  if (keys.length === 0) return false
  if (keys.some((k) => PAY_PARAM_KEYS.has(k))) return false
  return keys.every((k) => isPaymentResourceKey(k))
}

const normalizePayParams = (
  raw: Record<string, unknown> | undefined,
): PayParams | undefined => {
  if (!raw) return undefined
  if ('cost' in raw) return raw as unknown as PayParams
  if (looksLikeFlatResource(raw)) {
    return { cost: raw as PaymentResourceMap }
  }
  return undefined
}

const positiveResources = (resources: PaymentResourceMap): PaymentResourceMap => {
  const out: PaymentResourceMap = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    out[key as PaymentResourceKey] = value
  })
  return out
}

const buildPaymentSources = (
  player: PlayerState,
  resources: PaymentResourceMap,
  providers: CardProvidedPaymentResourceProvider[] | undefined,
): Array<{ from: ResourceLocation; resources: PaymentResourceMap }> => {
  const remaining = positiveResources(resources)
  const sources: Array<{ from: ResourceLocation; resources: PaymentResourceMap }> = []

  for (const provider of providers ?? []) {
    const amount = remaining[provider.key] ?? 0
    if (amount <= 0) continue
    delete remaining[provider.key]
    if (provider.consume.type === 'actionSpace') {
      sources.push({
        from: { kind: 'actionSpace', spaceId: provider.consume.spaceId },
        resources: { [provider.consume.resource]: amount },
      })
    }
  }

  if (Object.keys(remaining).length > 0) {
    sources.unshift({ from: { kind: 'player', playerId: player.id }, resources: remaining })
  }
  return sources
}

const splitSourceIds = (csv: string | undefined): string[] =>
  csv ? csv.split(',').map((s) => s.trim()).filter(Boolean) : []

const paymentPurpose = (
  costType: CostModifierType | undefined,
): PaymentPurpose => costType ?? 'cardEffect'

const normalizePaymentChoiceValue = (
  paymentChoice: string | undefined,
  optionValuePrefix: string,
) => {
  if (!paymentChoice) return undefined
  const prefix = `${optionValuePrefix}:`
  return paymentChoice.startsWith(prefix)
    ? paymentChoice.slice(prefix.length)
    : paymentChoice
}

const shouldTrackSourceCardPaymentStats = (p: PayParams): boolean =>
  p.trackSourceCardPaymentStats ?? p.costType === undefined

const resolvePayActionPaymentSelection = (
  state: GameState,
  player: PlayerState,
  cost: ComplexCost,
  optionValuePrefix: string,
  paymentChoice: string | undefined,
  failure: ActionExecutionResult,
  options: {
    costType?: CostModifierType
    includeReturnedCard?: boolean
    playedCards?: string[]
    reserveResources?: Partial<Resource>
    candidateMetadataByFeeIndex?: Record<number, CardCostCandidateMetadata>
    paymentResourceProviders?: readonly CardProvidedPaymentResourceProvider[]
  } = {},
):
  | ActionExecutionResult
  | {
      type: 'selected'
      solution: PaymentSolution
    } => {
  const playerIndex = state.players.indexOf(player)
  const effectiveState = playerIndex >= 0 ? state : buildSingletonState(player)
  const effectiveIndex = playerIndex >= 0 ? playerIndex : 0
  const ctx: PaymentCtx = {
    actionId: 'pay',
    costType: options.costType ?? 'none',
    playedCards: options.playedCards,
  }
  const solutions = filterPaymentSolutionsByReserve(
    player,
    PaymentSolver.computeOptions(effectiveState, effectiveIndex, cost, ctx),
    options.reserveResources,
  )
  return resolvePaymentSolutionSelection(
    solutions,
    normalizePaymentChoiceValue(paymentChoice, optionValuePrefix),
    optionValuePrefix,
    options.includeReturnedCard ?? false,
    failure,
    {
      extraSourcesForSolution: (solution) =>
        cardCostCandidateMetadataForSolution(
          options.candidateMetadataByFeeIndex,
          solution,
        )?.sources ?? [],
      paymentResourceProviders: options.paymentResourceProviders ?? cost.paymentResourceProviders,
    },
  )
}

const emitPaidEvent = (
  eventSink: EventSink | undefined,
  player: PlayerState,
  resources: PaymentResourceMap,
  costType: CostModifierType | undefined,
  sourceCard: string | undefined,
  sourceActionId: string | undefined,
  provenance: {
    bonusUsed?: string
    bonusChoiceIndex?: Record<string, number>
    returnedCardId?: string
    /** Cost Candidate sources of the selected row (rendered as log "via"). */
    candidateSources?: readonly string[]
    paymentResourceProviders?: CardProvidedPaymentResourceProvider[]
  } = {},
) => {
  const paid = positiveResources(resources)
  const bonusSources = [...new Set([
    ...splitSourceIds(provenance.bonusUsed),
    ...(provenance.candidateSources ?? []),
  ])]
  if (
    Object.keys(paid).length === 0 &&
    bonusSources.length === 0 &&
    !provenance.bonusChoiceIndex &&
    !provenance.returnedCardId
  ) return
  eventSink?.emit<'resource.paid'>({
    type: 'resource.paid',
    ...(sourceActionId ? { sourceActionId } : {}),
    resources: paid,
    to: { kind: 'supply' },
    paymentFor: paymentPurpose(costType),
    paymentSources: buildPaymentSources(player, paid, provenance.paymentResourceProviders),
    ...(sourceCard ? { sourceCardId: sourceCard } : {}),
    ...(bonusSources.length > 0 ? { bonusSources } : {}),
    ...(provenance.bonusChoiceIndex ? { bonusChoiceIndex: provenance.bonusChoiceIndex } : {}),
    ...(provenance.returnedCardId ? { returnedCardId: provenance.returnedCardId } : {}),
  })
}

const buildSelectedResult = (
  solution: PaymentSolution,
  sourceCard: string | undefined,
  costType: CostModifierType | undefined,
  player: import('../../contract/types').PlayerState,
  state: import('../../contract/types').GameState,
  includeReturnedCard?: boolean,
  eventSink?: EventSink,
  sourceActionId?: string,
  candidateMetadataByFeeIndex?: Record<number, CardCostCandidateMetadata>,
  paymentResourceProviders?: CardProvidedPaymentResourceProvider[],
  trackSourceCardPaymentStats = costType === undefined,
): ActionExecutionResult => {
  if (!canConsumePaymentResourceProviders(state, solution, paymentResourceProviders)) {
    return { type: 'fail', errorKey: 'log.payFail' }
  }
  executePaymentSolution(player, solution, { costType, state, paymentResourceProviders })
  if (includeReturnedCard && solution.cardUsed) {
    returnCardToBoard(player, solution.cardUsed, state)
  }
  const resourcesPaid = solution.resourcesPaid
  if (sourceCard && trackSourceCardPaymentStats) {
    addCardResourcePaid(player, sourceCard, resourcesPaid)
  }
  const metadata = cardCostCandidateMetadataForSolution(
    candidateMetadataByFeeIndex,
    solution,
  )
  emitPaidEvent(eventSink, player, resourcesPaid, costType, sourceCard, sourceActionId, {
    bonusUsed: solution.bonusUsed,
    bonusChoiceIndex: solution.bonusChoiceIndex,
    returnedCardId: solution.cardUsed,
    candidateSources: metadata?.sources,
    paymentResourceProviders,
  })
  recordCardCostAttribution(player, metadata?.costAttribution)
  const extraData: Record<string, unknown> = {
    resourcesPaid,
    bonusUsed: solution.bonusUsed
      ? solution.bonusUsed.split(',').map((s) => s.trim()).filter(Boolean)
      : [],
  }
  if (solution.bonusChoiceIndex) {
    extraData.bonusChoiceIndex = solution.bonusChoiceIndex
  }
  if (solution.cardUsed) {
    extraData.returnedCardId = solution.cardUsed
  }
  if (solution.feeIndex !== undefined) {
    extraData.feeIndex = solution.feeIndex
  }
  if (metadata) {
    extraData.originalFeeIndex = metadata.originalFeeIndex
  }
  return {
    type: 'ok',
    resourcesPaid,
    extraData,
  }
}

export const payAction: ActionDefinition = {
  id: 'pay',
  nameKey: 'actions.pay.name',
  descriptionKey: 'actions.pay.description',
  roundAvailable: 1,
  gainPerRound: {},
  // Typed-flat costs resolve eagerly inside execute() and return `ok`, so
  // the default Sequence([ActionNode, InteractionNode]) wrap would leave a
  // dangling empty InteractionNode that blocks the surrounding seq (D129 etc.).
  // ComplexCost multi-solution emits a payment choice via the engine's
  // fallback `pendingInteractionNodeId = node.id` path, which still routes the
  // player choice back through resolveChoice.
  skipChoiceWrap: true,
  canBeExecutedByPlayer: () => true,
  costPreview: {
    getBaseCost: ({ params }) => {
      const p = normalizePayParams(params)
      if (!p?.cost) return {}
      if (PaymentSolver.isComplexCost(p.cost)) return p.cost.fee ?? {}
      return p.cost
    },
    // ComplexCost may be affordable only via bonus/trade variants. The default
    // `canPayResources(getBaseCost())` check would erroneously fail because it
    // ignores those alternatives. Explicitly route ComplexCost through
    // computeAllBuyableCombinations so multi-solution payments — including
    // ones that require returning a card via cards.list — stay doable
    // inside seq nodes.
    canExecute: ({ state, player, params }) => {
      const p = normalizePayParams(params)
      if (!p?.cost) return false
      const ctx: PaymentCtx = { actionId: 'pay', costType: p.costType ?? 'none', playedCards: p.playedCards }
      const playerIndex = state.players.indexOf(player)
      const effectiveState = playerIndex >= 0 ? state : buildSingletonState(player)
      const effectiveIndex = playerIndex >= 0 ? playerIndex : 0
      if (!PaymentSolver.isComplexCost(p.cost)) {
        if (p.costType || p.reserveResources) {
          return filterPaymentSolutionsByReserve(
            player,
            PaymentSolver.computeOptions(effectiveState, effectiveIndex, { fee: p.cost }, ctx),
            p.reserveResources,
          ).length > 0
        }
        return PaymentSolver.canAfford(effectiveState, effectiveIndex, p.cost, ctx)
      }
      return filterPaymentSolutionsByReserve(
        player,
        PaymentSolver.computeOptions(effectiveState, effectiveIndex, p.cost, ctx),
        p.reserveResources,
      ).length > 0
    },
  },
  execute: ({ player, params, sourceCard, state, eventSink }) => {
    const p = normalizePayParams(params)
    if (!p?.cost) return { type: 'fail', errorKey: 'log.payFail' }
    if (PaymentSolver.isComplexCost(p.cost)) {
      const optionPrefix = p.optionPrefix ?? 'pay:generic'
      const selection = resolvePayActionPaymentSelection(
        state,
        player,
        p.cost,
        optionPrefix,
        p.paymentChoice,
        { type: 'fail', errorKey: 'log.payFail' },
        {
          costType: p.costType,
          includeReturnedCard: p.includeReturnedCard,
          playedCards: p.playedCards,
          reserveResources: p.reserveResources,
          candidateMetadataByFeeIndex: p.candidateMetadataByFeeIndex,
          paymentResourceProviders: p.cost.paymentResourceProviders,
        },
      )
      if (selection.type !== 'selected') {
        return selection
      }
      return buildSelectedResult(
        selection.solution,
        sourceCard,
        p.costType,
        player,
        state,
        p.includeReturnedCard,
        eventSink,
        p.sourceActionId,
        p.candidateMetadataByFeeIndex,
        p.cost.paymentResourceProviders,
        shouldTrackSourceCardPaymentStats(p),
      )
    }
    const flat = p.cost as PaymentResourceMap
    // 7b1: when a costType is set, route the flat cost through
    // payTypedFlatCost so trade modifiers (A28 ForestSchool wood→food etc.)
    // get the silent cost-replacement treatment they had in the legacy
    // payCardPreviewCost path. Without this the flat branch would just
    // attempt canPayResources(flat) and fail when the player can only
    // afford the cost via a trade swap.
    if (p.costType) {
      if (p.reserveResources) {
        const selection = resolveCostPaymentSelection(
          player,
          { fee: flat },
          p.optionPrefix ?? 'pay:generic',
          p.paymentChoice,
          { type: 'fail', errorKey: 'log.payFail' },
          {
            costType: p.costType,
            state,
            reserveResources: p.reserveResources,
          },
        )
        if (selection.type !== 'selected') {
          return selection
        }
        return buildSelectedResult(
          selection.solution,
          sourceCard,
          p.costType,
          player,
          state,
          p.includeReturnedCard,
          eventSink,
          p.sourceActionId,
          undefined,
          undefined,
          shouldTrackSourceCardPaymentStats(p),
        )
      }
      const detailed = payTypedFlatCostDetailed(player, flat, p.costType, state)
      if (!detailed.ok) return { type: 'fail', errorKey: 'log.payFail' }
      const resourcesPaid = detailed.resourcesPaid
      const extraData: Record<string, unknown> = {
        resourcesPaid,
        bonusUsed: detailed.bonusUsed
          ? detailed.bonusUsed.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
      }
      if (detailed.cardUsed) extraData.returnedCardId = detailed.cardUsed
      if (detailed.feeIndex !== undefined) extraData.feeIndex = detailed.feeIndex
      if (detailed.bonusChoiceIndex) extraData.bonusChoiceIndex = detailed.bonusChoiceIndex
      emitPaidEvent(eventSink, player, resourcesPaid, p.costType, sourceCard, p.sourceActionId, {
        bonusUsed: detailed.bonusUsed,
        bonusChoiceIndex: detailed.bonusChoiceIndex,
        returnedCardId: detailed.cardUsed,
      })
      if (sourceCard && shouldTrackSourceCardPaymentStats(p)) {
        addCardResourcePaid(player, sourceCard, resourcesPaid)
        return { type: 'ok', resourcesPaid, extraData }
      }
      return { type: 'ok', resourcesPaid, extraData }
    }
    const playerIndex = state.players.indexOf(player)
    const effectiveState = playerIndex >= 0 ? state : buildSingletonState(player)
    const effectiveIndex = playerIndex >= 0 ? playerIndex : 0
    if (!PaymentSolver.canAfford(effectiveState, effectiveIndex, flat, { actionId: 'pay', costType: 'none' })) {
      return { type: 'fail', errorKey: 'log.payFail' }
    }
    if (!preservesResourceReserve(player.resources, flat, p.reserveResources)) {
      return { type: 'fail', errorKey: 'log.payFail' }
    }
    payResources(player, flat)
    paySupplyTokens(player, flat)
    emitPaidEvent(eventSink, player, flat, p.costType, sourceCard, p.sourceActionId)
    if (sourceCard && shouldTrackSourceCardPaymentStats(p)) {
      addCardResourcePaid(player, sourceCard, flat)
      return { type: 'ok', resourcesPaid: flat }
    }
    return { type: 'ok', resourcesPaid: flat }
  },
  // Multi-solution payments emit a `prompt.selectPayment` choice from
  // `execute`; when the player picks a solution the engine routes the value
  // here so we can re-run the cost selection with `paymentChoice` set, this
  // time landing on the `selected` branch and actually mutating resources.
  // Without this hook the engine's fallthrough would return `{type:'ok'}`
  // without paying, leaving host action completion running on un-paid state.
  resolveChoice: ({ player, params, sourceCard, state, eventSink }, choice) => {
    const p = normalizePayParams(params)
    if (!p?.cost) return { type: 'fail', errorKey: 'log.payFail' }
    const optionPrefix = p.optionPrefix ?? 'pay:generic'
    const choiceLooksLikePayment =
      choice.startsWith(`${optionPrefix}:`) || /^\d+$/.test(choice)
    if (!PaymentSolver.isComplexCost(p.cost) && !(p.costType && p.reserveResources)) {
      return { type: 'ok' }
    }
    if (!PaymentSolver.isComplexCost(p.cost) && p.costType && p.reserveResources) {
      if (!choiceLooksLikePayment) {
        return payAction.execute({
          player,
          params,
          sourceCard,
          state,
          space: undefined as never,
          eventSink,
        })
      }
      const selection = resolveCostPaymentSelection(
        player,
        { fee: p.cost },
        optionPrefix,
        choice,
        { type: 'fail', errorKey: 'log.payFail' },
        {
          costType: p.costType,
          state,
          includeReturnedCard: p.includeReturnedCard,
          playedCards: p.playedCards,
          reserveResources: p.reserveResources,
        },
      )
      if (selection.type !== 'selected') {
        return selection
      }
      return buildSelectedResult(
        selection.solution,
        sourceCard,
        p.costType,
        player,
        state,
        p.includeReturnedCard,
        eventSink,
        p.sourceActionId,
        undefined,
        undefined,
        shouldTrackSourceCardPaymentStats(p),
      )
    }
    if (!PaymentSolver.isComplexCost(p.cost)) {
      return { type: 'fail', errorKey: 'log.payFail' }
    }
    // If the value isn't one of the payment-prefix options the player saw,
    // assume it's a stale/improvement-level choice that landed here because
    // game-core's pendingInteractionActionId now points at `pay` (vs the
    // improvement-any it would point at in the legacy mutate-in-place path).
    // Re-emit the same selectPayment prompt by re-invoking execute so the
    // player can pick again, matching BGA's "missed the prompt → ask again"
    // UX and keeping legacy D83-style upper-flow tests compatible.
    if (!choiceLooksLikePayment) {
      return payAction.execute({
        player,
        params,
        sourceCard,
        state,
        space: undefined as never,
        eventSink,
      })
    }
    const selection = resolvePayActionPaymentSelection(
      state,
      player,
      p.cost,
      optionPrefix,
      choice,
      { type: 'fail', errorKey: 'log.payFail' },
      {
        costType: p.costType,
        includeReturnedCard: p.includeReturnedCard,
        playedCards: p.playedCards,
        reserveResources: p.reserveResources,
        candidateMetadataByFeeIndex: p.candidateMetadataByFeeIndex,
        paymentResourceProviders: p.cost.paymentResourceProviders,
      },
    )
    if (selection.type !== 'selected') {
      return selection
    }
    return buildSelectedResult(
      selection.solution,
      sourceCard,
      p.costType,
      player,
      state,
      p.includeReturnedCard,
      eventSink,
      p.sourceActionId,
      p.candidateMetadataByFeeIndex,
      p.cost.paymentResourceProviders,
      shouldTrackSourceCardPaymentStats(p),
    )
  },
}
