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
   * other phases (before / immediatelyAfter / after etc.) where
   * sequential side-effects may need deterministic ordering.
   */
  order?: number
  handler: ActionHookHandler
}

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

export class ActionHookRegistry {
  private readonly registrations: ActionHookRegistration[] = []

  register(registration: ActionHookRegistration): void { this.registrations.push(registration) }
  clear(): void { this.registrations.length = 0 }
  unregister(id: string): void {
    const index = this.registrations.findIndex(registration => registration.id === id)
    if (index >= 0) this.registrations.splice(index, 1)
  }
  getRegistered(): ActionHookRegistration[] { return [...this.registrations] }

  private ordered(context: ActionHookContext): ActionHookRegistration[] {
    return this.registrations.filter(registration =>
      (!registration.actions || registration.actions.includes(context.actionId)) &&
      (!registration.phases || registration.phases.includes(context.phase)))
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id))
  }

  hasMatching(context: ActionHookContextInput): boolean {
    return this.ordered(normalizeActionHookContext(context)).length > 0
  }

  run(context: ActionHookContextInput): ActionHookResult[] {
    const normalized = { ...normalizeActionHookContext(context), actionHooks: this }
    const results: ActionHookResult[] = []
    for (const registration of this.ordered(normalized)) {
      const result = invocationInterceptor
        ? invocationInterceptor(registration, normalized, registration.handler)
        : registration.handler(normalized)
      if (result) results.push(result)
    }
    return results
  }

  applyIsDoableDetailed(context: Omit<ActionHookContextInput, 'phase' | 'doable'>, initialDoable: boolean) {
    let doable = initialDoable
    let vetoed = false
    const normalized = normalizeActionHookContext({ ...context, actionHooks: this, phase: 'isDoable', doable })
    for (const registration of this.ordered(normalized)) {
      const result = registration.handler({ ...normalized, doable })
      if (result?.doable === false) { doable = false; vetoed = true }
      else if (result?.doable === true && !vetoed) doable = true
    }
    return { doable, vetoed }
  }

  applyComputeReplace(context: Omit<ActionHookContextInput, 'phase'>): string {
    let actionId = context.actionId
    const seen = new Set<string>()
    while (!seen.has(actionId)) {
      seen.add(actionId)
      let replaced = false
      const normalized = normalizeActionHookContext({ ...context, actionHooks: this, actionId, phase: 'computeReplace' })
      for (const registration of this.ordered(normalized)) {
        const result = registration.handler(normalized)
        if (typeof result?.actionId === 'string' && result.actionId !== actionId) {
          actionId = result.actionId
          replaced = true
        }
      }
      if (!replaced) break
    }
    return actionId
  }
}

export const requireActionHookRegistry = (registry: ActionHookRegistry | undefined): ActionHookRegistry => {
  if (!registry) throw new Error('ActionHookRegistry is required for this rule query')
  return registry
}
