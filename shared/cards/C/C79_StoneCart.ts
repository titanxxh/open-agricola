import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C79_StoneCart'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const evenRounds = [2, 4, 6, 8, 10, 12, 14].filter((r) => r > state.round)
    if (evenRounds.length === 0) return
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: evenRounds.map((round) => ({ round, resources: { stone: 1 } })),
    })
    return futureMeeplesNode()
  },
})

export const C79_StoneCart = new MinorImprovement({
  id: CARD_ID,
  name: "Stone Cart",
  deck: "C",
  number: 79,
  category: "RESOURCE_STONE",
  desc: ["Place 1 <STONE> on each remaining even-numbered round space. At the start of these rounds, you get the <STONE>."],
  cost: { wood: 2 },
  prerequisite: "2 Occupations",
  occupationPrerequisites: { min: 2 },
})
