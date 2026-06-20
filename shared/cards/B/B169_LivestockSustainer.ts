import { defineOccupationCard } from '../card-source'
import { collectCardsAs } from '../helpers/card-type'
import type { CardImpl } from '../registry'
import type { GameState, PlayerState } from '../../contract/types'

const CARD_ID = 'B169_LivestockSustainer'
const MAX_CAPACITY = 8
const ANIMAL_TYPES = ['sheep', 'boar', 'cattle'] as const
type AnimalType = (typeof ANIMAL_TYPES)[number]

const isAnimalType = (value: unknown): value is AnimalType =>
  ANIMAL_TYPES.includes(value as AnimalType)

const countOtherPlayerMajors = (player: PlayerState, state: GameState) => {
  const players = Array.isArray(state.players) ? state.players : [player]
  const count = players.reduce((sum, other) => {
    if (other.id === player.id) return sum
    return sum + collectCardsAs(other, 'major').length
  }, 0)
  return Math.min(count, MAX_CAPACITY)
}

const readHeldAnimals = (player: PlayerState, capacity: number) => {
  const extra = player.cardStates?.[CARD_ID]?.extraData as
    | { held?: unknown; animalType?: unknown }
    | undefined
  if (!isAnimalType(extra?.animalType)) return { animalType: null, animalCount: 0 }
  if (typeof extra.held !== 'number' || !Number.isFinite(extra.held)) {
    return { animalType: null, animalCount: 0 }
  }
  const animalCount = Math.min(capacity, Math.max(0, Math.floor(extra.held)))
  return animalCount > 0
    ? { animalType: extra.animalType, animalCount }
    : { animalType: null, animalCount: 0 }
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeAnimalZones: (player, zones, state) => {
      const capacity = countOtherPlayerMajors(player, state)
      if (capacity <= 0) return
      const held = readHeldAnimals(player, capacity)
      zones.push({
        id: `card:${CARD_ID}`,
        zoneType: 'card',
        cardId: CARD_ID,
        capacity,
        animalType: held.animalType,
        animalCount: held.animalCount,
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
