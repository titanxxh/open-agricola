import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C47_GardenClaw'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const plantedFields = player.fields.filter((f) => f.crop !== null).length
    if (plantedFields === 0) return
    const count = plantedFields * 3
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count,
      resources: { food: 1 },
    })
    return futureMeeplesNode()
  },
})

export const C47_GardenClaw = new MinorImprovement({
  id: CARD_ID,
  name: "Garden Claw",
  deck: "C",
  number: 47,
  category: "FOOD_PROVIDER",
  desc: ["Place 1 <FOOD> on each remaining round space, up to three times the number of planted fields you have. At the start of these rounds, you get the <FOOD>."],
  cost: { wood: 1 },
  newSet: true,
})
