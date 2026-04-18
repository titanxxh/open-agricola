import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldIsEmpty } from '../../game/field'

const CARD_ID = 'D63_Lynchet'

/**
 * D63 Lynchet:
 * In the field phase of each harvest, you get 1 food for each harvested
 * field tile that is orthogonally adjacent to your house.
 *
 * BGA: isActionEvent(Reap) && trigger == HARVEST && countFields > 0.
 * countFields: iterates harvested field positions, checks isAdjacentToType(roomType).
 *
 * Implementation: onAfterReap hook. After reap, fields with crop !== null were
 * harvested and still have remaining > 0. Fields depleted to remaining=0 had
 * their crop set to null. We use the reap summary totals to account for both.
 */
const isAdjacent = (a: { row: number; col: number }, b: { row: number; col: number }) =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1

registerCardEffect({
  id: CARD_ID,
  onAfterReap: (state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return

    const summary = state.harvestReapSummary?.[player.id]
    if (!summary) return
    const totalHarvested = (summary.grainFields ?? 0) + (summary.vegetableFields ?? 0)
    if (totalHarvested <= 0) return

    const roomTiles = player.roomTiles ?? []
    if (roomTiles.length === 0) return

    // Count fields with crop still set (harvested but not depleted) that are adjacent to rooms
    let adjacentHarvested = 0
    let stillSownCount = 0

    for (const field of player.fields) {
      if (!fieldIsEmpty(field)) {
        // This field was harvested and still has remaining > 0
        stillSownCount++
        if (roomTiles.some((rt) => isAdjacent(field, rt))) {
          adjacentHarvested++
        }
      }
    }

    // Some fields were depleted (remaining went from 1 to 0, crop set to null).
    // These now look like empty fields. Count how many such depleted fields exist.
    const depletedCount = totalHarvested - stillSownCount
    if (depletedCount > 0) {
      // Among empty fields (crop === null, remaining === 0) adjacent to rooms,
      // some may be just-depleted harvested fields.
      let adjacentEmpty = 0
      for (const field of player.fields) {
        if (fieldIsEmpty(field)) {
          if (roomTiles.some((rt) => isAdjacent(field, rt))) {
            adjacentEmpty++
          }
        }
      }
      adjacentHarvested += Math.min(depletedCount, adjacentEmpty)
    }

    if (adjacentHarvested <= 0) return
    return gainLeaf(CARD_ID, { food: adjacentHarvested })
  },
})

export const D63_Lynchet = new MinorImprovement({
  id: CARD_ID,
  name: 'Lynchet',
  deck: 'D',
  number: 63,
  category: 'FOOD_PROVIDER',
  desc: [
    'In the field phase of each harvest, you get 1 <FOOD> for each harvested field tile that is orthogonally adjacent to your house.',
  ],
  cost: {},
  evenMoreSet: true,
})
