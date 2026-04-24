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
  | 'computeChoiceCandidates'
  | 'computeReplace'
  | 'isDoable'
  | 'anytime'

export const actionHookPhases: ActionHookPhase[] = [
  'before',
  'during',
  'immediatelyAfter',
  'after',
  'computeCosts',
  'computeArgs',
  'computeChoiceCandidates',
  'computeReplace',
  'isDoable',
  'anytime',
]

export type ActionHookContext = ActionExecutionContext & {
  actionId: string
  phase: ActionHookPhase
  result?: ActionExecutionResult
  choice?: string
  doable?: boolean
}

export type FollowUpAction = string | { actionId: string; sourceCard?: string }

export type ActionHookResult = {
  doable?: boolean
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
  immediateLogs?: import('../game/types').ImmediateLogEntry[]
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
  /**
   * Sort order for hook execution within a phase (ascending). Lower runs first.
   *
   * NOTE: for the `computeCosts` phase, hook results are merged into a
   * ComplexCost as follows:
   *   - `costs` (deltas) are summed by applyCostOverride (addition is commutative)
   *   - `trades` are pushed into ComplexCost.trades (order does not affect
   *     payment enumeration — computeAllBuyableCombinations enumerates all
   *     trade combinations regardless of insertion order)
   *   - `bonuses` are pushed into ComplexCost.bonuses (same — bonus iteration
   *     accumulates non-optional and expands optional, independent of order)
   *
   * So `order` has NO observable effect for computeCosts. It is retained for
   * other phases (before / during / after / immediatelyAfter etc.) where
   * sequential side-effects may need deterministic ordering.
   */
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
