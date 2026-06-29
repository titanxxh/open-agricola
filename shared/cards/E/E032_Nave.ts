import { defineMinorCard } from '../card-source'
import type { CardImpl } from '../registry'

const CARD_ID = 'E032_Nave'

const cardImpl = {
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const cols = new Set(player.roomTiles.map((t) => t.col))
    return cols.size
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E032_Nave = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Nave",
    deck: "E",
    number: 32,
    category: "BONUS_POINTS_-_GET",
    desc: ['During scoring, you get 1 bonus <SCORE> for each of the 5 columns of your farmyard board containing at least one room.'],
    cost: { stone: 2, reed: 1 },
    vp: 0,
    extraVp: true,
  },
  impl: cardImpl,
})

export const E032_Nave_impl = E032_Nave.impl
