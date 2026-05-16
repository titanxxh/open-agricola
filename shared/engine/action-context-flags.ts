import type { ActionExecutionResult, ActionFlow } from '../contract/types'

export const INJECTED_ANYTIME_ACTION_CONTEXT_KEY = '__injectedAnytimeAction' as const
export const INJECTED_ANYTIME_RESULT_KEY = '__injectedAnytimeResult' as const

export const isInjectedAnytimeActionContext = (
  actionContext: Record<string, unknown> | undefined,
) => actionContext?.[INJECTED_ANYTIME_ACTION_CONTEXT_KEY] === true

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
