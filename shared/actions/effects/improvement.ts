import type { ActionDefinition, ActionExecutionResult, GameState, InternalActionChild, InternalActionChildren, PaymentResourceMap, PlayerState } from '../../contract/types'
import { getMinorImprovement } from '../../cards/registry-display'
import { CardPurchasePayment, PaymentSolver } from '../payment'
import type { CardPurchasePreview } from '../payment'
import { getMajorCard } from '../../cards/major'
import { meetsCardPrerequisites } from '../../cards/helpers/prerequisites'
import { collectComputeChoiceCandidates } from '../../cards/card-listeners'
import { isMajorCardId } from '../../cards/helpers/card-type'
import { isMajorImprovementAvailable } from '../../cards/major/supply'
import { buildInternalPayChild, paymentInfoFromPayResult, type PayChildOptions } from '../helpers/pay-child'
import {
  buildMajorImprovementOptions,
  buildMinorImprovementOptions,
  buildPlayableMinorOptions,
  canAffordInjectedImprovement,
  getMajorImprovementPreviewCostDetailed,
  getMinorImprovementPreviewCostDetailed,
  isMajorImprovementPlayable,
  isMinorImprovementPlayable,
  isBlockedByMajorImprovementActionGate,
  parseImprovementChoice,
} from '../helpers/improvement-helpers'
import {
  commitImprovementPurchaseLifecycle,
  finalizeDirectImprovementPurchaseLifecycle,
} from '../helpers/improvement-purchase-lifecycle'

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
  kind: 'major' | 'minor',
  improvementId: string,
  preview: CardPurchasePreview,
  paymentChoice: string | undefined,
  failure: ActionExecutionResult,
):
  | ActionExecutionResult
  | ReturnType<typeof CardPurchasePayment.resolvePayment> => {
  return CardPurchasePayment.resolvePayment({
    state,
    playerIndex,
    player,
    kind,
    cardId: improvementId,
    preview,
    paymentChoice,
    failure,
  })
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
  if (!isMajorImprovementAvailable(state, improvement.id)) {
    return { type: 'fail', errorKey: 'log.improvementFail' }
  }

  const previewCost = getMajorImprovementPreviewCostDetailed(
    state,
    player,
    improvementId,
    actionCardId,
  )
  const preview = previewCost ?? { cost: {} }
  const resolvedPayment = resolveImprovementPayment(
    state,
    state.players.indexOf(player),
    player,
    'major',
    improvementId,
    preview,
    paymentChoice,
    { type: 'fail', errorKey: 'log.improvementFail' },
  )
  if (resolvedPayment.type !== 'selected') {
    return resolvedPayment
  }
  const paymentInfo = resolvedPayment.paymentInfo
  return finalizeDirectImprovementPurchaseLifecycle({
    state,
    player,
    kind: 'major',
    improvementId: improvement.id,
    paymentInfo,
  })
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
  const previewCost = getMinorImprovementPreviewCostDetailed(
    state,
    player,
    improvementId,
    actionCardId,
  )
  if (!previewCost) {
    return { type: 'fail', errorKey: 'log.minorImprovementFail' }
  }
  const resolvedPayment = resolveImprovementPayment(
    state,
    state.players.indexOf(player),
    player,
    'minor',
    improvementId,
    previewCost,
    paymentChoice,
    { type: 'fail', errorKey: 'log.minorImprovementFail' },
  )
  if (resolvedPayment.type !== 'selected') {
    return resolvedPayment
  }
  const paymentInfo = resolvedPayment.paymentInfo
  return finalizeDirectImprovementPurchaseLifecycle({
    state,
    player,
    kind: 'minor',
    improvementId: improvement.id,
    paymentInfo,
  })
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

const constrainedImprovementPreview = (
  state: GameState,
  player: PlayerState,
  kind: 'major' | 'minor',
  cardId: string,
  actionCardId?: string,
  minimumResourcesPaid?: PaymentResourceMap,
): CardPurchasePreview | null => {
  const preview = kind === 'major'
    ? getMajorImprovementPreviewCostDetailed(state, player, cardId, actionCardId)
    : getMinorImprovementPreviewCostDetailed(state, player, cardId, actionCardId)
  if (!preview || !minimumResourcesPaid) return preview
  return {
    ...preview,
    cost: {
      ...(PaymentSolver.isComplexCost(preview.cost) ? preview.cost : { fee: preview.cost }),
      minimumResourcesPaid,
    },
  }
}

const meetsMinimumPayment = (
  state: GameState,
  player: PlayerState,
  choice: string,
  context?: { sourceCard?: string; actionContext?: Record<string, unknown> },
) => {
  const minimum = context?.actionContext?.minimumResourcesPaid as PaymentResourceMap | undefined
  if (!minimum) return true
  const { kind, id } = parseImprovementChoice(choice)
  if (!kind) return false
  const preview = constrainedImprovementPreview(state, player, kind, id, context?.sourceCard, minimum)
  return !!preview && CardPurchasePayment.hasPaymentOption({
    state, player, playerIndex: state.players.indexOf(player), kind, cardId: id, preview,
  })
}

const buildImprovementInternalChildren = (
  state: GameState,
  player: PlayerState,
  choice: string,
  actionCardId: string,
  trueAction?: boolean,
  _types?: readonly ImprovementType[],
  minimumResourcesPaid?: PaymentResourceMap,
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
  const previewCost = constrainedImprovementPreview(state, player, kind, id, actionCardId, minimumResourcesPaid)
  if (!previewCost) return null
  const costType = kind === 'major' ? 'major-improvement' : 'minor-improvement'
  const payParams: PayChildOptions = CardPurchasePayment.buildPayParams(player, kind, id, previewCost)
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
      buildMajorImprovementOptions(state, player, context?.sourceCard)
        .some((option) => meetsMinimumPayment(state, player, option.value, context))) {
      return true
    }
    if (allowedMinor) {
      const minorOpts = isMinorOnly
        ? buildPlayableMinorOptions(state, player, context?.sourceCard, types)
        : buildMinorImprovementOptions(state, player, context?.sourceCard, undefined, types)
      if (minorOpts.some((option) => meetsMinimumPayment(state, player, option.value, context))) return true
      const extras = collectComputeChoiceCandidates(
        state,
        player,
        'improvement',
        { ...(context?.actionContext ?? {}), types },
        context?.sourceCard,
      )
      if (extras.some((opt) => canAffordInjectedImprovement(state, player, opt.value)
        && meetsMinimumPayment(state, player, opt.value, context))) {
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
      ? buildMajorImprovementOptions(state, player, actionCardId, allowedPurchases)
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
    const seen = new Set([...majorOpts, ...baseMinor].map((o) => o.value))
    const extraMinor = extras
      .filter((o) => {
        if (seen.has(o.value)) return false
        seen.add(o.value)
        return true
      })
      .filter((o) => canAffordInjectedImprovement(state, player, o.value))
    const options = [...majorOpts, ...baseMinor, ...extraMinor]
      .filter((option) => meetsMinimumPayment(state, player, option.value, { sourceCard, actionContext }))
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
    if (!meetsMinimumPayment(state, player, choice, { sourceCard, actionContext })) {
      return { type: 'fail', errorKey: 'log.improvementFail' }
    }
    const internalChildren = buildImprovementInternalChildren(
      state,
      player,
      choice,
      actionCardId,
      readTrueAction(params, actionContext),
      readImprovementTypes({ params, actionContext }),
      actionContext?.minimumResourcesPaid as PaymentResourceMap | undefined,
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
  completeInternalChildren: ({
    state,
    player,
    emitPrivateEvent,
    eventSink,
    reportProtectedObservation,
  }, result, internalResults) => {
    const data = readImprovementCommitData(result)
    if (!data) return result
    const paymentInfo = paymentInfoFromPayResult(internalResults.payment)
    if (!paymentInfo) return result
    return commitImprovementPurchaseLifecycle({
      state,
      player,
      improvementId: data.improvementId,
      kind: data.kind,
      paymentInfo,
      actionContext: data.actionContext,
      emitPrivateEvent,
      eventSink,
      reportProtectedObservation,
    }) as Extract<ActionExecutionResult, { type: 'ok' }>
  },
}
