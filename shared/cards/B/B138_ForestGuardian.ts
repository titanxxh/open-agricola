import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B138_ForestGuardian'

/**
 * B138 Forest Guardian:
 * onBuy: gain 2 wood.
 * Before an opponent collects from a wood accumulation space with 5+ wood,
 * the opponent must pay 1 food to the card owner.
 *
 * Wood accumulation spaces: forest, copse, grove.
 * Triggers on 'before' phase of 'collect' action when space has 5+ wood.
 */
const WOOD_SPACES = new Set(['forest', 'copse', 'grove'])

const onBuyListener: CardListenerRegistration = {
  id: 'B138-forest-guardian-onbuy',
  cardIds: [CARD_ID],
  actions: ['play-occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    return { flow: gainLeaf(CARD_ID, { wood: 2 }), sourceCard: CARD_ID }
  },
}

const collectListener: CardListenerRegistration = {
  id: 'B138-forest-guardian-before-opponent-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['before' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId || !WOOD_SPACES.has(spaceId)) return

    // Check if 5+ wood on the space
    const woodOnSpace = context.space?.resources?.wood ?? 0
    if (woodOnSpace < 5) return

    const ownerId = context.ownerPlayer?.id
    if (!ownerId) return

    return {
      flow: {
        type: 'seq',
        children: [
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

registerCardListener(onBuyListener)
registerCardListener(collectListener)

export const B138_ForestGuardian = new Occupation({
  id: CARD_ID,
  name: 'Forest Guardian',
  deck: 'B',
  number: 138,
  category: 'FOOD_PROVIDER',
  desc: [
    'When you play this card, you immediately get 2 <WOOD>. Each time before another player collects 5+ <WOOD> from a wood accumulation space, they must pay you 1 <FOOD>.',
  ],
  cost: {},
  players: '3+',
})
