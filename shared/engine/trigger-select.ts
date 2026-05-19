import type { ActionChoiceOption, ActionExecutionContext, PlayerState, Resource } from '../contract/types'
import type { ActionHookResult } from '../actions/hooks'
import {
  applyPureResourceFlowPreview,
  isPureResourceFlowCurrentlyPayable,
} from '../actions/resource-flow-preview'
import {
  executeCardListener,
  getListenerById,
  type CardListenerContext,
  type CardListenerContextInput,
} from '../cards/card-listeners'
import { isActivateCardActionNode, type ActivateCardActionNode } from './activation-action'
import type { ParallelNode } from './nodes'

export type TriggerOptionState = {
  child: ActivateCardActionNode
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
  canContinueWithoutTriggers?: (actionId: string, resources?: Resource) => boolean
  canReachContinuationThroughTriggers?: (actionId: string, resources?: Resource) => boolean
}

export const TRIGGER_DISABLED_REASON = 'ui.interactionTriggerUnavailable'

const clonePlayerForPreview = (player: PlayerState): PlayerState => ({
  ...player,
  resources: { ...player.resources },
  cardStates: JSON.parse(JSON.stringify(player.cardStates ?? {})) as PlayerState['cardStates'],
})

type TriggerSelectContext = ActionExecutionContext &
  Partial<Pick<CardListenerContext, 'transactionEvents' | 'eventQuery'>>

const previewContextForChild = (
  child: ActivateCardActionNode,
  context: TriggerSelectContext,
): { listenerContext: CardListenerContextInput; ownerPlayerId?: string } => {
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
    ...context.state,
    players: (context.state.players ?? []).map((player) => playerClones.get(player.id) ?? player),
    actionSpaces: (context.state.actionSpaces ?? []).map((space) => ({
      ...space,
      resources: { ...space.resources },
      gainPerRound: { ...space.gainPerRound },
      takenBy: [...(space.takenBy ?? [])],
    })),
  }
  const event: Record<string, unknown> = {
    ...params.event,
    triggerPlayerId,
    ownerPlayerId,
    mandatory: params.mandatory,
  }
  if (params.countCardUse !== undefined) event.countCardUse = params.countCardUse
  return {
    ownerPlayerId,
    listenerContext: {
      state: previewState,
      player: triggerPlayer,
      triggerPlayer,
      ownerPlayer: effectPlayer,
      effectPlayer,
      space: context.space,
      actionId: params.actionId,
      phase: params.phase,
      transactionEvents: context.transactionEvents,
      eventQuery: context.eventQuery,
      ...event,
    },
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
      || result.logKey
      || (result.immediateLogs?.length ?? 0) > 0
      || result.extraData,
  )
}

export { isPureResourceFlowCurrentlyPayable } from '../actions/resource-flow-preview'

const evaluateChildDoable = (
  result: ActionHookResult | undefined,
  context: ActionExecutionContext,
): boolean => {
  if (!resultHasApplicabilitySignal(result)) return false
  if (typeof result?.doable === 'boolean') return result.doable
  if (result?.flow) return isPureResourceFlowCurrentlyPayable(result.flow, context.player.resources)
  return true
}

const previewResourcesAfterChild = (
  result: ActionHookResult | undefined,
  context: ActionExecutionContext,
): Resource | undefined => {
  if (!result?.flow) return undefined
  return applyPureResourceFlowPreview(result.flow, context.player.resources) ?? undefined
}

const unresolvedTriggerChildren = (node: ParallelNode): ActivateCardActionNode[] =>
  node.children.filter(isActivateCardActionNode).filter((child) => child.getState() !== 'resolved')

const getBeforeActionIds = (node: ParallelNode): string[] => {
  const actionIds = new Set<string>()
  for (const child of node.children.filter(isActivateCardActionNode)) {
    if (child.getState() !== 'resolved' && child.params.phase === 'before') {
      actionIds.add(child.params.actionId)
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
      if (!entry.applicable || !entry.doable || !entry.resourcesAfter) return false
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

  for (const child of unresolvedTriggerChildren(node)) {
    const metadata = node.triggerChildren.find((entry) => entry.nodeId === child.id)
    const listener = getListenerById(child.params.listenerId)
    const preview = listener ? previewContextForChild(child, context) : null
    const result = listener && preview
      ? executeCardListener(listener, preview.listenerContext, { ownerPlayerId: preview.ownerPlayerId })
      : undefined
    const applicable = child.params.phase !== 'isDoable' && resultHasApplicabilitySignal(result)
    const doable = applicable ? evaluateChildDoable(result, context) : false
    const resourcesAfter = doable ? previewResourcesAfterChild(result, context) : undefined
    const state: TriggerOptionState = {
      child,
      cardId: metadata?.cardId ?? child.params.cardId,
      listenerId: metadata?.listenerId ?? child.params.listenerId,
      mandatory: metadata?.mandatory ?? child.params.mandatory === true,
      applicable,
      doable,
      actionId: child.params.actionId,
      phase: child.params.phase,
      resourcesAfter,
    }
    optionStates.push(state)
    if (!applicable) {
      child.resolve()
      continue
    }
    options.push({
      value: state.cardId,
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
