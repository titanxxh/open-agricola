import { positionKey } from '../../domain/farm'
import type { PlayerState } from '../../contract/types'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { fieldTopStack, fieldIsEmpty } from '../../domain/field'
import type { CardImpl } from '../registry'
import { D72_StableManure } from '../../cards-display/D/D72_StableManure'

const CARD_ID = D72_StableManure.id

registerSelectionEffect('harvest-extra', ({ player, positions }) => {
  for (const key of positions) {
    const [r, c] = key.split('-').map(Number)
    const field = player.fields.find(f => f.row === r && f.col === c)
    if (!field) continue
    const top = fieldTopStack(field)
    if (!top) continue
    player.resources[top.kind] = (player.resources[top.kind] ?? 0) + 1
  }
})

/**
 * Count stables not inside any fenced pasture.
 * A stable is "unfenced" if its tile does not belong to any pasture.
 */
const countUnfencedStables = (player: PlayerState): number => {
  const pastureTileKeys = new Set<string>()
  for (const pasture of player.pastures) {
    for (const tile of pasture.tiles) {
      pastureTileKeys.add(positionKey(tile))
    }
  }
  return player.stableTiles.filter(s => !pastureTileKeys.has(positionKey(s))).length
}

export const D72_StableManure_impl = {
  effect: {
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    const unfencedCount = countUnfencedStables(player)
    if (unfencedCount === 0) return

    // Fields with crops that have remaining > 0 (harvestable)
    const croppedFields = player.fields.filter(f => !fieldIsEmpty(f))
    if (croppedFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'selection',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        selectionKind: 'farm-position',
        positionFilter: 'has-crop',
        maxSelections: unfencedCount,
        selectionEffect: 'harvest-extra',
      },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
