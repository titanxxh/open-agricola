import type { ActionExecutionContext, ActionExecutionResult, ActionFlow } from '../game/types'
import type { ActionHookResult } from '../actions/hooks'
import {
  applyComputeReplaceHooks,
  applyIsDoableHooks,
  runActionHooks,
} from '../actions/hooks'
import {
  runCardListeners,
  getMatchingListeners,
  executeCardListener,
  type MatchedCardListener,
  type CardListenerContext,
} from '../cards/card-listeners'

export type EffectPhaseResult = {
  actionHookResults: ActionHookResult[]
  matchedListeners: MatchedCardListener[]
}

export type ComputeReplaceResult = {
  actionId: string
  declined: boolean
  alternativeFlow?: ActionFlow
}

export class HookDispatcher {
  applyComputeReplace(context: ActionExecutionContext & { actionId: string }): ComputeReplaceResult {
    let actionId = applyComputeReplaceHooks(context)
    let declined = false
    let alternativeFlow: ActionFlow | undefined
    const listenerContext: CardListenerContext = { ...context, phase: 'computeReplace' }
    const matched = getMatchingListeners(listenerContext)
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, listenerContext)
      if (result) {
        if (typeof result.actionId === 'string') {
          actionId = result.actionId
        }
        if (result.decline) {
          declined = true
          alternativeFlow = result.alternativeFlow
        }
      }
    }
    return { actionId, declined, alternativeFlow }
  }

  applyIsDoable(
    context: ActionExecutionContext & { actionId: string },
    initialDoable: boolean,
  ) {
    let doable = applyIsDoableHooks(context, initialDoable)
    const listenerContext: CardListenerContext = { ...context, phase: 'isDoable', doable }
    const matched = getMatchingListeners(listenerContext)
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, listenerContext)
      if (result && typeof result.doable === 'boolean') {
        doable = result.doable
      }
    }
    return doable
  }

  computeCosts(context: ActionExecutionContext & { actionId: string }) {
    const actionResults = runActionHooks({ ...context, phase: 'computeCosts' })
    const listenerContext: CardListenerContext = { ...context, phase: 'computeCosts' }
    const matched = getMatchingListeners(listenerContext)
    const listenerResults: ActionHookResult[] = []
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, listenerContext)
      if (result) listenerResults.push(result)
    }
    return [...actionResults, ...listenerResults]
  }

  computeArgs(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ) {
    const actionResults = runActionHooks({ ...context, phase: 'computeArgs', result })
    const listenerContext: CardListenerContext = { ...context, phase: 'computeArgs', result }
    const matched = getMatchingListeners(listenerContext)
    const listenerResults: ActionHookResult[] = []
    for (const entry of matched) {
      const result2 = executeCardListener(entry.registration, listenerContext)
      if (result2) listenerResults.push(result2)
    }
    return [...actionResults, ...listenerResults]
  }

  before(context: ActionExecutionContext & { actionId: string }): EffectPhaseResult {
    return {
      actionHookResults: runActionHooks({ ...context, phase: 'before' }),
      matchedListeners: getMatchingListeners({ ...context, phase: 'before' }),
    }
  }

  during(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ): EffectPhaseResult {
    return {
      actionHookResults: runActionHooks({ ...context, phase: 'during', result }),
      matchedListeners: getMatchingListeners({ ...context, phase: 'during', result }),
    }
  }

  immediatelyAfter(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
    choice?: string,
  ): EffectPhaseResult {
    return {
      actionHookResults: runActionHooks({ ...context, phase: 'immediatelyAfter', result, choice }),
      matchedListeners: getMatchingListeners({ ...context, phase: 'immediatelyAfter', result, choice }),
    }
  }

  after(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
    choice?: string,
  ): EffectPhaseResult {
    return {
      actionHookResults: runActionHooks({ ...context, phase: 'after', result, choice }),
      matchedListeners: getMatchingListeners({ ...context, phase: 'after', result, choice }),
    }
  }
}
