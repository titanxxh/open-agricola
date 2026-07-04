import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { computeAnimalZones, readAnimalCountsForZoneAssignment } from '../../domain/animal-zones'
import type { CardImpl } from '../registry'

const CARD_ID = 'B172_CattleCaregiver'
const hasLegallyHeldCattle = (
  state: Parameters<typeof computeAnimalZones>[1],
  player: Parameters<typeof computeAnimalZones>[0],
) => {
  return computeAnimalZones(player, state).some((zone) =>
    zone.capacity > 0 && readAnimalCountsForZoneAssignment(zone).cattle > 0,
  )
}

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
    desc: ['At the start of each round, if 3/4/5+ players each have at least 1 <CATTLE>, you get 1/2/3 <FOOD>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B172_CattleCaregiver_impl = B172_CattleCaregiver.impl
