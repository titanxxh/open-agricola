import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'D154_ChimneySweep'

const renovateCostListener: CardListenerRegistration = {
  id: 'D154-chimney-sweep-compute-costs-renovation',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { costs: { stone: -2 } }
  },
}

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

export const D154_ChimneySweep_impl = {
  listeners: [renovateCostListener],
  effect: {
  id: CARD_ID,
  computeBonusScore: (state, player) => {
    return state.players.filter((p) => p.id !== player.id && p.houseType === 'stone').length
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
