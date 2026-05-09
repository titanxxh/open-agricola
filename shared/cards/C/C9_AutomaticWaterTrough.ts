import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import { playerBoard } from '../../domain'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { C9_AutomaticWaterTrough } from '../../cards-display/C/C9_AutomaticWaterTrough'

const CARD_ID = C9_AutomaticWaterTrough.id

/**
 * C9 Automatic Water Trough — Minor Improvement
 *
 * BGA `C9_AutomaticWaterTrough::onBuy`:
 *   - `getValidAnimals()` walks the player's animal drop zones to find which
 *     of {sheep, pig, cattle} can actually be accommodated (zone has spare
 *     capacity AND is either empty or already holds the same type, with
 *     constraints respected).
 *   - If the list is empty, return void (no XOR offered).
 *   - Otherwise return XOR(optional) over the valid animals only:
 *       sheep → gain 1 sheep (cost 0)
 *       pig   → pay 1 food, gain 1 boar
 *       cattle → pay 2 food, gain 1 cattle
 *
 * Our previous implementation always emitted all 3 children unconditionally
 * AND tagged the card `passing: true` to mask the missing zone gate.
 *
 * Implementation:
 *   - `canAccommodate(player, type)` walks `computeAnimalZones(player)` and
 *     returns true if any zone is currently empty (count === 0) and has
 *     capacity ≥ 1, OR already holds `type` and has capacity > current count.
 *   - The XOR is built only from accommodable types; if none, return
 *     undefined so onBuy resolves cleanly.
 */

const canAccommodate = (state: GameState, player: PlayerState, type: 'sheep' | 'boar' | 'cattle'): boolean => {
  const idx = state.players.indexOf(player)
  const zones = playerBoard(state, idx).animals.zones()
  for (const zone of zones) {
    if (zone.blocked) continue
    if ((zone.capacity ?? 0) <= 0) continue
    const count = zone.animalCount ?? 0
    if (count === 0) {
      // Empty zone with at least 1 capacity can take any animal.
      return true
    }
    if (zone.animalType === type && count < (zone.capacity ?? 0)) {
      return true
    }
  }
  return false
}

export const C9_AutomaticWaterTrough_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player): ActionFlow | undefined => {
      const sheepValid = canAccommodate(state, player, 'sheep')
      const boarValid = canAccommodate(state, player, 'boar')
      const cattleValid = canAccommodate(state, player, 'cattle')
      const children: ActionFlow[] = []
      if (sheepValid) {
        children.push(gainLeaf(CARD_ID, { sheep: 1 }))
      }
      if (boarValid) {
        children.push({
          type: 'seq',
          children: [
            payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
            gainLeaf(CARD_ID, { boar: 1 }),
          ],
        })
      }
      if (cattleValid) {
        children.push({
          type: 'seq',
          children: [
            payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
            gainLeaf(CARD_ID, { cattle: 1 }),
          ],
        })
      }
      if (children.length === 0) return undefined
      return {
        type: 'xor',
        optional: true,
        children,
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
