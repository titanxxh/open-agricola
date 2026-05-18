import type { ActionDefinition, ActionExecutionResult, ActionFlow, GameState, PlayerState, ComplexCost } from '../../contract/types'
import type { PaymentInfo } from '../../cards/card-effects'
import { getMinorImprovement } from '../../cards/registry-display'
// PaymentSolver namespace (S3 Task 6): core payment APIs migrated to the
// new payment module. Legacy helpers (payResources / executePaymentSolution
// / resolvePaymentSolutionSelection) remain on the shim through S3 and
// migrate in S4 (preview-cost domain aggregation per Decision C).
import { PaymentSolver } from '../payment'
import type { PaymentCtx } from '../payment'
import { payResources, executePaymentSolution } from '../payment/internal'
import { returnCardToBoard } from '../../cards/helpers/return-card'
import { incMajorBuilt, incMinorBuilt, incOccupationBuilt, recordDraftPlayed } from '../../session/stats'
import { getMajorCard } from '../../cards/major'
import { getCardModifiers } from '../../cards/card-modifiers'
import { meetsCardPrerequisites } from '../../cards/helpers/prerequisites'
import { activateCard } from './activate-card'
import { resolvePaymentSolutionSelection } from '../payment/internal'
import { collectComputeChoiceCandidates } from '../../cards/card-listeners'
import { isMajorCardId } from '../../cards/helpers/card-type'
import {
  buildImprovementImmediateLogs,
  buildMajorImprovementOptions,
  buildMinorImprovementOptions,
  buildPlayableMinorOptions,
  canAffordInjectedImprovement,
  getMajorImprovementPreviewCost,
  getMinorImprovementPreviewCost,
  getPlayedCardsForCost,
  getPositiveResourceLog,
  isMajorImprovementPlayable,
  isMinorImprovementPlayable,
  isBlockedByMajorImprovementActionGate,
  parseImprovementChoice,
  readActionBonusSources,
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

const resolveImprovementActionCardId = (_mode: ImprovementPlayMode) => 'improvement'

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

const finalizeMajorImprovementPurchase = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  paymentInfo: PaymentInfo,
  costResources: NonNullable<PaymentInfo['resourcesPaid']>,
  returnedMajorId?: string,
): ActionExecutionResult => {
  const immediateLogs = buildImprovementImmediateLogs(
    'major',
    improvementId,
    costResources,
    {
      returnedCards: returnedMajorId ? [returnedMajorId] : undefined,
      bonusSources: readActionBonusSources(player),
    },
  )

  if (returnedMajorId) {
    returnCardToBoard(player, returnedMajorId, state)
  }

  player.improvements.push(improvementId)
  incMajorBuilt(player)
  state.availableMajorImprovements = state.availableMajorImprovements.filter(
    (id) => id !== improvementId,
  )

  const activation = activateCard(state, player, improvementId, 'onBuy', paymentInfo)
  const result: SuccessfulImprovementResult =
    activation.type === 'flow' ? activation : { type: 'ok' }

  result.immediateLogs = [...immediateLogs, ...(result.immediateLogs ?? [])]

  if (result.type === 'ok') {
    result.logKey = 'log.playImprovement'
    result.logParams = immediateLogs[0]?.params as Record<string, unknown>
  }
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
  const immediateLogs = buildImprovementImmediateLogs(
    'minor',
    improvement.id,
    costResources,
    {
      returnedCards: returnedCardId ? [returnedCardId] : undefined,
      bonusSources: readActionBonusSources(player),
    },
  )

  if (returnedCardId) {
    returnCardToBoard(player, returnedCardId, state)
  }

  player.minorHand = player.minorHand.filter((id) => id !== improvement.id)
  player.minorPlayed.push(improvement.id)
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

  const activation = activateCard(state, player, improvement.id, 'onBuy', paymentInfo)
  if (activation.type === 'flow') {
    activation.immediateLogs = [...immediateLogs, ...(activation.immediateLogs ?? [])]
    return attachImprovementPayment(
      activation,
      improvement.id,
      costResources,
      returnedCardId,
    )
  }

  return attachImprovementPayment({
    type: 'ok',
    immediateLogs,
    logKey: 'log.playMinorImprovement',
    logParams: immediateLogs[0]?.params as Record<string, unknown>,
  }, improvement.id, costResources, returnedCardId)
}

const resolveImprovementPayment = (
  state: GameState,
  playerIndex: number,
  player: PlayerState,
  cost: Partial<PlayerState['resources']> | ComplexCost,
  actionId: 'improvement-major' | 'improvement-minor' | 'improvement-any',
  paymentChoice: string | undefined,
  optionValuePrefix: string,
  includeReturnedCard: boolean,
  failure: ActionExecutionResult,
  playedCards?: string[],
  improvementId?: string,
):
  | ActionExecutionResult
  | {
      type: 'selected'
      resourcesPaid: Partial<PlayerState['resources']>
      feeIndex?: number
      returnedCardId?: string
    } => {
  const effectiveState = playerIndex >= 0 ? state : { ...state, players: [player] }
  const effectiveIndex = playerIndex >= 0 ? playerIndex : 0
  const ctx: PaymentCtx = {
    actionId,
    costType: 'none',
    sourceCard: improvementId,
    playedCards,
  }
  if (!PaymentSolver.isComplexCost(cost)) {
    if (!PaymentSolver.canAfford(effectiveState, effectiveIndex, cost, ctx)) {
      return failure
    }
    payResources(player, cost)
    return { type: 'selected', resourcesPaid: cost }
  }

  const solutions = PaymentSolver.computeOptions(effectiveState, effectiveIndex, cost, ctx)
  const resolved = resolvePaymentSolutionSelection(
    solutions,
    paymentChoice,
    optionValuePrefix,
    includeReturnedCard,
    failure,
  )
  if (resolved.type !== 'selected') {
    return resolved
  }

  const returnedCardId = executePaymentSolution(player, resolved.solution)
  return {
    type: 'selected',
    resourcesPaid: resolved.solution.resourcesPaid,
    feeIndex: resolved.solution.feeIndex,
    returnedCardId,
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
    return { type: 'fail', logKey: 'log.improvementFail' }
  }
  if (!state.availableMajorImprovements.includes(improvement.id)) {
    return { type: 'fail', logKey: 'log.improvementFail' }
  }

  const cost = getMajorImprovementPreviewCost(state, player, improvementId, actionCardId) ?? {}
  const resolvedPayment = resolveImprovementPayment(
    state,
    state.players.indexOf(player),
    player,
    cost,
    'improvement-major',
    paymentChoice,
    `pay:${improvementId}`,
    true,
    { type: 'fail', logKey: 'log.improvementFail' },
    getPlayedCardsForCost(player, cost),
    improvementId,
  )
  if (resolvedPayment.type !== 'selected') {
    return resolvedPayment
  }
  const paymentInfo: PaymentInfo = {
    resourcesPaid: resolvedPayment.resourcesPaid,
    feeIndex: resolvedPayment.feeIndex,
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
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  if (improvement.mustBePlayedViaMinorAction && playContext !== 'minorAction') {
    return { type: 'fail', logKey: 'log.minorImprovementRequiresMinorAction' }
  }
  const effectiveTypes = types ?? (actionCardId === 'minor-improvement' ? (['minor'] as const) : undefined)
  if (isBlockedByMajorImprovementActionGate(improvement, effectiveTypes)) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  if (!player.minorHand.includes(improvement.id)) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  if (!meetsCardPrerequisites(player, improvement, state.round, state)) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }
  const targetImprovement: ResolvedMinorImprovement = improvement
  const modifiedCost = getMinorImprovementPreviewCost(state, player, improvementId, actionCardId)
  if (!modifiedCost) {
    return { type: 'fail', logKey: 'log.minorImprovementFail' }
  }

  const resolvedPayment = resolveImprovementPayment(
    state,
    state.players.indexOf(player),
    player,
    modifiedCost,
    'improvement-minor',
    paymentChoice,
    `pay:minor:${improvementId}`,
    !!(PaymentSolver.isComplexCost(modifiedCost) && modifiedCost.cards?.list?.length),
    { type: 'fail', logKey: 'log.minorImprovementFail' },
    getPlayedCardsForCost(player, modifiedCost),
    improvementId,
  )
  if (resolvedPayment.type !== 'selected') {
    return resolvedPayment
  }
  const paymentInfo: PaymentInfo = {
    resourcesPaid: resolvedPayment.resourcesPaid,
    feeIndex: resolvedPayment.feeIndex,
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
    if (!allowMajor) return { type: 'fail', logKey: 'log.improvementFail' }
    return playMajorImprovement(state, player, parsed.id, effectiveActionCardId)
  }
  if (parsed.kind === 'minor') {
    if (!allowMinor) return { type: 'fail', logKey: 'log.minorImprovementFail' }
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
  return { type: 'fail', logKey: 'log.improvementFail' }
}

const buildImprovementFlow = (
  state: GameState,
  player: PlayerState,
  choice: string,
  actionCardId: string,
  trueAction?: boolean,
  _types?: readonly ImprovementType[],
): ActionFlow | null => {
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
    ? getMajorImprovementPreviewCost(state, player, id, actionCardId)
    : getMinorImprovementPreviewCost(state, player, id, actionCardId)
  if (!previewCost) return null
  const optionPrefix = kind === 'major' ? `pay:improvement:${id}` : `pay:improvement:minor:${id}`
  const includeReturnedCard = PaymentSolver.isComplexCost(previewCost) && !!previewCost.cards?.list?.length
  const costType = kind === 'major' ? 'major-improvement' : 'minor-improvement'
  const playedCards = getPlayedCardsForCost(player, previewCost)
  const payParams: Record<string, unknown> = {
    cost: previewCost,
    costType,
    optionPrefix,
    includeReturnedCard,
    playedCards,
  }
  const payActionContext: Record<string, unknown> = {
    costType,
    improvementKind: kind,
  }
  const actionContext = trueAction === false ? { trueAction: false } : undefined
  if (actionContext) {
    Object.assign(payActionContext, actionContext)
  }
  return {
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'pay',
        sourceCard: id,
        params: payParams,
        actionContext: payActionContext,
      },
      {
        type: 'leaf',
        actionId: 'apply-improvement',
        sourceCard: id,
        params: { improvementId: id, kind },
        actionContext,
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
      const extras = collectComputeChoiceCandidates(state, player, 'improvement', { types })
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
      ? collectComputeChoiceCandidates(state, player, 'improvement', { types })
      : []
    const seen = new Set(baseMinor.map((o) => o.value))
    const extraMinor = extras
      .filter((o) => !seen.has(o.value))
      .filter((o) => canAffordInjectedImprovement(state, player, o.value))
    const options = [...majorOpts, ...baseMinor, ...extraMinor]
    if (options.length === 0) {
      return types.includes('major')
        ? { type: 'fail', logKey: 'log.improvementFail' }
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
    const flow = buildImprovementFlow(
      state,
      player,
      choice,
      actionCardId,
      readTrueAction(params, actionContext),
      readImprovementTypes({ params, actionContext }),
    )
    if (!flow) return { type: 'fail', logKey: 'log.improvementFail' }
    return { type: 'flow', flow }
  },
}
