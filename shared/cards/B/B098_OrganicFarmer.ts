import { defineOccupationCard } from '../card-source'
import { playerBoard } from '../../domain'
import type { CardImpl } from '../registry'

const CARD_ID = 'B098_OrganicFarmer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    const idx = state.players.findIndex((p) => p.id === player.id)
    if (idx < 0) return 0
    const zones = playerBoard(state, idx).animals.zones()
    return zones.filter((z) => z.zoneType === 'pasture' && (z.animalCount ?? 0) > 0 && z.capacity - (z.animalCount ?? 0) >= 3).length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B098_OrganicFarmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Organic Farmer",
    deck: "B",
    number: 98,
    category: "POINTS_PROVIDER",
    desc: ['During the scoring, you get 1 bonus <SCORE> for each pasture containing at least 1 animal while having unused capacity for at least three more animals.'],
    cost: {},
    players: "1+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const B098_OrganicFarmer_impl = B098_OrganicFarmer.impl
