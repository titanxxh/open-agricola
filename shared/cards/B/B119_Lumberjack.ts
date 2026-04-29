import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import { queueFutureMeeplesFlow } from '../../actions/effects/future-meeples'
import { getFenceCount } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'

const CARD_ID = 'B119_Lumberjack'

export const B119_Lumberjack = new Occupation({
  id: CARD_ID,
  name: 'Lumberjack',
  deck: 'B',
  number: 119,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['You immediately get 1 <WOOD>. Additionally, place 1 <WOOD> on each of the next round spaces, up to the number of fences you built. At the start of these rounds, you get the <WOOD>.'],
  cost: {},
  players: '1+',
})

export const B119_Lumberjack_impl = {
  effect: {
  id: CARD_ID,
  onBuy: (state, player) => {
    const fencesBuilt = getFenceCount(player)
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
