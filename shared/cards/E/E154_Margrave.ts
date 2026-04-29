import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E154_Margrave'

const renovateListener: CardListenerRegistration = {
  id: 'E154-margrave-opponent-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'stone') return
    return { flow: gainLeaf(CARD_ID, { food: 2 }), sourceCard: CARD_ID }
  },
}

export const E154_Margrave = new Occupation({
  id: CARD_ID,
  name: "Margrave",
  deck: "E",
  number: 154,
  category: "POINTS_PROVIDER",
  desc: ['Once you live in a stone house, you get 2 <FOOD> each time any player renovates and, during scoring, 1 bonus <SCORE> for each wood house and clay house.'],
  cost: {},
  players: "4+",
})

export const E154_Margrave_impl = {
  listeners: [renovateListener],
  effect: {
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (player.houseType !== 'stone') return 0
    return state.players.filter((p) => p.id !== player.id && p.houseType !== 'stone').length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
