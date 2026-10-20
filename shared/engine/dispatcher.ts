import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
} from '../contract/types'
import type { ActionHookResult } from '../actions/hooks'
import { type ActionHookRegistry, requireActionHookRegistry } from '../actions/hooks'
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
import { areListenerPhasesHostOwned, getSuppressedBeforeListenerIds } from './action-context-flags'

export type EffectPhaseResult = {
  actionHookResults: ActionHookResult[]
  matchedListeners: MatchedCardListener[]
}

const noEffectPhase = (): EffectPhaseResult => ({ actionHookResults: [], matchedListeners: [] })

export type ComputeReplaceResult = {
  actionId: string
  alternatives: Array<{
    flow: ActionFlow
    sourceCard?: string
    replacementListenerIds: string[]
  }>
  sourceCard?: string
}

export class HookDispatcher {
  readonly actionHooks: ActionHookRegistry

  constructor(actionHooks: ActionHookRegistry) { this.actionHooks = requireActionHookRegistry(actionHooks) }

  private previewComputeCosts(context: ActionExecutionContext & { actionId: string }) {
    const computeContext = { ...context, phase: 'computeCosts' as const }
    if (
      !this.actionHooks.hasMatching(computeContext) &&
      getMatchingListeners(computeContext).length === 0
    ) {
      return []
    }
    return this.computeCosts(context)
  }

  private applyCostPreviewDoable(
    context: ActionExecutionContext & { actionId: string },
    action: ActionDefinition,
    initialDoable: boolean | (() => boolean),
  ) {
    const preview = action.costPreview
    if (!preview) return typeof initialDoable === 'function' ? initialDoable() : initialDoable
    if (preview.isStructurallyPossible && !preview.isStructurallyPossible(context)) {
      return false
    }
    const previewContext = { ...context, actionHooks: this.actionHooks }
    applyComputeCostResults(previewContext, this.previewComputeCosts(context))
    const costOverride = previewContext.costs ?? {}
    if (preview.canExecute) {
      return preview.canExecute(previewContext, costOverride)
    }
    const previewCost = resolveActionPreviewCost(preview, previewContext, costOverride)
    return PaymentSolver.canPayResources(context.player, previewCost)
  }

  applyComputeReplace(context: ActionExecutionContext & { actionId: string }): ComputeReplaceResult {
    if (context.actionContext?.checkedReplaceAction === true || areListenerPhasesHostOwned(context.actionContext)) {
      return { actionId: context.actionId, alternatives: [], sourceCard: context.sourceCard }
    }
    let actionId = this.actionHooks.applyComputeReplace({ ...context, actionHooks: this.actionHooks })
    const alternatives: ComputeReplaceResult['alternatives'] = []
    let sourceCard = context.sourceCard
    const inheritedListenerIds = getSkipComputeReplaceListenerIds(context.actionContext)
    const skippedListenerIds = new Set(inheritedListenerIds)
    const listenerContext = { ...context, actionHooks: this.actionHooks, phase: 'computeReplace' as const }
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
        if (resultSourceCard && !(result.decline && result.alternativeFlow)) {
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
    initialDoable: boolean | (() => boolean),
    canStartBefore?: () => boolean,
    originalAllowed: boolean | (() => boolean) = () => action.originalActionCondition?.(context) ?? true,
  ) {
    let doable = this.applyCostPreviewDoable(context, action, initialDoable)
    const actionHookDoable = this.actionHooks.applyIsDoableDetailed({ ...context, actionHooks: this.actionHooks }, doable)
    doable = actionHookDoable.doable
    let vetoed = actionHookDoable.vetoed
    const listenerContext = { ...context, actionHooks: this.actionHooks, phase: 'isDoable' as const, doable }
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
    return (doable && (typeof originalAllowed === 'function' ? originalAllowed() : originalAllowed))
      || (!vetoed && canStartBefore?.() === true)
  }

  computeCosts(context: ActionExecutionContext & { actionId: string }) {
    const actionResults = this.actionHooks.run({ ...context, actionHooks: this.actionHooks, phase: 'computeCosts' })
    const listenerContext = { ...context, actionHooks: this.actionHooks, phase: 'computeCosts' as const }
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
    if (context.actionId === 'place-farmer') return []
    const actionResults = this.actionHooks.run({ ...context, actionHooks: this.actionHooks, phase: 'computeArgs', result })
    const listenerContext = { ...context, actionHooks: this.actionHooks, phase: 'computeArgs' as const, result }
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
    const actionResults = this.actionHooks.run({ ...context, actionHooks: this.actionHooks, phase: 'computeChoiceCandidates' })
    const listenerContext = {
      ...context,
      actionHooks: this.actionHooks,
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
    if (areListenerPhasesHostOwned(context.actionContext)) return noEffectPhase()
    const suppressed = new Set(getSuppressedBeforeListenerIds(context.actionContext))
    return {
      actionHookResults: this.actionHooks.run({ ...context, actionHooks: this.actionHooks, phase: 'before' }),
      matchedListeners: context.actionId === 'place-farmer' || context.actionSpaceUse
        ? []
        : getMatchingListeners({ ...context, actionHooks: this.actionHooks, phase: 'before' })
          .filter((entry) => !suppressed.has(entry.registration.id)),
    }
  }

  immediatelyAfter(
    context: ActionExecutionContext & { actionId: string; choice?: string },
    result: ActionExecutionResult,
    choice?: string,
  ): EffectPhaseResult {
    if (areListenerPhasesHostOwned(context.actionContext)) return noEffectPhase()
    return {
      actionHookResults: this.actionHooks.run({ ...context, actionHooks: this.actionHooks, phase: 'immediatelyAfter', result, choice }),
      matchedListeners: context.actionSpaceUse ? []
        : getMatchingListeners({ ...context, actionHooks: this.actionHooks, phase: 'immediatelyAfter', result, choice }),
    }
  }

  after(
    context: ActionExecutionContext & { actionId: string; choice?: string },
    result: ActionExecutionResult,
    choice?: string,
  ): EffectPhaseResult {
    if (areListenerPhasesHostOwned(context.actionContext)) return noEffectPhase()
    return {
      actionHookResults: this.actionHooks.run({ ...context, actionHooks: this.actionHooks, phase: 'after', result, choice }),
      matchedListeners: context.actionSpaceUse ? []
        : getMatchingListeners({ ...context, actionHooks: this.actionHooks, phase: 'after', result, choice }),
    }
  }
}
