import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldFindStackOfKind } from '../../domain/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'E135_Pickler'
const roundsLeftWoodBonus = (state: { round: number }): number => {
  const remaining = 14 - state.round
  if (remaining >= 9) return 4
  if (remaining >= 6) return 3
  if (remaining >= 3) return 2
  if (remaining >= 1) return 1
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
    const totalVeg = (p: typeof player) =>
      (p.resources.vegetable ?? 0) + p.fields
        .filter((f) => fieldHasCrop(f, 'vegetable'))
        .reduce((sum, f) => sum + (fieldFindStackOfKind(f, 'vegetable')?.remaining ?? 0), 0)
    const myVeg = totalVeg(player)
    const maxVeg = Math.max(...state.players.map(totalVeg))
    return myVeg === maxVeg && myVeg > 0 ? 3 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E135_Pickler = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Pickler",
    deck: "E",
    number: 135,
    category: "BONUS_POINTS_-_4_WOOD_CARD_COMPETITION",
    desc: ['If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with the most total <VEGETABLE> gets 3 bonus <SCORE>.'],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const E135_Pickler_impl = E135_Pickler.impl
