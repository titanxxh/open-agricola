import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getLogicalFields } from '../helpers/card-field'
import type { CardImpl } from '../registry'

const CARD_ID = 'D135_GardeningHeadOfficial'
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
  computeSharedPostScore: (state) => {
    const vegInFields = (player: (typeof state.players)[number]) =>
      getLogicalFields(player)
        .flatMap((field) => field.stacks)
        .filter((stack) => stack.kind === 'vegetable')
        .reduce((sum, stack) => sum + stack.remaining, 0)
    const maxVeg = Math.max(...state.players.map(vegInFields))
    return state.players.flatMap((player) =>
      vegInFields(player) === maxVeg ? [{ playerId: player.id, score: 2 }] : [],
    )
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D135_GardeningHeadOfficial = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Gardening Head Official",
    deck: "D",
    number: 135,
    category: "POINTS_PROVIDER",
    desc: [
        'If there are still 3/6/9 complete rounds left to play, you immediately get 2/3/4 <WOOD>. During scoring, each player with the most <VEGETABLE> in their <FIELD> gets 2 bonus <SCORE>.',
      ],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const D135_GardeningHeadOfficial_impl = D135_GardeningHeadOfficial.impl
