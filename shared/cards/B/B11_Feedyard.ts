import { playerBoard } from '../../domain'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { B11_Feedyard } from '../../cards-display/B/B11_Feedyard'
export { B11_Feedyard }

const CARD_ID = B11_Feedyard.id

export const B11_Feedyard_impl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones) => {
      const pastureCount = player.pastures.length
      if (pastureCount === 0) return
      zones.push({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        cardId: CARD_ID,
        capacity: pastureCount,
        animalType: null,
        animalCount: 0,
      })
    },
    /**
     * BGA `Cards/B/B11_Feedyard.php::getInvalidAnimals`:
     * dynamic cap = pasture count; extras invalid.
     */
    getInvalidAnimals: (player, _zone, meeples) => {
      const cap = player.pastures.length
      return meeples.filter((_m, idx) => idx >= cap)
    },
    /**
     * BGA `onPlayerEndHarvest`: 1 food per unused spot on the card zone
     * (capacity - animalCount). Single-card hook — runs after the breed
     * phase via the existing onEndHarvest dispatch.
     */
    onEndHarvest: (state, player) => {
      const idx = state.players.indexOf(player)
      const zone = playerBoard(state, idx).animals.zones().find((z) => z.id === `card:${CARD_ID}`)
      if (!zone) return
      const unused = zone.capacity - (zone.animalCount ?? 0)
      if (unused <= 0) return
      return gainLeaf(CARD_ID, { food: unused })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
