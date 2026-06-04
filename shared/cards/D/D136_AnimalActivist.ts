import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'D136_AnimalActivist'
const roundsLeftWoodBonus = (state: { round: number }): number => {
  const remaining = 14 - state.round
  if (remaining >= 9) return 4
  if (remaining >= 6) return 3
  if (remaining >= 3) return 2
  return 0
}

const cardImpl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    const wood = roundsLeftWoodBonus(state)
    if (wood <= 0) return
    return gainLeaf(CARD_ID, { wood })
  },
  computeBonusScore: (state, player) => {
    const fencedStables = (p: typeof player) =>
      p.pastures.reduce((sum, past) => sum + past.stables, 0)
    const myCount = fencedStables(player)
    const maxCount = Math.max(...state.players.map(fencedStables))
    return myCount === maxCount && myCount > 0 ? 2 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D136_AnimalActivist = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Animal Activist",
    deck: "D",
    number: 136,
    category: "POINTS_PROVIDER",
    desc: [
        'If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD>. During scoring, each player with the most fenced stables gets 2 bonus <SCORE>.',
      ],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const D136_AnimalActivist_impl = D136_AnimalActivist.impl
