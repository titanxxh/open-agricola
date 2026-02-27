import type { ActionExecutionContext, ActionExecutionResult } from '../game/types'
import {
  applyComputeReplaceHooks,
  applyIsDoableHooks,
  runActionHooks,
} from '../actions/hooks'
import { runCardListeners } from '../cards/card-listeners'

export class HookDispatcher {
  applyComputeReplace(context: ActionExecutionContext & { actionId: string }) {
    let actionId = applyComputeReplaceHooks(context)
    const cardResults = runCardListeners({
      ...context,
      phase: 'computeReplace',
    })
    cardResults.forEach((result) => {
      if (typeof result.actionId === 'string') {
        actionId = result.actionId
      }
    })
    return actionId
  }

  applyIsDoable(
    context: ActionExecutionContext & { actionId: string },
    initialDoable: boolean,
  ) {
    let doable = applyIsDoableHooks(context, initialDoable)
    const cardResults = runCardListeners({
      ...context,
      phase: 'isDoable',
      doable,
    })
    cardResults.forEach((result) => {
      if (typeof result.doable === 'boolean') {
        doable = result.doable
      }
    })
    return doable
  }

  before(context: ActionExecutionContext & { actionId: string }) {
    return [
      ...runActionHooks({ ...context, phase: 'before' }),
      ...runCardListeners({ ...context, phase: 'before' }),
    ]
  }

  during(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ) {
    return [
      ...runActionHooks({ ...context, phase: 'during', result }),
      ...runCardListeners({ ...context, phase: 'during', result }),
    ]
  }

  immediatelyAfter(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ) {
    return [
      ...runActionHooks({ ...context, phase: 'immediatelyAfter', result }),
      ...runCardListeners({ ...context, phase: 'immediatelyAfter', result }),
    ]
  }

  after(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ) {
    return [
      ...runActionHooks({ ...context, phase: 'after', result }),
      ...runCardListeners({ ...context, phase: 'after', result }),
    ]
  }

  computeArgs(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ) {
    return [
      ...runActionHooks({ ...context, phase: 'computeArgs', result }),
      ...runCardListeners({ ...context, phase: 'computeArgs', result }),
    ]
  }

  computeCosts(context: ActionExecutionContext & { actionId: string }) {
    return [
      ...runActionHooks({ ...context, phase: 'computeCosts' }),
      ...runCardListeners({ ...context, phase: 'computeCosts' }),
    ]
  }
}
