import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { queueFutureMeeples, futureMeeplesNode } from '../../actions/effects/future-meeples'

const CARD_ID = 'E119_LandHeir'

registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    if (state.round > 4) return

    const targetRound = 9
    if (targetRound <= state.round) return

    queueFutureMeeples(state, {
      cardId: CARD_ID,
      playerId: player.id,
      entries: [
        { round: targetRound, resources: { wood: 4 } },
        { round: targetRound, resources: { clay: 4 } },
      ],
    })
    return futureMeeplesNode()
  },
})

export const E119_LandHeir = new Occupation({
  id: CARD_ID,
  name: 'Land Heir',
  deck: 'E',
  number: 119,
  category: 'RESOURCE_WOOD',
  desc: ['If you play this card in round 4 or before, place 4 <WOOD> and 4 <CLAY> on the space for round 9. At the start of this round, you get the resources.'],
  players: '1+',
})
