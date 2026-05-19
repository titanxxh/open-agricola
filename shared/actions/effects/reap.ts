import type { ActionExecutionResult, GameState, HarvestReapSummary, PlayerState } from '../../contract/types'
import type { ActionSpace } from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { fieldTopStack, fieldPopIfDepleted } from '../../domain/field'
import { runCardListeners } from '../../cards/card-listeners'
import { executeImmediateSpecialEffectFlows } from './internal/immediate-special-effect-flow'
import { EventStore } from '../../events/store'

/**
 * Dispatch a 'reap' synthetic action event to card listeners.
 * Called after base field reap and after each extra-reap card produces crops.
 */
export const dispatchReapListener = (
  state: GameState,
  player: PlayerState,
  crop: 'grain' | 'vegetable' | 'wood' | 'stone',
  amount: number,
  eventSink?: EventSink,
): void => {
  if (amount <= 0) return
  const space = {} as ActionSpace
  const results = runCardListeners({
    state,
    player,
    space,
    actionId: 'reap',
    phase: 'immediatelyAfter',
    extraData: { crop, amount },
  }) ?? []
  if (eventSink) {
    executeImmediateSpecialEffectFlows({ state, player, space, eventSink, results })
    return
  }
  if (results.length === 0) return
  if (!Array.isArray(state.events)) state.events = []
  if (!Number.isSafeInteger(state.nextEventSeq) || state.nextEventSeq < 1) {
    state.nextEventSeq = 1
  }
  const store = new EventStore()
  const frame = store.beginFrame({
    actorPlayerId: player.id,
    sourceActionId: 'reap',
  })
  executeImmediateSpecialEffectFlows({ state, player, space, eventSink: frame.sink, results })
  const completed = frame.complete(state)
  if (completed.length > 0) {
    store.commitTransaction(state)
  } else {
    store.rollbackTransaction()
  }
}

export const reap = (
  state: GameState,
  player: PlayerState,
  eventSink?: EventSink,
): ActionExecutionResult & { reapSummary: HarvestReapSummary } => {
  const reapSummary: HarvestReapSummary = {
    resources: {},
    grainFields: 0,
    vegetableFields: 0,
    harvestedPositions: [],
  }
  let stoneFields = 0
  player.fields.forEach((field) => {
    const top = fieldTopStack(field)
    if (!top || top.remaining <= 0) return
    const kind = top.kind
    player.resources[kind] = (player.resources[kind] ?? 0) + 1
    reapSummary.resources[kind] = (reapSummary.resources[kind] ?? 0) + 1
    if (kind === 'grain') {
      reapSummary.grainFields += 1
    } else if (kind === 'vegetable') {
      reapSummary.vegetableFields += 1
    } else if (kind === 'stone') {
      stoneFields += 1
    }
    reapSummary.harvestedPositions!.push({ row: field.row, col: field.col })
    top.remaining -= 1
    fieldPopIfDepleted(field)
  })

  if (reapSummary.grainFields > 0) {
    dispatchReapListener(state, player, 'grain', reapSummary.grainFields, eventSink)
  }
  if (reapSummary.vegetableFields > 0) {
    dispatchReapListener(state, player, 'vegetable', reapSummary.vegetableFields, eventSink)
  }
  if (stoneFields > 0) {
    dispatchReapListener(state, player, 'stone', stoneFields, eventSink)
  }

  return { type: 'ok', reapSummary }
}
