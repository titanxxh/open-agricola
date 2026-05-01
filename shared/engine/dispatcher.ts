import type {
  ActionDefinition,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
} from '../game/types'
import type { ActionHookResult } from '../actions/hooks'
import {
  applyComputeReplaceHooks,
  applyIsDoableHooks,
  runActionHooks,
} from '../actions/hooks'
import { getMatchingListeners, executeCardListener, type MatchedCardListener, type CardListenerContext } from '../cards/card-listeners'
import { resolveActionPreviewCost } from '../actions/helpers/cost-preview'
import { canPayResources } from '../actions/helpers/payment'

export type EffectPhaseResult = {
  actionHookResults: ActionHookResult[]
  matchedListeners: MatchedCardListener[]
}

export type ComputeReplaceResult = {
  actionId: string
  declined: boolean
  alternativeFlow?: ActionFlow
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
    const previewResults = this.previewComputeCosts(context)
    const costOverride = previewResults.reduce<Record<string, number>>((acc, entry) => {
      if (!entry.costs) return acc
      Object.entries(entry.costs).forEach(([key, value]) => {
        if (typeof value !== 'number') return
        acc[key] = (acc[key] ?? 0) + value
      })
      return acc
    }, {})
    if (preview.canExecute) {
      return preview.canExecute(context, costOverride)
    }
    const previewCost = resolveActionPreviewCost(preview, context, costOverride)
    return canPayResources(context.player, previewCost)
  }

  applyComputeReplace(context: ActionExecutionContext & { actionId: string }): ComputeReplaceResult {
    let actionId = applyComputeReplaceHooks(context)
    let declined = false
    let alternativeFlow: ActionFlow | undefined
    let sourceCard = context.sourceCard
    const listenerContext: CardListenerContext = { ...context, phase: 'computeReplace' }
    const matched = getMatchingListeners(listenerContext)
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, listenerContext, {
        ownerPlayerId: entry.ownerPlayerId,
      })
      if (result) {
        if (typeof result.actionId === 'string') {
          actionId = result.actionId
        }
        if (typeof result.sourceCard === 'string' && result.sourceCard.length > 0) {
          sourceCard = result.sourceCard
        }
        if (result.decline) {
          declined = true
          alternativeFlow = result.alternativeFlow
        }
      }
    }
    return { actionId, declined, alternativeFlow, sourceCard }
  }

  applyIsDoable(
    context: ActionExecutionContext & { actionId: string },
    action: ActionDefinition,
    initialDoable: boolean,
  ) {
    let doable = this.applyCostPreviewDoable(context, action, initialDoable)
    doable = applyIsDoableHooks(context, doable)
    const listenerContext: CardListenerContext = { ...context, phase: 'isDoable', doable }
    const matched = getMatchingListeners(listenerContext)
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, listenerContext, {
        ownerPlayerId: entry.ownerPlayerId,
      })
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
      const result = executeCardListener(entry.registration, listenerContext, {
        ownerPlayerId: entry.ownerPlayerId,
      })
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
      const result2 = executeCardListener(entry.registration, listenerContext, {
        ownerPlayerId: entry.ownerPlayerId,
      })
      if (result2) listenerResults.push(result2)
    }
    return [...actionResults, ...listenerResults]
  }

  computeChoiceCandidates(
    context: ActionExecutionContext & { actionId: string },
  ) {
    const actionResults = runActionHooks({ ...context, phase: 'computeChoiceCandidates' })
    const listenerContext: CardListenerContext = {
      ...context,
      phase: 'computeChoiceCandidates',
    }
    const matched = getMatchingListeners(listenerContext)
    const listenerResults: ActionHookResult[] = []
    for (const entry of matched) {
      const result = executeCardListener(entry.registration, listenerContext, {
        ownerPlayerId: entry.ownerPlayerId,
      })
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
