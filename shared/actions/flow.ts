import type {
  ActionDefinition,
  ActionFlow,
  ActionSpace,
  CanBeExecutedByPlayer,
  CanBeExecutedByPlayerContext,
  GameState,
  PlayerState,
  Resource,
} from '../contract/types'
import { HookDispatcher } from '../engine/dispatcher'

const deferredFlowDoableFns = new WeakSet<CanBeExecutedByPlayer>()
const flowDerivedDoableFns = new WeakSet<CanBeExecutedByPlayer>()
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
type FlowDoableContext = {
  state: GameState
  player: PlayerState
  space: ActionSpace
  sourceCard?: string
  actionContext?: Record<string, unknown>
}

const childCanBeExecutedContext = (context: FlowDoableContext): CanBeExecutedByPlayerContext => ({
  sourceCard: context.sourceCard,
  actionContext: context.actionContext,
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
  flowDerivedDoableFns.add(placeholder)
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
  if (seenActionIds.has(actionId)) {
    return false
  }

  const nextSeenActionIds = new Set(seenActionIds)
  nextSeenActionIds.add(actionId)

  let doable = false
  if (action.flow && isDeferredFlowDoable(action.canBeExecutedByPlayer)) {
    doable = evaluateFlowDoable(
      action.flow,
      context,
      resolveAction,
      nextSeenActionIds,
    )
  } else {
    doable = action.canBeExecutedByPlayer.call(
      context.space,
      context.state,
      context.player,
      childCanBeExecutedContext(context),
    )
  }

  return getFlowHookDispatcher().applyIsDoable(
    {
      state: context.state,
      player: context.player,
      space: context.space,
      actionId,
      sourceCard: context.sourceCard,
      actionContext: context.actionContext,
    },
    action,
    doable,
  )
}

const evaluateFlowDoable = (
  flow: ActionFlow,
  context: FlowDoableContext,
  resolveAction: FlowActionResolver,
  seenActionIds: Set<string>,
): boolean => {
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
      sourceCard: flow.sourceCard ?? context.sourceCard,
      actionContext: flow.actionContext
        ? { ...(context.actionContext ?? {}), ...flow.actionContext }
        : context.actionContext,
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

  return flow.children.every((child) => {
    if (child.optional) {
      return true
    }
    return evaluateFlowDoable(child, context, resolveAction, seenActionIds)
  })
}

export const isActionDoableInFlowContext = (
  args: {
    actionId: string
    action: ActionDefinition
    state: GameState
    player: PlayerState
    space: ActionSpace
    sourceCard?: string
    actionContext?: Record<string, unknown>
    resolveAction: FlowActionResolver
  },
): boolean =>
  applyChildActionDoable(
    args.actionId,
    args.action,
    {
      state: args.state,
      player: args.player,
      space: args.space,
      sourceCard: args.sourceCard,
      actionContext: args.actionContext,
    },
    args.resolveAction,
    new Set(),
  )

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
        sourceCard: context?.sourceCard,
        actionContext: context?.actionContext,
      },
      resolveAction,
      new Set([action.id]),
    )
  }

  flowDerivedDoableFns.add(action.canBeExecutedByPlayer)
  return action
}
