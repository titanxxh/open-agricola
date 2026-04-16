import type {
  ActionChoiceOption,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
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
  | 'canUseOccupied'
  | 'anytime'

export const actionHookPhases: ActionHookPhase[] = [
  'before',
  'during',
  'immediatelyAfter',
  'after',
  'computeCosts',
  'computeArgs',
  'computeReplace',
  'isDoable',
  'canUseOccupied',
]

export type ActionHookContext = ActionExecutionContext & {
  actionId: string
  phase: ActionHookPhase
  result?: ActionExecutionResult
  choice?: string
  doable?: boolean
  canUseOccupied?: boolean
}

export type FollowUpAction = string | { actionId: string; sourceCard?: string }

export type ActionHookResult = {
  doable?: boolean
  canUseOccupied?: boolean
  actionId?: string
  extraData?: Record<string, unknown>
  extraOptions?: ActionChoiceOption[]
  followUpActions?: FollowUpAction[]
  flow?: ActionFlow
  costs?: Partial<Resource>
  trades?: import('../game/types').Trade[]
  bonuses?: import('../game/types').Bonus[]
  sourceCard?: string
  logKey?: string
  logParams?: Record<string, unknown>
  labelKey?: string
  labelParams?: Record<string, unknown>
  decline?: boolean
  alternativeFlow?: ActionFlow
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

export const getRegisteredActionHooks = () => [...actionHooks]

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

export const applyCanUseOccupiedHooks = (
  context: ActionExecutionContext & { actionId: string },
  initialCanUseOccupied: boolean,
) => {
  let canUseOccupied = initialCanUseOccupied
  const hookContext: ActionHookContext = {
    ...context,
    phase: 'canUseOccupied',
    canUseOccupied,
  }
  getOrderedHooks(hookContext).forEach((registration) => {
    const result = registration.handler({
      ...hookContext,
      canUseOccupied,
    })
    if (typeof result?.canUseOccupied === 'boolean') {
      canUseOccupied = result.canUseOccupied
    }
  })
  return canUseOccupied
}

export const applyComputeReplaceHooks = (
  context: ActionExecutionContext & { actionId: string },
) => {
  let actionId = context.actionId
  const seen = new Set<string>()
  while (!seen.has(actionId)) {
    seen.add(actionId)
    let replaced = false
    getOrderedHooks({
      ...context,
      actionId,
      phase: 'computeReplace',
    }).forEach((registration) => {
      const result = registration.handler({
        ...context,
        actionId,
        phase: 'computeReplace',
      })
      if (typeof result?.actionId === 'string' && result.actionId !== actionId) {
        actionId = result.actionId
        replaced = true
      }
    })
    if (!replaced) {
      break
    }
  }
  return actionId
}
