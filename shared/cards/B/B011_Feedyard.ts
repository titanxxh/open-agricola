import { defineMinorCard } from '../card-source'
import { playerBoard } from '../../domain'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B011_Feedyard'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones, _state) => {
      const pastureCount = player.pastures.length
      if (pastureCount === 0) return
      zones.push({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        cardId: CARD_ID,
        capacity: pastureCount,
        animalType: null,
        animalCount: 0,
        allowedAnimalType: null,
      })
    },
    /**
     * The reference `Cards/B/the reference::getInvalidAnimals`:
     * dynamic cap = pasture count; extras invalid.
     */
    getInvalidAnimals: (player, _zone, meeples) => {
      const cap = player.pastures.length
      return meeples.filter((_m, idx) => idx >= cap)
    },
    /**
     * The reference `onPlayerEndHarvest`: 1 food per unused spot on the card zone
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

export const B011_Feedyard = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Feedyard',
    deck: 'B',
    number: 11,
    category: 'FARM_PLANNER',
    desc: ['This card can hold 1 animal for each pasture you have, even different types. After the breeding phase of each harvest, you get 1 <FOOD> for each unused spot on this card.'],
    cost: { clay: 1, grain: 1 },
    animalHolder: true,
    vp: 1,
  },
  impl: cardImpl,
})

export const B011_Feedyard_impl = B011_Feedyard.impl
