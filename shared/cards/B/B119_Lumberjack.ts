import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { gainLeaf } from '../helpers/pay-gain-node'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'

const CARD_ID = 'B119_Lumberjack'

// BGA: gain 1 wood immediately, then place 1 wood on each of next N rounds where N = fences built.
registerCardEffect({
  id: CARD_ID,
  onBuy: (state, player) => {
    const fencesBuilt = player.fences
    const children = [gainLeaf(CARD_ID, { wood: 1 })]
    if (fencesBuilt > 0) {
      children.push(
        queueFutureMeeplesFlow(state, {
          cardId: CARD_ID,
          playerId: player.id,
          startRound: state.round + 1,
          count: fencesBuilt,
          resources: { wood: 1 },
        }),
      )
    }
    return { type: 'seq' as const, children }
  },
})

export const B119_Lumberjack = new Occupation({
  id: CARD_ID,
  name: 'Lumberjack',
  deck: 'B',
  number: 119,
  category: 'RESOURCE_WOOD',
  desc: ['You immediately get 1 <WOOD>. Additionally, place 1 <WOOD> on each of the next round spaces, up to the number of fences you built. At the start of these rounds, you get the <WOOD>.'],
  cost: {},
  players: '1+',
})
