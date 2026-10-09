import { InvalidActionContextError } from '../contract/action-context-error'
import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionFlow,
  ActionSpace,
  CanBeExecutedByPlayer,
  CanBeExecutedByPlayerContext,
  GameState,
  Resource,
} from '../contract/types'
import type { ActionHookContext } from './hooks'
import { HookDispatcher } from '../engine/dispatcher'
import { getMatchingListeners, executeCardListener, listenerOwnerOptions } from '../cards/card-listeners'
import { getSuppressedBeforeListenerIds, suppressBeforeListeners } from '../engine/action-context-flags'
import { withSkippedComputeReplaceListeners } from '../engine/replace-guard'

const deferredFlowDoableFns = new WeakSet<CanBeExecutedByPlayer>()
const flowDerivedDoableFns = new WeakMap<CanBeExecutedByPlayer, FlowActionResolver | undefined>()
let flowHookDispatcher: HookDispatcher | undefined
const getFlowHookDispatcher = () => flowHookDispatcher ??= new HookDispatcher()

const emptyResources: Resource = {
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
}

export type FlowActionResolver = (actionId: string) => ActionDefinition | undefined
export type FlowDoableContext = ActionExecutionContext
  & Partial<Pick<ActionHookContext, 'transactionEvents' | 'actionEvents' | 'eventQuery'>>

const childCanBeExecutedContext = (context: FlowDoableContext): CanBeExecutedByPlayerContext => ({
  sourceCard: context.sourceCard,
  actionContext: context.actionContext,
  params: context.params,
  space: context.space,
})

export const wrapOptional = (flow: ActionFlow): ActionFlow => ({
  type: 'seq',
  optional: true,
  children: [flow],
})

export const deriveCanBeExecutedByFlow = (): CanBeExecutedByPlayer => {
  const placeholder: CanBeExecutedByPlayer = () => {
    throw new Error('flow-derived canBeExecutedByPlayer has not been initialized')
  }
  deferredFlowDoableFns.add(placeholder)
  flowDerivedDoableFns.set(placeholder, undefined)
  return placeholder
}

export const isDeferredFlowDoable = (fn: CanBeExecutedByPlayer) =>
  deferredFlowDoableFns.has(fn)

export const isFlowDerivedDoable = (fn: CanBeExecutedByPlayer) =>
  flowDerivedDoableFns.has(fn)

const asActionSpace = (
  action: ActionDefinition,
  source: ActionDefinition | ActionSpace,
): ActionSpace => {
  if ('resources' in source && 'takenBy' in source) {
    return source
  }
  return {
    ...action,
    resources: { ...emptyResources },
    takenBy: [],
  }
}

const applyChildActionDoable = (
  actionId: string,
  action: ActionDefinition,
  context: FlowDoableContext,
  resolveAction: FlowActionResolver,
  seenActionIds: Set<string>,
): boolean => {
  const actionKey = `${actionId}:${JSON.stringify(context.params ?? {})}`
  if (seenActionIds.has(actionKey)) {
    return false
  }

  const nextSeenActionIds = new Set(seenActionIds)
  nextSeenActionIds.add(actionKey)

  const strictDoable = action.strictCanExecute && action.flow && !isFlowDerivedDoable(action.canBeExecutedByPlayer)
    ? action.canBeExecutedByPlayer.call(context.space, context.state, context.player, childCanBeExecutedContext(context))
    : undefined
  if (strictDoable === false) return false
  const hooks = getFlowHookDispatcher()
  const replacement = hooks.applyComputeReplace({ ...context, actionId })
  const canStartAlternative = () => replacement.alternatives.some((alternative) => evaluateFlowDoable(alternative.flow, {
    ...context,
    sourceCard: alternative.sourceCard ?? context.sourceCard,
    actionContext: withSkippedComputeReplaceListeners(context.actionContext, alternative.replacementListenerIds),
  }, resolveAction, nextSeenActionIds))
  if (replacement.actionId !== actionId) {
    const replaced = resolveAction(replacement.actionId)
    return (!!replaced && applyChildActionDoable(replacement.actionId, replaced, {
      ...context,
      sourceCard: replacement.sourceCard ?? context.sourceCard,
      actionContext: { ...context.actionContext, checkedReplaceAction: true },
    }, resolveAction, nextSeenActionIds)) || canStartAlternative()
  }

  const initialDoable = () => {
    let doable = strictDoable ?? (!isFlowDerivedDoable(action.canBeExecutedByPlayer) && action.canBeExecutedByPlayer.call(
      context.space,
      context.state,
      context.player,
      childCanBeExecutedContext(context),
    ))
    if (!doable && action.flow) {
      doable = evaluateFlowDoable(action.flow, context, flowDerivedDoableFns.get(action.canBeExecutedByPlayer) ?? resolveAction, nextSeenActionIds)
    }
    return doable
  }

  try { return hooks.applyIsDoable(
    { ...context, actionId },
    action,
    // A leaf's cost preview replaces its base result. Keep composite traversal
    // eager so its child hooks and strict gates retain their existing order.
    action.flow ? initialDoable() : initialDoable,
    () => canStartAlternative() || canStartBefore(actionId, context, resolveAction, nextSeenActionIds),
  ) } catch (error) {
    // Availability is a pure query; actual dispatch still rejects and rolls back.
    if (error instanceof InvalidActionContextError) return false
    throw error
  }
}

export const canStartBefore = (
  actionId: string,
  context: FlowDoableContext,
  resolveAction: FlowActionResolver,
  seenActionIds = new Set<string>(),
): boolean => {
  if (context.actionContext?.skipBeforeTriggers === true) return false
  const suppressed = new Set(getSuppressedBeforeListenerIds(context.actionContext))
  return getMatchingListeners({ ...context, actionId, phase: 'before' }).some((entry) => {
    if (suppressed.has(entry.registration.id)) return false
    const state = JSON.parse(JSON.stringify(context.state)) as GameState
    state.actionSpaces = state.actionSpaces.map((space, index) => ({ ...context.state.actionSpaces[index], ...space }))
    const player = state.players.find((candidate) => candidate.id === context.player.id)!
    const space = state.actionSpaces.find((candidate) => candidate.id === context.space.id) ?? context.space
    const result = executeCardListener(entry.registration, { ...context, state, player, space, actionId, phase: 'before' }, listenerOwnerOptions(entry))
    if (!result?.flow) return false
    const owner = state.players.find((candidate) => candidate.id === entry.ownerPlayerId) ?? player
    return evaluateFlowDoable({ ...result.flow, optional: false }, {
      ...context, state, space, player: owner, sourceCard: result.sourceCard ?? entry.cardId,
      actionContext: suppressBeforeListeners(context.actionContext, [entry.registration.id]),
    }, resolveAction, seenActionIds)
  })
}

export const evaluateFlowDoable = (
  flow: ActionFlow,
  context: FlowDoableContext,
  resolveAction: FlowActionResolver,
  seenActionIds = new Set<string>(),
): boolean => {
  context = {
    ...context,
    player: context.state.players.find((player) => player.id === flow.targetPlayerId) ?? context.player,
  }
  if (flow.optional) {
    return true
  }

  if (flow.type === 'leaf') {
    const action = resolveAction(flow.actionId)
    if (!action) {
      return false
    }
    const childContext: FlowDoableContext = {
      ...context,
      params: flow.params,
      sourceCard: flow.sourceCard ?? context.sourceCard,
      actionContext: flow.actionContext
        ? { ...(context.actionContext ?? {}), ...flow.actionContext }
        : context.actionContext,
    }
    const targetSpaceId = childContext.actionContext?.targetSpaceId
    if (typeof targetSpaceId === 'string') {
      childContext.space = context.state.actionSpaces.find((space) => space.id === targetSpaceId) ?? context.space
    }
    return applyChildActionDoable(
      flow.actionId,
      action,
      childContext,
      resolveAction,
      seenActionIds,
    )
  }

  if (flow.type === 'or' || flow.type === 'xor') {
    return flow.children.some((child) =>
      evaluateFlowDoable(child, context, resolveAction, seenActionIds),
    )
  }

  return flow.children.length === 0
    || evaluateFlowDoable(flow.children[0]!, context, resolveAction, seenActionIds)
}

export const isActionDoableInFlowContext = (
  args: FlowDoableContext & {
    actionId: string
    action: ActionDefinition
    resolveAction: FlowActionResolver
  },
): boolean => {
  const { actionId, action, resolveAction, ...context } = args
  return applyChildActionDoable(actionId, action, context, resolveAction, new Set())
}

export const initializeFlowDerivedCanBeExecutedByPlayer = (
  action: ActionDefinition,
  resolveAction: FlowActionResolver,
) => {
  if (!action.flow || !isDeferredFlowDoable(action.canBeExecutedByPlayer)) {
    return action
  }

  action.canBeExecutedByPlayer = function (
    this: ActionDefinition | ActionSpace,
    state,
    player,
    context,
  ) {
    const space = asActionSpace(action, this)
    return evaluateFlowDoable(
      action.flow!,
      {
        state,
        player,
        space,
        params: context?.params,
        sourceCard: context?.sourceCard,
        actionContext: context?.actionContext,
      },
      resolveAction,
      new Set([`${action.id}:${JSON.stringify(context?.params ?? {})}`]),
    )
  }

  flowDerivedDoableFns.set(action.canBeExecutedByPlayer, resolveAction)
  return action
}
