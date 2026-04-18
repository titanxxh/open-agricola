import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { positionKey } from '../../game/farm'
import type { PlayerState } from '../../game/types'
import { registerFieldEffect } from '../../actions/effects/field-effect-registry'
import { fieldTopStack, fieldIsEmpty } from '../../game/field'

const CARD_ID = 'D72_StableManure'

registerFieldEffect('harvest-extra', ({ player, fields }) => {
  for (const key of fields) {
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

registerCardEffect({
  id: CARD_ID,
  onStartHarvestFieldPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const unfencedCount = countUnfencedStables(player)
    if (unfencedCount === 0) return

    // Fields with crops that have remaining > 0 (harvestable)
    const croppedFields = player.fields.filter(f => !fieldIsEmpty(f))
    if (croppedFields.length === 0) return

    return {
      type: 'leaf',
      actionId: 'field-select',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        fieldFilter: 'has-crop',
        maxSelections: unfencedCount,
        fieldEffect: 'harvest-extra',
      },
    }
  },
})

export const D72_StableManure = new MinorImprovement({
  id: CARD_ID,
  name: "Stable Manure",
  deck: "D",
  number: 72,
  category: "CROP_PROVIDER",
  desc: ["In the field phase of each harvest, you can harvest 1 additional good from a number of fields equal to the number of unfenced stables you have."],
  cost: {},
  prerequisite: "At Most 1 Occupation",
  occupationPrerequisites: {"max":1},
})
