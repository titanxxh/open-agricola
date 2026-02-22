import type { ActionExecutionContext, ActionExecutionResult } from '../game/types'
import {
  applyComputeReplaceHooks,
  applyIsDoableHooks,
  runActionHooks,
} from '../actions/hooks'

export class HookDispatcher {
  applyComputeReplace(context: ActionExecutionContext & { actionId: string }) {
    return applyComputeReplaceHooks(context)
  }

  applyIsDoable(
    context: ActionExecutionContext & { actionId: string },
    initialDoable: boolean,
  ) {
    return applyIsDoableHooks(context, initialDoable)
  }

  before(context: ActionExecutionContext & { actionId: string }) {
    return runActionHooks({ ...context, phase: 'before' })
  }

  during(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ) {
    return runActionHooks({ ...context, phase: 'during', result })
  }

  immediatelyAfter(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ) {
    return runActionHooks({ ...context, phase: 'immediatelyAfter', result })
  }

  after(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ) {
    return runActionHooks({ ...context, phase: 'after', result })
  }

  computeArgs(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ) {
    return runActionHooks({ ...context, phase: 'computeArgs', result })
  }

  computeCosts(context: ActionExecutionContext & { actionId: string }) {
    return runActionHooks({ ...context, phase: 'computeCosts' })
  }
}
