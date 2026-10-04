import type {
  ActionChoiceOption,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
  Resource,
} from '../contract/types'
import type { GameEvent } from '../contract/events'
import { createEventQuery, type EventQuery } from '../events/query'

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
  | 'computeExchanges'

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
  'computeExchanges',
]

export type ActionHookContext = ActionExecutionContext & {
  actionId: string
  phase: ActionHookPhase
  transactionEvents: readonly GameEvent[]
  actionEvents?: readonly GameEvent[]
  eventQuery: EventQuery
  result?: ActionExecutionResult
  choice?: string
  doable?: boolean
}

type ActionHookContextInput =
  Omit<ActionHookContext, 'transactionEvents' | 'actionEvents' | 'eventQuery'> &
  Partial<Pick<ActionHookContext, 'transactionEvents' | 'actionEvents' | 'eventQuery'>>

export type FollowUpAction = string | { actionId: string; sourceCard?: string }

export type ActionHookResult = {
  doable?: boolean
  actionId?: string
  extraData?: Record<string, unknown>
  extraOptions?: ActionChoiceOption[]
  extraExchanges?: import('../contract/cards').CardExchange[]
  followUpActions?: FollowUpAction[]
  flow?: ActionFlow
  costs?: Partial<Resource>
  costAttribution?: import('../contract/types').ActionCostAttribution[]
  reserveResources?: Partial<Resource>
  trades?: import('../contract/types').Trade[]
  bonuses?: import('../contract/types').Bonus[]
  paymentResourceProviders?: import('../contract/types').CardProvidedPaymentResourceProvider[]
  sourceCard?: string
  countCardUse?: boolean
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

/** Production invokes hooks directly; tests may protect query inputs. */
export type ActionHookInvocationInterceptor = (
  registration: ActionHookRegistration,
  context: ActionHookContext,
  invoke: ActionHookHandler,
) => ActionHookResult | void

let invocationInterceptor: ActionHookInvocationInterceptor | undefined

export const setActionHookInvocationInterceptor = (interceptor: ActionHookInvocationInterceptor | undefined): void => {
  invocationInterceptor = interceptor
}

export const registerActionHook = (registration: ActionHookRegistration) => {
  actionHooks.push(registration)
}

export const clearActionHooks = () => {
  actionHooks.length = 0
}

export const unregisterActionHook = (id: string): void => {
  const idx = actionHooks.findIndex((h) => h.id === id)
  if (idx >= 0) actionHooks.splice(idx, 1)
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

const normalizeActionHookContext = (
  context: ActionHookContextInput,
): ActionHookContext => {
  const transactionEvents = context.transactionEvents ?? []
  return {
    ...context,
    transactionEvents,
    eventQuery: context.eventQuery ?? createEventQuery(transactionEvents),
  }
}

export const hasMatchingActionHooks = (context: ActionHookContextInput): boolean => {
  const hookContext = normalizeActionHookContext(context)
  return actionHooks.some((registration) => matchesHook(registration, hookContext))
}

export const runActionHooks = (context: ActionHookContextInput) => {
  const hookContext = normalizeActionHookContext(context)
  const results: ActionHookResult[] = []
  getOrderedHooks(hookContext).forEach((registration) => {
    const result = invocationInterceptor
      ? invocationInterceptor(registration, hookContext, registration.handler)
      : registration.handler(hookContext)
    if (result) {
      results.push(result)
    }
  })
  return results
}

export const applyIsDoableHooksDetailed = (
  context: Omit<ActionHookContextInput, 'phase' | 'doable'>,
  initialDoable: boolean,
) => {
  let doable = initialDoable
  let vetoed = false
  const hookContext = normalizeActionHookContext({
    ...context,
    phase: 'isDoable',
    doable,
  })
  for (const registration of getOrderedHooks(hookContext)) {
    const result = registration.handler({
      ...hookContext,
      doable,
    })
    if (result?.doable === false) {
      doable = false
      vetoed = true
    } else if (result?.doable === true && !vetoed) {
      doable = true
    }
  }
  return { doable, vetoed }
}

export const applyIsDoableHooks = (
  context: Omit<ActionHookContextInput, 'phase' | 'doable'>,
  initialDoable: boolean,
) => applyIsDoableHooksDetailed(context, initialDoable).doable

export const applyComputeReplaceHooks = (
  context: Omit<ActionHookContextInput, 'phase'>,
) => {
  let actionId = context.actionId
  const seen = new Set<string>()
  while (!seen.has(actionId)) {
    seen.add(actionId)
    let replaced = false
    const hookContext = normalizeActionHookContext({
      ...context,
      actionId,
      phase: 'computeReplace',
    })
    getOrderedHooks(hookContext).forEach((registration) => {
      const result = registration.handler(hookContext)
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
