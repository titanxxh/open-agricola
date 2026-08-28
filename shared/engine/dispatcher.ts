import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
} from '../contract/types'
import type { ActionHookResult } from '../actions/hooks'
import {
  applyComputeReplaceHooks,
  applyIsDoableHooksDetailed,
  hasMatchingActionHooks,
  runActionHooks,
} from '../actions/hooks'
import {
  executeCardListener,
  getMatchingListeners,
  listenerOwnerOptions,
  type MatchedCardListener,
} from '../cards/card-listeners'
import { resolveActionPreviewCost } from '../actions/helpers/cost-preview'
import { PaymentSolver } from '../actions/payment'
import { getSkipComputeReplaceListenerIds } from './replace-guard'
import { applyComputeCostResults } from './compute-cost-results'

export type EffectPhaseResult = {
  actionHookResults: ActionHookResult[]
  matchedListeners: MatchedCardListener[]
}

export type ComputeReplaceResult = {
  actionId: string
  alternatives: Array<{
    flow: ActionFlow
    sourceCard?: string
    replacementListenerIds: string[]
  }>
  sourceCard?: string
}

const cloneValue = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value)
    } catch {
      return JSON.parse(JSON.stringify(value)) as T
    }
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export class HookDispatcher {
  private previewComputeCosts(context: ActionExecutionContext & { actionId: string }) {
    const computeContext = { ...context, phase: 'computeCosts' as const }
    if (
      !hasMatchingActionHooks(computeContext) &&
      getMatchingListeners(computeContext).length === 0
    ) {
      return []
    }
    const clonedState = cloneValue(context.state)
    const clonedPlayer =
      clonedState.players?.find((player) => player.id === context.player.id) ??
      cloneValue(context.player)
    const clonedSpace =
      clonedState.actionSpaces?.find((space) => space.id === context.space.id) ??
      cloneValue(context.space)
    if (!clonedPlayer || !clonedSpace) return []
    return this.computeCosts({
      ...context,
      state: clonedState,
      player: clonedPlayer,
      space: clonedSpace,
    })
  }

  private applyCostPreviewDoable(
    context: ActionExecutionContext & { actionId: string },
    action: ActionDefinition,
    initialDoable: boolean,
  ) {
    const preview = action.costPreview
    if (!preview) return initialDoable
    if (preview.isStructurallyPossible && !preview.isStructurallyPossible(context)) {
      return false
    }
    const previewContext = { ...context }
    applyComputeCostResults(previewContext, this.previewComputeCosts(context))
    const costOverride = previewContext.costs ?? {}
    if (preview.canExecute) {
      return preview.canExecute(previewContext, costOverride)
    }
    const previewCost = resolveActionPreviewCost(preview, previewContext, costOverride)
    return PaymentSolver.canPayResources(context.player, previewCost)
  }

  applyComputeReplace(context: ActionExecutionContext & { actionId: string }): ComputeReplaceResult {
    if (context.actionContext?.checkedReplaceAction === true) {
      return { actionId: context.actionId, alternatives: [], sourceCard: context.sourceCard }
    }
    let actionId = applyComputeReplaceHooks(context)
    const alternatives: ComputeReplaceResult['alternatives'] = []
    let sourceCard = context.sourceCard
    const inheritedListenerIds = getSkipComputeReplaceListenerIds(context.actionContext)
    const skippedListenerIds = new Set(inheritedListenerIds)
    const listenerContext = { ...context, phase: 'computeReplace' as const }
    const matched = getMatchingListeners(listenerContext)
    for (const entry of matched) {
      if (skippedListenerIds.has(entry.registration.id)) continue
      const result = executeCardListener(entry.registration, listenerContext, listenerOwnerOptions(entry))
      if (result) {
        const resultSourceCard = typeof result.sourceCard === 'string' && result.sourceCard.length > 0
          ? result.sourceCard
          : undefined
        if (typeof result.actionId === 'string') {
          actionId = result.actionId
        }
        if (resultSourceCard) {
          sourceCard = resultSourceCard
        }
        if (result.decline && result.alternativeFlow) {
          alternatives.push({
            flow: result.alternativeFlow,
            sourceCard: resultSourceCard ?? (entry.cardId || context.sourceCard),
            replacementListenerIds: [...new Set([
              ...inheritedListenerIds,
              entry.registration.id,
            ])],
          })
          skippedListenerIds.add(entry.registration.id)
        }
      }
    }
    return { actionId, alternatives, sourceCard }
  }

  applyIsDoable(
    context: ActionExecutionContext & { actionId: string },
    action: ActionDefinition,
    initialDoable: boolean,
  ) {
    let doable = this.applyCostPreviewDoable(context, action, initialDoable)
    const actionHookDoable = applyIsDoableHooksDetailed(context, doable)
    doable = actionHookDoable.doable
    let vetoed = actionHookDoable.vetoed
    const listenerContext = { ...context, phase: 'isDoable' as const, doable }
    const matched = getMatchingListeners(listenerContext)
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, listenerContext, listenerOwnerOptions(entry))
      if (result?.doable === false) {
        doable = false
        vetoed = true
      } else if (result?.doable === true && !vetoed) {
        doable = true
      }
    }
    return doable
  }

  computeCosts(context: ActionExecutionContext & { actionId: string }) {
    const actionResults = runActionHooks({ ...context, phase: 'computeCosts' })
    const listenerContext = { ...context, phase: 'computeCosts' as const }
    const matched = getMatchingListeners(listenerContext)
    const listenerResults: ActionHookResult[] = []
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, listenerContext, listenerOwnerOptions(entry))
      if (result) listenerResults.push(result)
    }
    return [...actionResults, ...listenerResults]
  }

  computeArgs(
    context: ActionExecutionContext & { actionId: string },
    result: ActionExecutionResult,
  ) {
    const actionResults = runActionHooks({ ...context, phase: 'computeArgs', result })
    const listenerContext = { ...context, phase: 'computeArgs' as const, result }
    const matched = getMatchingListeners(listenerContext)
    const listenerResults: ActionHookResult[] = []
    for (const entry of matched) {
      const result2 = executeCardListener(entry.registration, listenerContext, listenerOwnerOptions(entry))
      if (result2) listenerResults.push(result2)
    }
    return [...actionResults, ...listenerResults]
  }

  computeChoiceCandidates(
    context: ActionExecutionContext & { actionId: string },
  ) {
    const actionResults = runActionHooks({ ...context, phase: 'computeChoiceCandidates' })
    const listenerContext = {
      ...context,
      phase: 'computeChoiceCandidates' as const,
    }
    const matched = getMatchingListeners(listenerContext)
    const listenerResults: ActionHookResult[] = []
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, listenerContext, listenerOwnerOptions(entry))
      if (result) listenerResults.push(result)
    }
    return [...actionResults, ...listenerResults]
  }

  isOptionAffordable(
    context: ActionExecutionContext & { actionId: string },
    action: ActionDefinition,
  ) {
    return this.applyCostPreviewDoable(context, action, true)
  }

  before(context: ActionExecutionContext & { actionId: string }): EffectPhaseResult {
    return {
      actionHookResults: runActionHooks({ ...context, phase: 'before' }),
      matchedListeners: context.actionId === 'place-farmer'
        ? []
        : getMatchingListeners({ ...context, phase: 'before' }),
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
    context: ActionExecutionContext & { actionId: string; choice?: string },
    result: ActionExecutionResult,
    choice?: string,
  ): EffectPhaseResult {
    return {
      actionHookResults: runActionHooks({ ...context, phase: 'immediatelyAfter', result, choice }),
      matchedListeners: getMatchingListeners({ ...context, phase: 'immediatelyAfter', result, choice }),
    }
  }

  after(
    context: ActionExecutionContext & { actionId: string; choice?: string },
    result: ActionExecutionResult,
    choice?: string,
  ): EffectPhaseResult {
    return {
      actionHookResults: runActionHooks({ ...context, phase: 'after', result, choice }),
      matchedListeners: getMatchingListeners({ ...context, phase: 'after', result, choice }),
    }
  }
}
