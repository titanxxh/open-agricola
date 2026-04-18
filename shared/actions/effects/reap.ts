import type { ActionExecutionResult, GameState, HarvestReapSummary, PlayerState } from '../../game/types'
import type { ActionSpace } from '../../game/types'
import { fieldTopStack, fieldPopIfDepleted } from '../../game/field'
import { runCardListeners } from '../../cards/card-listeners'

/**
 * Dispatch a 'reap' synthetic action event to card listeners.
 * Called after base field reap and after each extra-reap card produces crops.
 */
export const dispatchReapListener = (
  state: GameState,
  player: PlayerState,
  crop: 'grain' | 'vegetable',
  amount: number,
): void => {
  if (amount <= 0) return
  runCardListeners({
    state,
    player,
    space: {} as ActionSpace,
    actionId: 'reap',
    phase: 'immediatelyAfter',
    extraData: { crop, amount },
  })
}

export const reap = (
  state: GameState,
  player: PlayerState,
): ActionExecutionResult & { reapSummary: HarvestReapSummary } => {
  const reapSummary: HarvestReapSummary = {
    resources: {},
    grainFields: 0,
    vegetableFields: 0,
  }
  player.fields.forEach((field) => {
    const top = fieldTopStack(field)
    if (!top || top.remaining <= 0) return
    const kind = top.kind
    player.resources[kind] = (player.resources[kind] ?? 0) + 1
    reapSummary.resources[kind] = (reapSummary.resources[kind] ?? 0) + 1
    if (kind === 'grain') {
      reapSummary.grainFields += 1
    } else {
      reapSummary.vegetableFields += 1
    }
    top.remaining -= 1
    fieldPopIfDepleted(field)
  })

  // Dispatch reap listeners per crop type
  if (reapSummary.grainFields > 0) {
    dispatchReapListener(state, player, 'grain', reapSummary.grainFields)
  }
  if (reapSummary.vegetableFields > 0) {
    dispatchReapListener(state, player, 'vegetable', reapSummary.vegetableFields)
  }

  return { type: 'ok', reapSummary }
}
