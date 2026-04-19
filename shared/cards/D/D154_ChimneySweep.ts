import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'D154_ChimneySweep'

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return 0
    return state.players.filter((p) => p.id !== player.id && p.houseType === 'stone').length
  },
})

const renovateCostListener: CardListenerRegistration = {
  id: 'D154-chimney-sweep-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { costs: { stone: -2 } }
  },
}

registerCardListener(renovateCostListener)

export const D154_ChimneySweep = new Occupation({
  id: CARD_ID,
  name: "Chimney Sweep",
  deck: "D",
  number: 154,
  category: "POINTS_PROVIDER",
  desc: [
    'Renovating to stone costs you 2 <STONE> less. During scoring, you get 1 bonus <SCORE> for each other player living in a stone house.',
  ],
  cost: {},
  players: "4+",
})
