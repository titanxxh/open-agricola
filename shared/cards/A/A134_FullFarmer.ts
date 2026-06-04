import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { playerBoard } from '../../domain'
import type { CardImpl } from '../registry'

const CARD_ID = 'A134_FullFarmer'

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: () => gainLeaf(CARD_ID, { wood: 1, clay: 1 }),
  computeBonusScore: (state, player) => {
    const idx = state.players.findIndex((p) => p.id === player.id)
    if (idx < 0) return 0
    const zones = playerBoard(state, idx).animals.zones()
    return zones.filter((z) => z.zoneType === 'pasture' && z.capacity > 0 && (z.animalCount ?? 0) >= z.capacity).length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A134_FullFarmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Full Farmer",
    deck: "A",
    number: 134,
    category: "POINTS_PROVIDER",
    desc: ["When you play this card, you immediately get 1 <WOOD> and 1 <CLAY>. During scoring, you get 1 bonus <SCORE> for each pasture you have holding the maximum number of animals."],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const A134_FullFarmer_impl = A134_FullFarmer.impl
