import type { ActionDefinition, ActionExecutionResult, CardCostCandidateMetadata, GameState, InternalActionChild, InternalActionChildren, PaymentResourceMap, PlayerState, ComplexCost } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import type { PaymentInfo } from '../../cards/card-effects'
import { getMinorImprovement } from '../../cards/registry-display'
import { PaymentSolver } from '../payment'
import { returnCardToBoard } from '../../cards/helpers/return-card'
import { takeMajorImprovementFromSupply } from '../../cards/major/supply'
import { incMajorBuilt, incMinorBuilt, incOccupationBuilt, recordDraftPlayed } from '../../session/stats'
import { getMajorCard } from '../../cards/major'
import { getCardModifiers } from '../../cards/card-modifiers'
import { meetsCardPrerequisites } from '../../cards/helpers/prerequisites'
import { activateCardEffect } from './internal/activate-card-effect'
import { collectComputeChoiceCandidates } from '../../cards/card-listeners'
import { isMajorCardId } from '../../cards/helpers/card-type'
import { recordCardCostAttribution } from '../../cards/helpers/card-state'
import { buildInternalPayChild, paymentInfoFromPayResult, type PayChildOptions } from '../helpers/pay-child'
import {
  cardEffectHandChangedEvent,
  readPrivateHandChangeSourceCard,
} from '../../session/private-hand-events'
import {
  buildMajorImprovementOptions,
  buildMinorImprovementOptions,
  buildPlayableMinorOptions,
  canAffordInjectedImprovement,
  getMajorImprovementPreviewCostDetailed,
  getMinorImprovementPreviewCostDetailed,
  getPlayedCardsForCost,
  getPositiveResourceLog,
  isMajorImprovementPlayable,
  isMinorImprovementPlayable,
  isBlockedByMajorImprovementActionGate,
  parseImprovementChoice,
  type ResolvedMinorImprovement,
} from '../helpers/improvement-helpers'

// Re-export Playable predicates so existing external callers (game-core.ts,
// session tests) keep importing from `actions/effects/improvement`.
export { isMajorImprovementPlayable, isMinorImprovementPlayable }

export type ImprovementType = 'major' | 'minor'
const KNOWN_IMPROVEMENT_TYPES: readonly ImprovementType[] = ['major', 'minor']

export function readImprovementTypes(ctx?: {
  params?: unknown
  actionContext?: Record<string, unknown>
}): ImprovementType[] {
  const raw =
    (ctx?.params as { types?: unknown } | undefined)?.types ??
    (ctx?.actionContext?.types as unknown)
  if (!Array.isArray(raw)) return ['major', 'minor']
  const filtered = raw.filter(
    (v): v is ImprovementType =>
      typeof v === 'string' && (KNOWN_IMPROVEMENT_TYPES as readonly string[]).includes(v),
  )
  if (filtered.length === 0) return ['major', 'minor']
  return Array.from(new Set(filtered))
}

type ImprovementPlayMode = 'major' | 'minor' | 'any'
type SuccessfulImprovementResult = Extract<ActionExecutionResult, { type: 'ok' | 'flow' }>
type ImprovementCommitData = {
  improvementId: string
  kind: 'major' | 'minor'
  actionContext?: Record<string, unknown>
}

const resolveImprovementActionCardId = (_mode: ImprovementPlayMode) => 'improvement'

const privateHandChangeContext = (
  actionCardId: string | undefined,
  kind: 'major' | 'minor',
  improvementId: string,
  trueAction?: boolean,
): Record<string, unknown> | undefined => {
  const context = trueAction === false ? { trueAction: false } as Record<string, unknown> : undefined
  if (
    kind === 'minor'
    && actionCardId
    && actionCardId !== improvementId
    && actionCardId !== 'improvement'
  ) {
    return {
      ...(context ?? {}),
      privateHandChangeSourceCard: actionCardId,
    }
  }
  return context
}

const readTrueAction = (
  params?: unknown,
  actionContext?: Record<string, unknown>,
) =>
  ((params as { trueAction?: boolean } | undefined)?.trueAction === false ||
    actionContext?.trueAction === false)
    ? false
    : undefined

const attachImprovementPayment = (
  result: SuccessfulImprovementResult,
  improvementId: string,
  resourcesPaid: NonNullable<PaymentInfo['resourcesPaid']>,
  returnedCardId?: string,
): SuccessfulImprovementResult => {
  result.extraData = {
    ...(result.extraData ?? {}),
    improvementPayment: {
      improvementId,
      resourcesPaid: getPositiveResourceLog(resourcesPaid) ?? {},
      ...(returnedCardId ? { returnedCardId } : {}),
    },
  }
  return result
}

const applyMajorImprovementPurchase = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  returnedMajorId?: string,
): void => {
  if (returnedMajorId) {
    returnCardToBoard(player, returnedMajorId, state)
  }

  if (!player.improvements.includes(improvementId)) {
    player.improvements.push(improvementId)
  }
  incMajorBuilt(player)
  takeMajorImprovementFromSupply(state, improvementId)
}

type ApplyMinorResult =
  | { passing: true; nextPlayer: PlayerState }
  | { passing: false }

const applyMinorImprovementPurchase = (
  state: GameState,
  player: PlayerState,
  improvement: ResolvedMinorImprovement,
  returnedCardId?: string,
): ApplyMinorResult => {
  if (returnedCardId) {
    returnCardToBoard(player, returnedCardId, state)
  }

  player.minorHand = player.minorHand.filter((id) => id !== improvement.id)
  if (improvement.passing === true) {
    const idx = state.players.findIndex((p) => p.id === player.id)
    const nextPlayer = state.players[(idx + 1) % state.players.length]
    nextPlayer.minorHand = nextPlayer.minorHand ?? []
    if (!nextPlayer.minorHand.includes(improvement.id)) {
      nextPlayer.minorHand.push(improvement.id)
    }
    return { passing: true, nextPlayer }
  }

  if (!player.minorPlayed.includes(improvement.id)) {
    player.minorPlayed.push(improvement.id)
  }
  incMinorBuilt(player)
  recordDraftPlayed(player, improvement.id, state.round)

  // D25 multi-identity: providesOccupation → also count as an occupation.
  if (improvement.providesOccupation) {
    player.extraOccupationsFromCards = player.extraOccupationsFromCards ?? []
    if (!player.extraOccupationsFromCards.includes(improvement.id)) {
      player.extraOccupationsFromCards.push(improvement.id)
      incOccupationBuilt(player)
    }
  }

  getCardModifiers(improvement.id).forEach((modifier) => {
    if (!player.activeModifiers.some((m) => JSON.stringify(m) === JSON.stringify(modifier))) {
      player.activeModifiers.push(modifier)
    }
  })
  return { passing: false }
}

const commitImprovementPurchase = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  kind: 'major' | 'minor',
  paymentInfo: PaymentInfo,
  actionContext?: Record<string, unknown>,
  emitPrivateEvent?: (event: ReturnType<typeof cardEffectHandChangedEvent>) => void,
  eventSink?: EventSink,
): SuccessfulImprovementResult => {
  const costResources = paymentInfo.resourcesPaid ?? {}
  const wasMinorInHand = kind === 'minor' && player.minorHand.includes(improvementId)
  let passResult: ApplyMinorResult | null = null
  if (kind === 'major') {
    applyMajorImprovementPurchase(state, player, improvementId, paymentInfo.returnedCardId)
  } else {
    const improvement = getMinorImprovement(improvementId)
    if (!improvement) return { type: 'ok' }
    passResult = applyMinorImprovementPurchase(state, player, improvement, paymentInfo.returnedCardId)
  }
  const handChangeSourceCard = readPrivateHandChangeSourceCard(actionContext, improvementId)
  if (wasMinorInHand && handChangeSourceCard) {
    emitPrivateEvent?.(cardEffectHandChangedEvent(
      player.id,
      [improvementId],
      'minor',
      handChangeSourceCard,
    ))
  }
  if (passResult && passResult.passing) {
    eventSink?.emit<'card.passed'>({
      type: 'card.passed',
      cardId: improvementId,
      fromPlayerId: player.id,
      toPlayerId: passResult.nextPlayer.id,
      sourceActionId: 'improvement',
      sourceCardId: improvementId,
    })
  } else {
    eventSink?.emit<'card.played'>({
      type: 'card.played',
      cardId: improvementId,
      cardType: kind,
      sourceActionId: 'improvement',
      sourceCardId: improvementId,
    })
  }
  return attachImprovementPayment({ type: 'ok' }, improvementId, costResources, paymentInfo.returnedCardId)
}

const finalizeMajorImprovementPurchase = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  paymentInfo: PaymentInfo,
  costResources: NonNullable<PaymentInfo['resourcesPaid']>,
  returnedMajorId?: string,
): ActionExecutionResult => {
  applyMajorImprovementPurchase(state, player, improvementId, returnedMajorId)

  const activation = activateCardEffect(state, player, improvementId, 'onBuy', paymentInfo)
  const result: SuccessfulImprovementResult =
    activation.type === 'flow' ? activation : { type: 'ok' }

  return attachImprovementPayment(result, improvementId, costResources, returnedMajorId)
}

const finalizeMinorImprovementPurchase = (
  state: GameState,
  player: PlayerState,
  improvement: ResolvedMinorImprovement,
  paymentInfo: PaymentInfo,
  costResources: NonNullable<PaymentInfo['resourcesPaid']>,
  returnedCardId?: string,
): ActionExecutionResult => {
  applyMinorImprovementPurchase(state, player, improvement, returnedCardId)

  const activation = activateCardEffect(state, player, improvement.id, 'onBuy', paymentInfo)
  if (activation.type === 'flow') {
    return attachImprovementPayment(
      activation,
      improvement.id,
      costResources,
      returnedCardId,
    )
  }

  return attachImprovementPayment({
    type: 'ok',
  }, improvement.id, costResources, returnedCardId)
}

const readImprovementCommitData = (
  result: Extract<ActionExecutionResult, { type: 'ok' }>,
): ImprovementCommitData | null => {
  const raw = result.extraData?.improvementCommit
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  if (typeof data.improvementId !== 'string') return null
  if (data.kind !== 'major' && data.kind !== 'minor') return null
  return {
    improvementId: data.improvementId,
    kind: data.kind,
    actionContext: data.actionContext && typeof data.actionContext === 'object'
      ? data.actionContext as Record<string, unknown>
      : undefined,
  }
}

const buildImprovementPayChild = (
  payParams: PayChildOptions,
  payActionContext: Record<string, unknown>,
  sourceCard: string,
): InternalActionChild => {
  return buildInternalPayChild({
    ...payParams,
    sourceCard,
    actionContext: payActionContext,
  })
}

const resolveImprovementPayment = (
  state: GameState,
  playerIndex: number,
  player: PlayerState,
  cost: PaymentResourceMap | ComplexCost,
  actionId: 'improvement-major' | 'improvement-minor' | 'improvement-any',
  paymentChoice: string | undefined,
  optionValuePrefix: string,
  includeReturnedCard: boolean,
  failure: ActionExecutionResult,
  playedCards?: string[],
  improvementId?: string,
  candidateMetadataByFeeIndex?: Record<number, CardCostCandidateMetadata>,
):
  | ActionExecutionResult
  | {
      type: 'selected'
      resourcesPaid: PaymentResourceMap
      feeIndex?: number
      originalFeeIndex?: number
      returnedCardId?: string
    } => {
  const effectiveState = playerIndex >= 0 ? state : { ...state, players: [player] }
  const effectiveIndex = playerIndex >= 0 ? playerIndex : 0
  const paymentResourceProviders = PaymentSolver.isComplexCost(cost)
    ? cost.paymentResourceProviders
    : undefined
  const resolved = PaymentSolver.resolvePayment(effectiveState, effectiveIndex, cost, {
    actionId,
    costType: 'none',
    sourceCard: improvementId,
    playedCards,
    optionPrefix: optionValuePrefix,
    paymentChoice,
    includeReturnedCard,
    candidateMetadataByFeeIndex,
    paymentResourceProviders,
  })
  if (resolved.type === 'request') {
    return resolved.request
  }
  if (resolved.type === 'failed') {
    return failure
  }
  recordCardCostAttribution(player, resolved.receipt.costAttribution)
  return {
    type: 'selected',
    resourcesPaid: resolved.receipt.resourcesPaid,
    feeIndex: resolved.receipt.feeIndex,
    originalFeeIndex: resolved.receipt.originalFeeIndex,
    returnedCardId: resolved.receipt.returnedCardId,
  }
}

const playMajorImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
  paymentChoice?: string,
): ActionExecutionResult => {
  const improvement = getMajorCard(improvementId)
  if (!improvement) {
    return { type: 'fail', errorKey: 'log.improvementFail' }
  }
  if (!state.availableMajorImprovements.includes(improvement.id)) {
    return { type: 'fail', errorKey: 'log.improvementFail' }
  }

  const previewCost = getMajorImprovementPreviewCostDetailed(
    state,
    player,
    improvementId,
    actionCardId,
  )
  const cost = previewCost?.cost ?? {}
  const resolvedPayment = resolveImprovementPayment(
    state,
    state.players.indexOf(player),
    player,
    cost,
    'improvement-major',
    paymentChoice,
    `pay:${improvementId}`,
    true,
    { type: 'fail', errorKey: 'log.improvementFail' },
    getPlayedCardsForCost(player, cost),
    improvementId,
    previewCost?.candidateMetadataByFeeIndex,
  )
  if (resolvedPayment.type !== 'selected') {
    return resolvedPayment
  }
  const paymentInfo: PaymentInfo = {
    resourcesPaid: resolvedPayment.resourcesPaid,
    feeIndex: resolvedPayment.feeIndex,
    originalFeeIndex: resolvedPayment.originalFeeIndex,
    returnedCardId: resolvedPayment.returnedCardId,
  }
  return finalizeMajorImprovementPurchase(
    state,
    player,
    improvement.id,
    paymentInfo,
    resolvedPayment.resourcesPaid,
    resolvedPayment.returnedCardId,
  )
}

export const playMinorImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  actionCardId?: string,
  paymentChoice?: string,
  playContext: 'minorAction' | 'cardEffect' | 'setup' = 'minorAction',
  types?: readonly ImprovementType[],
): ActionExecutionResult => {
  const improvement = getMinorImprovement(improvementId)
  if (!improvement) {
    return { type: 'fail', errorKey: 'log.minorImprovementFail' }
  }
  if (improvement.mustBePlayedViaMinorAction && playContext !== 'minorAction') {
    return { type: 'fail', errorKey: 'log.minorImprovementRequiresMinorAction' }
  }
  const effectiveTypes = types ?? (actionCardId === 'minor-improvement' ? (['minor'] as const) : undefined)
  if (isBlockedByMajorImprovementActionGate(improvement, effectiveTypes)) {
    return { type: 'fail', errorKey: 'log.minorImprovementFail' }
  }
  if (!player.minorHand.includes(improvement.id)) {
    return { type: 'fail', errorKey: 'log.minorImprovementFail' }
  }
  if (!meetsCardPrerequisites(player, improvement, state.round, state)) {
    return { type: 'fail', errorKey: 'log.minorImprovementFail' }
  }
  const targetImprovement: ResolvedMinorImprovement = improvement
  const previewCost = getMinorImprovementPreviewCostDetailed(
    state,
    player,
    improvementId,
    actionCardId,
  )
  if (!previewCost) {
    return { type: 'fail', errorKey: 'log.minorImprovementFail' }
  }
  const modifiedCost = previewCost.cost

  const resolvedPayment = resolveImprovementPayment(
    state,
    state.players.indexOf(player),
    player,
    modifiedCost,
    'improvement-minor',
    paymentChoice,
    `pay:minor:${improvementId}`,
    !!(PaymentSolver.isComplexCost(modifiedCost) && modifiedCost.cards?.list?.length),
    { type: 'fail', errorKey: 'log.minorImprovementFail' },
    getPlayedCardsForCost(player, modifiedCost),
    improvementId,
    previewCost.candidateMetadataByFeeIndex,
  )
  if (resolvedPayment.type !== 'selected') {
    return resolvedPayment
  }
  const paymentInfo: PaymentInfo = {
    resourcesPaid: resolvedPayment.resourcesPaid,
    feeIndex: resolvedPayment.feeIndex,
    originalFeeIndex: resolvedPayment.originalFeeIndex,
    returnedCardId: resolvedPayment.returnedCardId,
  }
  return finalizeMinorImprovementPurchase(
    state,
    player,
    targetImprovement,
    paymentInfo,
    resolvedPayment.resourcesPaid,
    resolvedPayment.returnedCardId,
  )
}

export const playImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  mode: ImprovementPlayMode = 'major',
  paymentChoice?: string,
  sourceCard?: string,
): ActionExecutionResult => {
  // Payment choice can arrive as either paymentChoice param (direct call)
  // or as improvementId (via resolveChoice which passes choice as first arg)
  const payValue = paymentChoice?.startsWith('pay:') ? paymentChoice
    : improvementId.startsWith('pay:') ? improvementId
    : undefined
  if (payValue) {
    const parts = payValue.split(':')
    const actionCardId = sourceCard ?? resolveImprovementActionCardId(mode)
    if (parts[1] === 'minor') {
      const minorId = parts[2]
      const choiceIdx = parts[3]
      if (minorId && choiceIdx !== undefined) {
        return playMinorImprovement(state, player, minorId, actionCardId, choiceIdx)
      }
    }
    const targetId = parts[1]
    const choiceIdx = parts[2]
    if (targetId && choiceIdx !== undefined) {
      const parsed = parseImprovementChoice(targetId)
      if (parsed.kind === 'major') {
        return playMajorImprovement(state, player, parsed.id, actionCardId, choiceIdx)
      }
    }
  }

  const parsed = parseImprovementChoice(improvementId)
  const allowMajor = mode === 'major' || mode === 'any'
  const allowMinor = mode === 'minor' || mode === 'any'
  const effectiveActionCardId = sourceCard ?? resolveImprovementActionCardId(mode)

  if (parsed.kind === 'major') {
    if (!allowMajor) return { type: 'fail', errorKey: 'log.improvementFail' }
    return playMajorImprovement(state, player, parsed.id, effectiveActionCardId)
  }
  if (parsed.kind === 'minor') {
    if (!allowMinor) return { type: 'fail', errorKey: 'log.minorImprovementFail' }
    return playMinorImprovement(state, player, parsed.id, effectiveActionCardId)
  }

  const majorImprovement = allowMajor && isMajorCardId(parsed.id)
    ? getMajorCard(parsed.id)
    : undefined
  if (majorImprovement) {
    return playMajorImprovement(state, player, parsed.id, effectiveActionCardId)
  }
  if (allowMinor) {
    return playMinorImprovement(state, player, parsed.id, effectiveActionCardId)
  }
  return { type: 'fail', errorKey: 'log.improvementFail' }
}

const buildImprovementInternalChildren = (
  state: GameState,
  player: PlayerState,
  choice: string,
  actionCardId: string,
  trueAction?: boolean,
  _types?: readonly ImprovementType[],
): InternalActionChildren | null => {
  const parsed = parseImprovementChoice(choice)
  let kind: 'major' | 'minor'
  let id: string
  if (parsed.kind === 'major') {
    kind = 'major'
    id = parsed.id
  } else if (parsed.kind === 'minor') {
    kind = 'minor'
    id = parsed.id
  } else {
    if (isMajorCardId(parsed.id)) {
      kind = 'major'
      id = parsed.id
    } else if (getMinorImprovement(parsed.id)) {
      kind = 'minor'
      id = parsed.id
    } else {
      return null
    }
  }
  const previewCost = kind === 'major'
    ? getMajorImprovementPreviewCostDetailed(state, player, id, actionCardId)
    : getMinorImprovementPreviewCostDetailed(state, player, id, actionCardId)
  if (!previewCost) return null
  const cost = previewCost.cost
  const optionPrefix = kind === 'major' ? `pay:improvement:${id}` : `pay:improvement:minor:${id}`
  const includeReturnedCard = PaymentSolver.isComplexCost(cost) && !!cost.cards?.list?.length
  const costType = kind === 'major' ? 'major-improvement' : 'minor-improvement'
  const playedCards = getPlayedCardsForCost(player, cost)
  const payParams: PayChildOptions = {
    cost,
    costType,
    optionPrefix,
    includeReturnedCard,
    playedCards,
    candidateMetadataByFeeIndex: previewCost.candidateMetadataByFeeIndex,
  }
  const payActionContext: Record<string, unknown> = {
    costType,
    improvementKind: kind,
  }
  const actionContext = privateHandChangeContext(actionCardId, kind, id, trueAction)
  if (actionContext) {
    Object.assign(payActionContext, actionContext)
  }
  return {
    beforeHostListeners: [
      buildImprovementPayChild(payParams, payActionContext, id),
    ],
    afterHostCommitListeners: [
      {
        actionId: 'activate-card-effect',
        sourceCard: id,
        params: { cardId: id, hook: 'onBuy' },
        actionContext,
        paymentInfoFrom: 'payment',
      },
    ],
  }
}

export const improvementAction: ActionDefinition = {
  id: 'improvement',
  nameKey: 'actions.improvement.name',
  descriptionKey: 'actions.improvement.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player, context) => {
    const types = readImprovementTypes(context)
    const allowedMajor = types.includes('major')
    const allowedMinor = types.includes('minor')
    const isMinorOnly = types.length === 1 && types[0] === 'minor'
    if (allowedMajor &&
      buildMajorImprovementOptions(state.availableMajorImprovements, state, player, context?.sourceCard).length > 0) {
      return true
    }
    if (allowedMinor) {
      const minorOpts = isMinorOnly
        ? buildPlayableMinorOptions(state, player, context?.sourceCard, types)
        : buildMinorImprovementOptions(state, player, context?.sourceCard, undefined, types)
      if (minorOpts.length > 0) return true
      const extras = collectComputeChoiceCandidates(
        state,
        player,
        'improvement',
        { ...(context?.actionContext ?? {}), types },
        context?.sourceCard,
      )
      if (extras.some((opt) => canAffordInjectedImprovement(state, player, opt.value))) {
        return true
      }
    }
    return false
  },
  execute: ({ state, player, sourceCard, params, actionContext }) => {
    const types = readImprovementTypes({ params, actionContext })
    const actionCardId = sourceCard ?? 'improvement'
    const isMinorOnly = types.length === 1 && types[0] === 'minor'
    const allowedPurchases = Array.isArray((params as { allowedPurchases?: string[] } | undefined)?.allowedPurchases)
      ? (params as { allowedPurchases?: string[] }).allowedPurchases
      : undefined
    const majorOpts = types.includes('major')
      ? buildMajorImprovementOptions(state.availableMajorImprovements, state, player, actionCardId, allowedPurchases)
      : []
    const baseMinor = types.includes('minor')
      ? (isMinorOnly
          ? buildPlayableMinorOptions(state, player, actionCardId, types)
          : buildMinorImprovementOptions(state, player, actionCardId, allowedPurchases, types))
      : []
    const extras = types.includes('minor')
      ? collectComputeChoiceCandidates(
          state,
          player,
          'improvement',
          { ...(actionContext ?? {}), types },
          sourceCard,
        )
      : []
    const seen = new Set(baseMinor.map((o) => o.value))
    const extraMinor = extras
      .filter((o) => !seen.has(o.value))
      .filter((o) => canAffordInjectedImprovement(state, player, o.value))
    const options = [...majorOpts, ...baseMinor, ...extraMinor]
    if (options.length === 0) {
      return types.includes('major')
        ? { type: 'fail', errorKey: 'log.improvementFail' }
        : { type: 'ok' }
    }
    return {
      type: 'request',
      request: { kind: 'choice', options },
      promptKey: 'ui.interactionChooseImprovement',
    }
  },
  resolveChoice: ({ state, player, sourceCard, params, actionContext }, choice) => {
    const actionCardId = sourceCard ?? 'improvement'
    const internalChildren = buildImprovementInternalChildren(
      state,
      player,
      choice,
      actionCardId,
      readTrueAction(params, actionContext),
      readImprovementTypes({ params, actionContext }),
    )
    if (!internalChildren) return { type: 'fail', errorKey: 'log.improvementFail' }
    const parsed = parseImprovementChoice(choice)
    const improvementId = parsed.kind === 'major' || parsed.kind === 'minor'
      ? parsed.id
      : choice
    const kind = parsed.kind === 'major' || parsed.kind === 'minor'
      ? parsed.kind
      : isMajorCardId(parsed.id) ? 'major' : 'minor'
    const actionContextForCommit = privateHandChangeContext(
      actionCardId,
      kind,
      improvementId,
      readTrueAction(params, actionContext),
    )
    return {
      type: 'ok',
      extraData: {
        improvementCommit: {
          improvementId,
          kind,
          ...(actionContextForCommit ? { actionContext: actionContextForCommit } : {}),
        },
      },
      internalChildren,
    }
  },
  completeInternalChildren: ({ state, player, emitPrivateEvent, eventSink }, result, internalResults) => {
    const data = readImprovementCommitData(result)
    if (!data) return result
    const paymentInfo = paymentInfoFromPayResult(internalResults.payment)
    if (!paymentInfo) return result
    return commitImprovementPurchase(
      state,
      player,
      data.improvementId,
      data.kind,
      paymentInfo,
      data.actionContext,
      emitPrivateEvent,
      eventSink,
    ) as Extract<ActionExecutionResult, { type: 'ok' }>
  },
}
