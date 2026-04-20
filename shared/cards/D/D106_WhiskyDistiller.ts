import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { initCardState } from '../__stubs__/helpers'
import type { CardImpl } from '../registry'

const CARD_ID = 'D106_WhiskyDistiller'

const anytimeListener: CardListenerRegistration = {
  id: 'D106-whisky-distiller-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round > 12) return // no round+2 would exist after round 12
    if ((context.player.resources.grain ?? 0) < 1) return
    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
          {
            type: 'leaf',
            actionId: 'store-on-card',
            params: { pending: 1 },
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.D106_WhiskyDistiller.anytime',
    }
  },
}

export const D106_WhiskyDistiller = new Occupation({
  id: CARD_ID,
  name: 'Whisky Distiller',
  deck: 'D',
  number: 106,
  category: 'FOOD_PROVIDER',
  desc: ['At any time, you can pay 1 <GRAIN>. If you do, add 2 to the current round and place 4 <FOOD> on the corresponding round space. At the start of that round, you get the <FOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const D106_WhiskyDistiller_impl = {
  listeners: [anytimeListener],
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {
    const pending = player.cardStates?.[CARD_ID]?.counters?.pending ?? 0
    if (pending <= 0) return
    const counters = initCardState(player, CARD_ID)
    counters.pending = pending - 1
    return gainLeaf(CARD_ID, { food: 4 })
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
