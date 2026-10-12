import type { FarmTilePosition, GameState, PlayerState, Resource } from '../contract/types'
import { getMajorCard } from '../cards/major'
import { getRegisteredMinorImprovement, getRegisteredOccupation } from '../cards/registry-display'
import { moorSpecialActionBaseResources } from '../domain/moor-special-action-values'
import type { MoorSpecialActionId } from './types'

export { MOOR_SPECIAL_ACTION_BORROW_FOOD, moorSpecialActionBorrowCost } from '../domain/moor-special-action-values'

export type MoorSpecialActionEffectPlan = {
  cost: Partial<Resource>
  gain: Partial<Resource>
  terrain?: {
    operation: 'remove' | 'replace-with-field'
    from: 'moor' | 'forest'
    tile?: FarmTilePosition
    visibleLayerOnly: true
    requiresUncovered?: true
    adjacentFieldRequiredWhenPresent?: true
  }
  improvementTypes?: readonly ('major' | 'minor')[]
}

/** Reads only declared rules and current public card/resource facts. */
export const getMoorSpecialActionEffectPlan = (
  state: GameState,
  player: PlayerState,
  actionId: MoorSpecialActionId,
  payload: { tile?: FarmTilePosition } = {},
): MoorSpecialActionEffectPlan => {
  const base = moorSpecialActionBaseResources(actionId, state.players.length)
  const gain = { ...base.gain }
  if (actionId === 'cut-peat' || actionId === 'fell-trees') {
    const cards = [
      ...player.improvements.map(getMajorCard),
      ...player.minorPlayed.map(getRegisteredMinorImprovement),
      ...player.occupationPlayed.map(getRegisteredOccupation),
    ]
    for (const card of cards) for (const bonus of state.enableFarmersOfTheMoor ? card?.moorSpecialActionBonuses ?? [] : []) {
      if (bonus.actionId !== actionId) continue
      const amount = (player.resources.horse ?? 0) > 0 && bonus.horseAmount !== undefined ? bonus.horseAmount : bonus.amount
      if (amount > 0) gain[bonus.resource] = (gain[bonus.resource] ?? 0) + amount
    }
  }
  return {
    cost: { ...base.cost }, gain,
    ...(actionId === 'cut-peat' || actionId === 'fell-trees' || actionId === 'slash-and-burn' ? {
      terrain: {
        operation: actionId === 'slash-and-burn' ? 'replace-with-field' : 'remove',
        from: actionId === 'cut-peat' ? 'moor' : 'forest', tile: payload.tile,
        visibleLayerOnly: true,
        ...(actionId === 'slash-and-burn' ? { requiresUncovered: true, adjacentFieldRequiredWhenPresent: true } : {}),
      },
    } as const : {}),
    ...(actionId === 'black-market' || actionId === 'illicit-work' ? { improvementTypes: [actionId === 'black-market' ? 'minor' : 'major'] } : {}),
  }
}
