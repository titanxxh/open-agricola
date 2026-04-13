import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D139_Chairman'

const opponentListener: CardListenerRegistration = {
  id: 'D139-chairman-opponent-meeting-place',
  cardIds: [CARD_ID],
  actions: ['meeting-place'],
  phases: ['before' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'meeting-place') return
    const ownerId = context.ownerPlayer?.id
    if (!ownerId) return
    return {
      flow: {
        type: 'seq',
        children: [
          // Give food to the opponent (acting player) — runs under acting player context
          gainLeaf(CARD_ID, { food: 1 }),
          // Give food to the card owner via targeted gain
          {
            type: 'leaf',
            actionId: 'gain-trigger-player',
            params: { food: 1, targetPlayerId: ownerId },
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const playerListener: CardListenerRegistration = {
  id: 'D139-chairman-player-meeting-place',
  cardIds: [CARD_ID],
  actions: ['meeting-place'],
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'meeting-place') return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(opponentListener)
registerCardListener(playerListener)

export const D139_Chairman = new Occupation({
  id: CARD_ID,
  name: "Chairman",
  deck: "D",
  number: 139,
  category: "FOOD_PROVIDER",
  desc: [
    "Each time any player uses the __Meeting Place__, you get 1 <FOOD>. When an opponent uses it, they also get 1 <FOOD>.",
  ],
  cost: {},
  players: "3+",
})
