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
  PlayerState,
  Resource,
} from '../../contract/types'
import type { EventSink, PaymentPurpose, ResourceLocation } from '../../contract/events'
import { addCardResourcePaid, recordCardCostAttribution } from '../../cards/helpers/card-state'
import { PaymentSolver } from '../payment'
import type { PaymentCtx, PaymentReceipt } from '../payment'
import { returnCardToBoard } from '../../cards/helpers/return-card'
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

const shouldTrackSourceCardPaymentStats = (p: PayParams): boolean =>
  p.trackSourceCardPaymentStats ?? p.costType === undefined

const buildPaymentCtx = (
  p: PayParams,
  paymentChoice = p.paymentChoice,
): PaymentCtx => ({
  actionId: 'pay',
  costType: p.costType ?? 'none',
  playedCards: p.playedCards,
  optionPrefix: p.optionPrefix ?? 'pay:generic',
  paymentChoice,
  includeReturnedCard: p.includeReturnedCard,
  reserveResources: p.reserveResources,
  candidateMetadataByFeeIndex: p.candidateMetadataByFeeIndex,
  paymentResourceProviders: PaymentSolver.isComplexCost(p.cost)
    ? p.cost.paymentResourceProviders
    : undefined,
})

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
  receipt: PaymentReceipt,
  sourceCard: string | undefined,
  costType: CostModifierType | undefined,
  player: import('../../contract/types').PlayerState,
  state: import('../../contract/types').GameState,
  eventSink?: EventSink,
  sourceActionId?: string,
  trackSourceCardPaymentStats = costType === undefined,
): ActionExecutionResult => {
  if (receipt.returnedCardId) {
    returnCardToBoard(player, receipt.returnedCardId, state)
  }
  const resourcesPaid = receipt.resourcesPaid
  if (sourceCard && trackSourceCardPaymentStats) {
    addCardResourcePaid(player, sourceCard, resourcesPaid)
  }
  emitPaidEvent(eventSink, player, resourcesPaid, costType, sourceCard, sourceActionId, {
    bonusUsed: receipt.bonusUsed,
    bonusChoiceIndex: receipt.bonusChoiceIndex,
    returnedCardId: receipt.returnedCardId,
    candidateSources: receipt.candidateSources,
    paymentResourceProviders: receipt.paymentResourceProviders as CardProvidedPaymentResourceProvider[] | undefined,
  })
  recordCardCostAttribution(player, receipt.costAttribution)
  const extraData: Record<string, unknown> = {
    resourcesPaid,
    bonusUsed: receipt.bonusUsed
      ? receipt.bonusUsed.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [],
  }
  if (receipt.bonusChoiceIndex) {
    extraData.bonusChoiceIndex = receipt.bonusChoiceIndex
  }
  if (receipt.returnedCardId) {
    extraData.returnedCardId = receipt.returnedCardId
  }
  if (receipt.feeIndex !== undefined) {
    extraData.feeIndex = receipt.feeIndex
  }
  if (receipt.originalFeeIndex !== undefined) {
    extraData.originalFeeIndex = receipt.originalFeeIndex
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
      const playerIndex = state.players.indexOf(player)
      const effectiveState = playerIndex >= 0 ? state : buildSingletonState(player)
      const effectiveIndex = playerIndex >= 0 ? playerIndex : 0
      return PaymentSolver.hasPaymentOption(
        effectiveState,
        effectiveIndex,
        p.cost,
        buildPaymentCtx(p),
      )
    },
  },
  execute: ({ player, params, sourceCard, state, eventSink }) => {
    const p = normalizePayParams(params)
    if (!p?.cost) return { type: 'fail', errorKey: 'log.payFail' }
    const playerIndex = state.players.indexOf(player)
    const effectiveState = playerIndex >= 0 ? state : buildSingletonState(player)
    const effectiveIndex = playerIndex >= 0 ? playerIndex : 0
    const resolved = PaymentSolver.resolvePayment(
      effectiveState,
      effectiveIndex,
      p.cost,
      buildPaymentCtx(p),
    )
    if (resolved.type === 'request') return resolved.request
    if (resolved.type === 'failed') return { type: 'fail', errorKey: 'log.payFail' }
    return buildSelectedResult(
      resolved.receipt,
      sourceCard,
      p.costType,
      player,
      state,
      eventSink,
      p.sourceActionId,
      shouldTrackSourceCardPaymentStats(p),
    )
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
    if (!PaymentSolver.isComplexCost(p.cost) && !p.costType) {
      return { type: 'ok' }
    }
    if (!PaymentSolver.isComplexCost(p.cost) && p.costType) {
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
      const playerIndex = state.players.indexOf(player)
      const effectiveState = playerIndex >= 0 ? state : buildSingletonState(player)
      const effectiveIndex = playerIndex >= 0 ? playerIndex : 0
      const resolved = PaymentSolver.resolvePayment(
        effectiveState,
        effectiveIndex,
        p.cost,
        buildPaymentCtx(p, choice),
      )
      if (resolved.type === 'request') return resolved.request
      if (resolved.type === 'failed') return { type: 'fail', errorKey: 'log.payFail' }
      return buildSelectedResult(
        resolved.receipt,
        sourceCard,
        p.costType,
        player,
        state,
        eventSink,
        p.sourceActionId,
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
    const playerIndex = state.players.indexOf(player)
    const effectiveState = playerIndex >= 0 ? state : buildSingletonState(player)
    const effectiveIndex = playerIndex >= 0 ? playerIndex : 0
    const resolved = PaymentSolver.resolvePayment(
      effectiveState,
      effectiveIndex,
      p.cost,
      buildPaymentCtx(p, choice),
    )
    if (resolved.type === 'request') return resolved.request
    if (resolved.type === 'failed') return { type: 'fail', errorKey: 'log.payFail' }
    return buildSelectedResult(
      resolved.receipt,
      sourceCard,
      p.costType,
      player,
      state,
      eventSink,
      p.sourceActionId,
      shouldTrackSourceCardPaymentStats(p),
    )
  },
}
