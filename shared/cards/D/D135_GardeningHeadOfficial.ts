import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { fieldHasCrop, fieldFindStackOfKind } from '../../game/field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D135_GardeningHeadOfficial'

const roundsLeftWoodBonus = (state: { round: number }): number => {
  const remaining = 14 - state.round
  if (remaining >= 9) return 4
  if (remaining >= 6) return 3
  if (remaining >= 3) return 2
  return 0
}

export const D135_GardeningHeadOfficial = new Occupation({
  id: CARD_ID,
  name: "Gardening Head Official",
  deck: "D",
  number: 135,
  category: "POINTS_PROVIDER",
  desc: [
    'If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD>. During scoring, each player with the most vegetables in their fields gets 2 bonus <SCORE>.',
  ],
  cost: {},
  players: "3+",
})

export const D135_GardeningHeadOfficial_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state) => {
    const wood = roundsLeftWoodBonus(state)
    if (wood <= 0) return
    return gainLeaf(CARD_ID, { wood })
  },
  computeBonusScore: (state, player) => {
    const vegInFields = (p: typeof player) =>
      p.fields
        .filter((f) => fieldHasCrop(f, 'vegetable'))
        .reduce((sum, f) => sum + (fieldFindStackOfKind(f, 'vegetable')?.remaining ?? 0), 0)
    const myVeg = vegInFields(player)
    const maxVeg = Math.max(...state.players.map(vegInFields))
    return myVeg === maxVeg && myVeg > 0 ? 2 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
