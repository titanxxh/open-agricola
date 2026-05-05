import { Occupation } from '../types'
import { playerBoard } from '../../domain'
import type { CardImpl } from '../registry'

const CARD_ID = 'B98_OrganicFarmer'

export const B98_OrganicFarmer = new Occupation({
  id: CARD_ID,
  name: "Organic Farmer",
  deck: "B",
  number: 98,
  category: "POINTS_PROVIDER",
  desc: ['During the scoring, you get 1 bonus <SCORE> for each pasture containing at least 1 animal while having unused capacity for at least three more animals.'],
  cost: {},
  players: "1+",
})

export const B98_OrganicFarmer_impl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    const idx = state.players.indexOf(player)
    const zones = playerBoard(state, idx).animals.zones()
    return zones.filter((z) => z.zoneType === 'pasture' && (z.animalCount ?? 0) > 0 && z.capacity - (z.animalCount ?? 0) >= 3).length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
