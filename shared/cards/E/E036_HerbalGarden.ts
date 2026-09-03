import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'
import { playerBoard } from '../../domain'
import { areRequiredEmptyZoneGroupsSatisfied } from '../../domain/animal-zones'

const CARD_ID = 'E036_HerbalGarden'
const REQUIRED_EMPTY_GROUP_ID = `${CARD_ID}:pastures`

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const playerIndex = state.players.indexOf(player)
      if (playerIndex < 0) return
      if (areRequiredEmptyZoneGroupsSatisfied(playerBoard(state, playerIndex).animals.zones())) return
      return { type: 'leaf', actionId: 'reorganize', sourceCard: CARD_ID }
    },
    onComputeAnimalZones: (_player, zones, _state) => {
      for (const zone of zones) {
        if (zone.zoneType !== 'pasture') continue
        zone.requiredEmptyZoneGroupIds ??= []
        if (!zone.requiredEmptyZoneGroupIds.includes(REQUIRED_EMPTY_GROUP_ID)) {
          zone.requiredEmptyZoneGroupIds.push(REQUIRED_EMPTY_GROUP_ID)
        }
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E036_HerbalGarden = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Herbal Garden',
    deck: 'E',
    number: 36,
    category: 'BONUS_POINTS_-_GET',
    desc: ['From now on, at least one of your pastures must contain no animals.'],
    cost: { wood: 1 },
    vp: 2,
    prerequisite: '1 Pasture',
  },
  impl: cardImpl,
})

export const E036_HerbalGarden_impl = E036_HerbalGarden.impl
