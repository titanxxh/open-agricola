import type { FarmyardTileUsage } from '../../contract/events'
import type { CardListenerContext } from '../card-listeners'
import { positionKey } from '../../domain/farmyard-geometry'

/** Only this host's committed geometry; nested hosts retain separate scopes. */
export const getActionNewlyUsedTiles = (context: Pick<CardListenerContext, 'actionEvents' | 'player'>) => {
  const tiles = new Map<string, FarmyardTileUsage>()
  for (const event of context.actionEvents ?? []) {
    if (!('schemaVersion' in event)) continue
    if (event.type !== 'farm.fieldPlowed' && event.type !== 'farm.roomBuilt'
      && event.type !== 'farm.stableBuilt' && event.type !== 'farm.fenceBuilt'
      && event.type !== 'farm.spacesUsed') continue
    for (const tile of event.newlyUsedTiles) {
      if (tile.playerId === context.player.id) tiles.set(positionKey(tile), { ...tile })
    }
  }
  return [...tiles.values()]
}
