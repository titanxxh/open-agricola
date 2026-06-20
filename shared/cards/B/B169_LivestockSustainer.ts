import { defineOccupationCard } from '../card-source'
import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'
import type { GameState, PlayerState } from '../../contract/types'
import {
  clampAnimalCountsToCapacity,
  readAnimalHolderCounts,
  singleAnimalType,
  sumAnimalCounts,
} from '../../domain/animal-holder-state'

const CARD_ID = 'B169_LivestockSustainer'
const MAX_CAPACITY = 8

const countOtherPlayerMajors = (player: PlayerState, state: GameState) => {
  const players = Array.isArray(state.players) ? state.players : [player]
  const count = players.reduce((sum, other) => {
    if (other.id === player.id) return sum
    return sum + collectCardsAs(other, 'major').length
  }, 0)
  return Math.min(count, MAX_CAPACITY)
}

const visibleHeldAnimals = (player: PlayerState, capacity: number) => {
  const existing = player.cardStates?.[CARD_ID]
  const existingExtra = existing?.extraData as Record<string, unknown> | undefined
  const held = readAnimalHolderCounts(existingExtra)
  return clampAnimalCountsToCapacity(held, capacity).counts
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones, state) => {
      const capacity = countOtherPlayerMajors(player, state)
      const held = visibleHeldAnimals(player, capacity)
      if (capacity <= 0) return
      zones.push({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        cardId: CARD_ID,
        capacity,
        animalType: singleAnimalType(held),
        animalCount: sumAnimalCounts(held),
        animalCounts: held,
      })
    },
    getInvalidAnimals: () => [],
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B169_LivestockSustainer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Livestock Sustainer',
    deck: 'B',
    number: 169,
    category: 'FARM_PLANNER',
    desc: ['For each major improvement built by the other players, you can keep 1 animal on this card (max. 8). You can keep different types here.'],
    cost: {},
    players: '5+',
    animalHolder: true,
  },
  impl: cardImpl,
})

export const B169_LivestockSustainer_impl = B169_LivestockSustainer.impl
