import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { computeAnimalZones } from '../../domain/animal-zones'
import type { CardImpl } from '../registry'

const CARD_ID = 'B172_CattleCaregiver'
const hasLegallyHeldCattle = (
  state: Parameters<typeof computeAnimalZones>[1],
  player: Parameters<typeof computeAnimalZones>[0],
) => computeAnimalZones(player, state).some((zone) =>
  zone.animalType === 'cattle' && (zone.animalCount ?? 0) > 0 && zone.capacity > 0)

const cardImpl = {
  effect: {
    id: CARD_ID,
    onRoundStart: (state) => {
      const cattleOwners = state.players.filter((player) => hasLegallyHeldCattle(state, player)).length
      if (cattleOwners < 3) return
      return gainLeaf(CARD_ID, { food: Math.min(3, cattleOwners - 2) })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B172_CattleCaregiver = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Cattle Caregiver',
    deck: 'B',
    number: 172,
    category: 'FOOD_PROVIDER',
    desc: ['At the start of each round, if 3/4/5+ players each have at least 1 cattle, you get 1/2/3 food.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B172_CattleCaregiver_impl = B172_CattleCaregiver.impl
