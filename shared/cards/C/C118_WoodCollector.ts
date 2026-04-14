import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'C118_WoodCollector'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      startRound: state.round + 1,
      count: 5,
      resources: { wood: 1 },
    })
    return futureMeeplesNode()
  },
})

export const C118_WoodCollector = new Occupation({
  id: CARD_ID,
  name: "Wood Collector",
  deck: "C",
  number: 118,
  category: "RESOURCE_WOOD",
  desc: ["Place 1 <WOOD> on each of the next 5 round spaces. At the start of these rounds, you get the <WOOD>."],
  players: "1+",
})
