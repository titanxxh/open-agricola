import type { GameState, PlayerState, Resource } from '../../contract/types'

const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const satisfies readonly (keyof Resource)[]

/** Unoccupied accumulation spaces holding a building resource the player does not have in supply. */
export function missingBuildingResourceSpaceIds(state: GameState, player: PlayerState): string[] {
  const missing = BUILDING_RESOURCES.filter((resource) => (player.resources[resource] ?? 0) === 0)
  const ids: string[] = []
  for (const space of state.actionSpaces) {
    if (space.takenBy.length > 0) continue
    for (const resource of missing) {
      if ((space.gainPerRound[resource] ?? 0) <= 0) continue
      if ((space.resources[resource] ?? 0) <= 0) continue
      ids.push(space.id)
      break
    }
  }
  return ids
}
