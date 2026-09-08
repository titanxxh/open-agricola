import type { ActionChoiceOption, ActionExecutionContext, ActionFlow, PlayerState, Resource, SupplyTokenCounts } from '../contract/types'
import type { ActionHookResult } from '../actions/hooks'
import {
  applyPureResourceFlowPreview,
  canPreviewPureResourceFlow,
  isPureResourceFlowCurrentlyPayable,
} from '../actions/resource-flow-preview'
import {
  executeCardListener,
  getListenerById,
  type CardListenerContext,
  type CardListenerContextInput,
} from '../cards/card-listeners'
import { previewActivateCardEffect } from '../actions/effects/internal/activate-card-effect'
import {
  getAvailableStableSupplyCount,
  getOwnOrdinaryFenceReserveCount,
} from '../domain/supply-tokens'
import { isActivateCardActionNode, type ActivateCardActionNode } from './activation-action'
import { ActionNode } from './nodes/action-node'
import type { ParallelNode } from './nodes'
import type { EngineNode } from './types'

export type TriggerOptionState = {
  child: EngineNode
  cardId: string
  listenerId: string
  mandatory: boolean
  applicable: boolean
  doable: boolean
  actionId: string
  phase: string
  resourcesAfter?: Resource
}

export type TriggerSelectEvaluation = {
  options: ActionChoiceOption[]
  optionStates: TriggerOptionState[]
}

export type TriggerSelectEvaluationOptions = {
  canStartFlow?: (flow: ActionFlow, context: ActionExecutionContext) => boolean
  canContinueWithoutTriggers?: (actionId: string, resources?: Resource) => boolean
  canReachContinuationThroughTriggers?: (actionId: string, resources?: Resource) => boolean
}

export const TRIGGER_DISABLED_REASON = 'ui.interactionTriggerUnavailable'

const cloneJson = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T

const previewSnapshot = (
  state: ActionExecutionContext['state'],
  player: PlayerState,
): string => JSON.stringify({ state, player })

const mutationOnlyTriggerResult = (sourceCard: string): ActionHookResult => ({
  sourceCard,
  extraData: { previewMutation: true },
})

const clonePlayerForPreview = (player: PlayerState): PlayerState => ({
  ...player,
  resources: { ...player.resources },
  workers: cloneJson(player.workers ?? []),
  fields: cloneJson(player.fields ?? []),
  roomTiles: cloneJson(player.roomTiles ?? []),
  stableTiles: cloneJson(player.stableTiles ?? []),
  improvements: [...(player.improvements ?? [])],
  minorHand: [...(player.minorHand ?? [])],
  minorPlayed: [...(player.minorPlayed ?? [])],
  occupationHand: [...(player.occupationHand ?? [])],
  occupationPlayed: [...(player.occupationPlayed ?? [])],
  extraOccupationsFromCards: [...(player.extraOccupationsFromCards ?? [])],
  playedCards: [...(player.playedCards ?? [])],
  stableAnimals: cloneJson(player.stableAnimals ?? {}),
  pastures: cloneJson(player.pastures ?? []),
  fenceSegments: cloneJson(player.fenceSegments ?? []),
  majorEffects: cloneJson(player.majorEffects ?? {}),
  activeModifiers: cloneJson(player.activeModifiers ?? []),
  cardStates: cloneJson(player.cardStates ?? {}) as PlayerState['cardStates'],
  stats: cloneJson(player.stats ?? {}) as PlayerState['stats'],
})

type TriggerSelectContext = ActionExecutionContext &
  Partial<Pick<CardListenerContext, 'transactionEvents' | 'actionEvents' | 'eventQuery'>>

const isActivateCardEffectNode = (node: EngineNode): node is ActionNode =>
  node instanceof ActionNode && node.actionId === 'activate-card-effect'

const cloneStateForPreview = (
  state: ActionExecutionContext['state'],
  playerClones: Map<string, PlayerState>,
) => ({
  ...cloneJson(state),
  players: (state.players ?? []).map((player) => playerClones.get(player.id) ?? clonePlayerForPreview(player)),
  actionSpaces: (state.actionSpaces ?? []).map((space) => ({
    ...space,
    resources: { ...space.resources },
    gainPerRound: { ...space.gainPerRound },
    takenBy: [...(space.takenBy ?? [])],
  })),
})

const previewContextForChild = (
  child: ActivateCardActionNode,
  context: TriggerSelectContext,
): {
  listenerContext: CardListenerContextInput
  previewState: ActionExecutionContext['state']
  effectPlayer: PlayerState
  ownerPlayerId?: string
  ownerCardZone?: ActivateCardActionNode['params']['ownerCardZone']
} => {
  const params = child.params
  const ownerPlayerId = params.ownerPlayerId ?? child.ownerPlayerId
  const triggerPlayerId = params.triggerPlayerId
  const playerClones = new Map(
    (context.state.players ?? []).map((player) => [player.id, clonePlayerForPreview(player)]),
  )
  const triggerPlayer =
    (triggerPlayerId ? playerClones.get(triggerPlayerId) : undefined)
    ?? playerClones.get(context.player.id)
    ?? clonePlayerForPreview(context.player)
  const effectPlayer =
    (ownerPlayerId ? playerClones.get(ownerPlayerId) : undefined)
    ?? triggerPlayer
  const previewState = {
    ...cloneStateForPreview(context.state, playerClones),
  }
  const event: Record<string, unknown> = {
    ...params.event,
    triggerPlayerId,
    ownerPlayerId,
    ownerCardId: params.cardId,
    ownerCardZone: params.ownerCardZone,
    mandatory: params.mandatory,
  }
  const transactionEvents = context.transactionEvents ?? params.transactionEvents
  const actionEvents = context.actionEvents
    ?? params.actionEvents
    ?? (typeof params.actionEventStartIndex === 'number' && transactionEvents
      ? transactionEvents.slice(params.actionEventStartIndex)
      : undefined)
  if (params.countCardUse !== undefined) event.countCardUse = params.countCardUse
  return {
    ownerPlayerId,
    ownerCardZone: params.ownerCardZone,
    previewState,
    effectPlayer,
    listenerContext: {
      state: previewState,
      player: triggerPlayer,
      triggerPlayer,
      ownerPlayer: effectPlayer,
      effectPlayer,
      space: typeof event.targetSpaceId === 'string'
        ? previewState.actionSpaces.find((space) => space.id === event.targetSpaceId) ?? context.space
        : context.space,
      actionId: params.actionId,
      phase: params.phase,
      transactionEvents,
      actionEvents,
      eventQuery: context.eventQuery,
      triggerSnapshot: params.triggerSnapshot,
      ...event,
    },
  }
}

const previewActivateCardEffectChild = (
  child: ActionNode,
  context: TriggerSelectContext,
): { result: ActionHookResult | undefined; previewState: ActionExecutionContext['state']; previewPlayer: PlayerState } => {
  const targetPlayerId = child.params?.targetPlayerId
  const playerClones = new Map(
    (context.state.players ?? []).map((player) => [player.id, clonePlayerForPreview(player)]),
  )
  const previewState = cloneStateForPreview(context.state, playerClones)
  const previewPlayer =
    (typeof targetPlayerId === 'string' ? playerClones.get(targetPlayerId) : undefined)
    ?? playerClones.get(context.player.id)
    ?? clonePlayerForPreview(context.player)
  return {
    previewState,
    previewPlayer,
    result: previewActivateCardEffect(
      previewState,
      previewPlayer,
      child.params,
      child.actionContext,
    ),
  }
}

const resultHasApplicabilitySignal = (result: ActionHookResult | undefined): boolean => {
  if (!result) return false
  return Boolean(
    result.flow
      || (result.followUpActions?.length ?? 0) > 0
      || typeof result.doable === 'boolean'
      || (result.extraOptions?.length ?? 0) > 0
      || result.costs
      || result.trades
      || result.bonuses
      || result.sourceCard
      || result.extraData,
  )
}

export { isPureResourceFlowCurrentlyPayable } from '../actions/resource-flow-preview'

const previewAvailability = (
  state: ActionExecutionContext['state'],
  player: PlayerState,
): { supplyTokens: SupplyTokenCounts } => ({
  supplyTokens: {
    fence: getOwnOrdinaryFenceReserveCount(player),
    stable: getAvailableStableSupplyCount(state, player),
  },
})

const evaluateChildDoable = (
  result: ActionHookResult | undefined,
  state: ActionExecutionContext['state'],
  player: PlayerState,
  context: ActionExecutionContext,
  options: TriggerSelectEvaluationOptions,
): boolean => {
  if (!resultHasApplicabilitySignal(result)) return false
  if (typeof result?.doable === 'boolean') return result.doable
  if (result?.flow) {
    if (options.canStartFlow) return options.canStartFlow({ ...result.flow, optional: false }, { ...context, state, player })
    return canPreviewPureResourceFlow(result.flow)
      ? isPureResourceFlowCurrentlyPayable(result.flow, player.resources, previewAvailability(state, player))
      : true
  }
  return true
}

const previewResourcesAfterChild = (
  result: ActionHookResult | undefined,
  state: ActionExecutionContext['state'],
  player: PlayerState,
): Resource | undefined => {
  if (!result?.flow) return undefined
  return applyPureResourceFlowPreview(result.flow, player.resources, previewAvailability(state, player)) ?? undefined
}

const triggerResultMandatory = (
  metadataMandatory: boolean,
  phase: string,
  result: ActionHookResult | undefined,
): boolean => {
  if (metadataMandatory) return true
  if (typeof result?.extraData?.beforeEndGameMandatory === 'boolean') {
    return result.extraData.beforeEndGameMandatory
  }
  if (phase === 'before') return false
  if (!resultHasApplicabilitySignal(result)) return false
  return result?.flow?.optional !== true
}

type TriggerSelectableChild = {
  child: EngineNode
  cardId: string
  listenerId: string
  mandatory: boolean
}

const unresolvedTriggerChildren = (node: ParallelNode): TriggerSelectableChild[] => {
  if (node.triggerChildren.length > 0) {
    return node.triggerChildren
      .map((metadata) => ({
        metadata,
        child: node.children.find((child) => child.id === metadata.nodeId),
      }))
      .filter((entry): entry is { metadata: typeof entry.metadata; child: EngineNode } =>
        Boolean(entry.child) && entry.child!.getState() !== 'resolved',
      )
      .map(({ metadata, child }) => ({
        child,
        cardId: metadata.cardId,
        listenerId: metadata.listenerId,
        mandatory: metadata.mandatory,
      }))
  }
  return node.children
    .filter(isActivateCardActionNode)
    .filter((child) => child.getState() !== 'resolved')
    .map((child) => ({
      child,
      cardId: child.params.cardId,
      listenerId: child.params.listenerId,
      mandatory: child.params.mandatory === true,
    }))
}

const getBeforeActionIds = (node: ParallelNode): string[] => {
  const actionIds = new Set<string>()
  for (const entry of unresolvedTriggerChildren(node)) {
    if (isActivateCardActionNode(entry.child) && entry.child.params.phase === 'before') {
      actionIds.add(entry.child.params.actionId)
    }
  }
  return [...actionIds]
}

export const canPassTriggerSelect = (
  node: ParallelNode,
  evaluation: TriggerSelectEvaluation,
  _context: ActionExecutionContext,
  options: TriggerSelectEvaluationOptions = {},
): boolean => {
  const enabledMandatory = evaluation.optionStates.some(
    (entry) => entry.mandatory && entry.applicable && entry.doable,
  )
  if (enabledMandatory) return false
  const enabledTriggerExists = evaluation.optionStates.some(
    (entry) => entry.applicable && entry.doable,
  )
  const beforeActionIds = getBeforeActionIds(node)
  if (
    enabledTriggerExists &&
    beforeActionIds.length > 0 &&
    options.canContinueWithoutTriggers &&
    !beforeActionIds.every((actionId) => options.canContinueWithoutTriggers!(actionId))
  ) {
    const enabledTriggerCanAdvanceContinuation = evaluation.optionStates.some((entry) => {
      if (!entry.applicable || !entry.doable) return false
      return beforeActionIds.every((actionId) =>
        options.canContinueWithoutTriggers!(actionId, entry.resourcesAfter) ||
        (options.canReachContinuationThroughTriggers?.(actionId, entry.resourcesAfter) ?? false),
      )
    })
    if (enabledTriggerCanAdvanceContinuation) return false
  }
  return true
}

export const evaluateTriggerSelect = (
  node: ParallelNode,
  context: TriggerSelectContext,
  evalOptions: TriggerSelectEvaluationOptions = {},
): TriggerSelectEvaluation => {
  const optionStates: TriggerOptionState[] = []
  const options: ActionChoiceOption[] = []
  const entries = unresolvedTriggerChildren(node)
  const cardIdCounts = new Map<string, number>()
  for (const entry of entries) {
    cardIdCounts.set(entry.cardId, (cardIdCounts.get(entry.cardId) ?? 0) + 1)
  }

  for (const entry of entries) {
    const { child } = entry
    const listener = isActivateCardActionNode(child) ? getListenerById(entry.listenerId) : undefined
    const preview = listener && isActivateCardActionNode(child) ? previewContextForChild(child, context) : null
    let previewState = context.state
    let previewPlayer = context.player
    const result = listener && preview
      ? (() => {
        previewState = preview.previewState
        previewPlayer = preview.effectPlayer
        const before = previewSnapshot(preview.previewState, preview.effectPlayer)
        const listenerResult = executeCardListener(listener, preview.listenerContext, {
          ownerPlayerId: preview.ownerPlayerId,
          ownerCardId: entry.cardId,
          ownerCardZone: preview.ownerCardZone,
        })
        if (!listenerResult && previewSnapshot(preview.previewState, preview.effectPlayer) !== before) {
          return mutationOnlyTriggerResult(entry.cardId)
        }
        return listenerResult
      })()
      : isActivateCardEffectNode(child)
        ? (() => {
          const stagePreview = previewActivateCardEffectChild(child, context)
          previewState = stagePreview.previewState
          previewPlayer = stagePreview.previewPlayer
          return stagePreview.result
        })()
      : undefined
    const previewable = isActivateCardActionNode(child) || isActivateCardEffectNode(child)
    const applicable = previewable
      ? (!isActivateCardActionNode(child) || child.params.phase !== 'isDoable') &&
        resultHasApplicabilitySignal(result)
      : true
    const doable = previewable
      ? (applicable ? evaluateChildDoable(result, previewState, previewPlayer, context, evalOptions) : false)
      : true
    const resourcesAfter = doable && previewPlayer.id === context.player.id
      ? previewResourcesAfterChild(result, previewState, previewPlayer)
      : undefined
    const actionId = isActivateCardActionNode(child)
      ? child.params.actionId
      : isActivateCardEffectNode(child) ? child.actionId : 'stage-hook'
    const phase = isActivateCardActionNode(child)
      ? child.params.phase
      : isActivateCardEffectNode(child) ? String(child.params?.hook ?? 'stage') : 'stage'
    const state: TriggerOptionState = {
      child,
      cardId: entry.cardId,
      listenerId: entry.listenerId,
      mandatory: applicable ? triggerResultMandatory(entry.mandatory, phase, result) : entry.mandatory,
      applicable,
      doable,
      actionId,
      phase,
      resourcesAfter,
    }
    optionStates.push(state)
    if (!applicable) continue
    options.push({
      value: (cardIdCounts.get(state.cardId) ?? 0) > 1 ? state.child.id : state.cardId,
      labelKey: `cards.${state.cardId}.name`,
      sourceCard: state.cardId,
      ...(doable ? {} : { disabled: true, disabledReasonKey: TRIGGER_DISABLED_REASON }),
    })
  }

  if (options.length === 0) {
    return { options, optionStates }
  }

  const pass: ActionChoiceOption = {
    value: '__pass__',
    labelKey: 'ui.interactionSelectTriggerPass',
  }
  if (!canPassTriggerSelect(node, { options, optionStates }, context, evalOptions)) {
    pass.disabled = true
  }
  options.push(pass)

  return { options, optionStates }
}
