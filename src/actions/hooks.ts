import type {
  ActionChoiceOption,
  ActionExecutionContext,
  ActionExecutionResult,
  Resource,
} from '../game/types'

export type ActionHookPhase =
  | 'before'
  | 'during'
  | 'immediatelyAfter'
  | 'after'
  | 'computeCosts'
  | 'computeArgs'
  | 'computeReplace'
  | 'isDoable'

export const actionHookPhases: ActionHookPhase[] = [
  'before',
  'during',
  'immediatelyAfter',
  'after',
  'computeCosts',
  'computeArgs',
  'computeReplace',
  'isDoable',
]

export type ActionHookContext = ActionExecutionContext & {
  actionId: string
  phase: ActionHookPhase
  result?: ActionExecutionResult
  choice?: string
  doable?: boolean
}

export type ActionHookResult = {
  doable?: boolean
  actionId?: string
  extraOptions?: ActionChoiceOption[]
  followUpActions?: string[]
  costs?: Partial<Resource>
}

export type ActionHookHandler = (
  context: ActionHookContext,
) => ActionHookResult | void

export type ActionHookRegistration = {
  id: string
  actions?: string[]
  phases?: ActionHookPhase[]
  order?: number
  handler: ActionHookHandler
}

const actionHooks: ActionHookRegistration[] = []

export const registerActionHook = (registration: ActionHookRegistration) => {
  actionHooks.push(registration)
}

export const clearActionHooks = () => {
  actionHooks.length = 0
}

const matchesHook = (
  registration: ActionHookRegistration,
  context: ActionHookContext,
) => {
  if (registration.actions && !registration.actions.includes(context.actionId)) {
    return false
  }
  if (registration.phases && !registration.phases.includes(context.phase)) {
    return false
  }
  return true
}

const getOrderedHooks = (context: ActionHookContext) =>
  actionHooks
    .filter((registration) => matchesHook(registration, context))
    .sort((left, right) => {
      const leftOrder = left.order ?? 0
      const rightOrder = right.order ?? 0
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder
      }
      return left.id.localeCompare(right.id)
    })

export const runActionHooks = (context: ActionHookContext) => {
  const results: ActionHookResult[] = []
  getOrderedHooks(context).forEach((registration) => {
    const result = registration.handler(context)
    if (result) {
      results.push(result)
    }
  })
  return results
}

export const applyIsDoableHooks = (
  context: ActionExecutionContext & { actionId: string },
  initialDoable: boolean,
) => {
  let doable = initialDoable
  const hookContext: ActionHookContext = {
    ...context,
    phase: 'isDoable',
    doable,
  }
  getOrderedHooks(hookContext).forEach((registration) => {
    const result = registration.handler({
      ...hookContext,
      doable,
    })
    if (typeof result?.doable === 'boolean') {
      doable = result.doable
    }
  })
  return doable
}

export const applyComputeReplaceHooks = (
  context: ActionExecutionContext & { actionId: string },
) => {
  let actionId = context.actionId
  const hookContext: ActionHookContext = {
    ...context,
    phase: 'computeReplace',
  }
  getOrderedHooks(hookContext).forEach((registration) => {
    const result = registration.handler(hookContext)
    if (typeof result?.actionId === 'string') {
      actionId = result.actionId
    }
  })
  return actionId
}
