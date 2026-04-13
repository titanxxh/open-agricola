import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const CARD_ID = 'A150_Stagehand'

const listener: CardListenerRegistration = {
  id: 'A150-stagehand-opponent-traveling-players',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'traveling-players') return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          { type: 'leaf', actionId: 'fence', sourceCard: CARD_ID, actionContext: { trueAction: false } },
          { type: 'leaf', actionId: 'stables', sourceCard: CARD_ID, actionContext: { trueAction: false } },
          { type: 'leaf', actionId: 'construct', sourceCard: CARD_ID, actionContext: { maxRooms: 1, trueAction: false } },
        ],
      },
      logKey: 'log.cardGrantedAction',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A150_Stagehand = new Occupation({
  id: CARD_ID,
  name: 'Stagehand',
  deck: 'A',
  number: 150,
  category: 'ACTION_SPACE_EXTENDER',
  desc: ['Each time another player uses the Traveling Players accumulation space, you can take your choice of a Build Fences, Build Stables, or Build Rooms action.'],
  cost: {},
  players: '1+',
})
