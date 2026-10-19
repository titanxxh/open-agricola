import { parseAnytimeTurnAffiliation, type AnytimeTurnAffiliation } from '../contract/anytime-activation'
import type { ActionExecutionResult, ActionFlow } from '../contract/types'

export const INJECTED_ANYTIME_ACTION_CONTEXT_KEY = '__injectedAnytimeAction' as const
export const INJECTED_ANYTIME_RESULT_KEY = '__injectedAnytimeResult' as const
export const SUPPRESSED_BEFORE_LISTENER_IDS_KEY = '__suppressedBeforeListenerIds' as const
/**
 * Marks a leaf that only performs the interaction of another node of the same
 * action. That host keeps its replace, before and completion phases, so the
 * leaf matches no listeners or action hooks in them.
 */
export const HOST_OWNED_LISTENER_PHASES_KEY = '__hostOwnedListenerPhases' as const

export const areListenerPhasesHostOwned = (
  actionContext: Record<string, unknown> | undefined,
): boolean => actionContext?.[HOST_OWNED_LISTENER_PHASES_KEY] === true

export const getSuppressedBeforeListenerIds = (
  actionContext: Record<string, unknown> | undefined,
): string[] => {
  const value = actionContext?.[SUPPRESSED_BEFORE_LISTENER_IDS_KEY]
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

export const suppressBeforeListeners = (
  actionContext: Record<string, unknown> | undefined,
  listenerIds: readonly string[],
): Record<string, unknown> => ({
  ...(actionContext ?? {}),
  [SUPPRESSED_BEFORE_LISTENER_IDS_KEY]: [
    ...new Set([...getSuppressedBeforeListenerIds(actionContext), ...listenerIds]),
  ],
})

export const isInjectedAnytimeActionContext = (
  actionContext: Record<string, unknown> | undefined,
) => actionContext?.[INJECTED_ANYTIME_ACTION_CONTEXT_KEY] === true

const ANYTIME_TURN_CONTEXT_KEY = '__anytimeTurn'

export const readAnytimeTurn = (actionContext: Record<string, unknown> | undefined): AnytimeTurnAffiliation | undefined => {
  const value = actionContext?.[ANYTIME_TURN_CONTEXT_KEY]
  return value === undefined ? undefined : parseAnytimeTurnAffiliation(value)
}

export const tagAnytimeTurnFlow = (flow: ActionFlow, turn: AnytimeTurnAffiliation): ActionFlow => flow.type === 'leaf'
  ? { ...flow, actionContext: { ...flow.actionContext, [ANYTIME_TURN_CONTEXT_KEY]: turn } }
  : { ...flow, children: flow.children.map(child => tagAnytimeTurnFlow(child, turn)) }

export const tagInjectedAnytimeFlow = (flow: ActionFlow): ActionFlow => {
  if (flow.type === 'leaf') {
    return {
      ...flow,
      actionContext: {
        ...(flow.actionContext ?? {}),
        [INJECTED_ANYTIME_ACTION_CONTEXT_KEY]: true,
      },
    }
  }
  return {
    ...flow,
    children: flow.children.map(tagInjectedAnytimeFlow),
  }
}

export const withInjectedAnytimeResultFlag = (
  result: ActionExecutionResult,
  actionContext: Record<string, unknown> | undefined,
): ActionExecutionResult => {
  if (!isInjectedAnytimeActionContext(actionContext)) return result
  if (result.type !== 'ok' && result.type !== 'flow') return result
  return {
    ...result,
    extraData: {
      ...(result.extraData ?? {}),
      [INJECTED_ANYTIME_RESULT_KEY]: true,
    },
  }
}

export const isInjectedAnytimeResult = (
  result: ActionExecutionResult,
) => 'extraData' in result && result.extraData?.[INJECTED_ANYTIME_RESULT_KEY] === true
