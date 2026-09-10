import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { isWoodAccumulationSpaceId } from '../helpers/action-space-categories'

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
const onBuyListener: CardListenerRegistration = {
  id: 'B138-forest-guardian-onbuy',
  cardIds: [CARD_ID],
  actions: ['occupation'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.choice !== CARD_ID) return
    return { flow: gainLeaf(CARD_ID, { wood: 2 }), sourceCard: CARD_ID }
  },
}

const collectListener: CardListenerRegistration = {
  id: 'B138-forest-guardian-before-opponent-collect',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['before' as ActionHookPhase],
  scope: 'opponent',
  mandatory: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!isWoodAccumulationSpaceId(spaceId)) return

    // Check if 5+ wood on the space
    const woodOnSpace = context.space?.resources?.wood ?? 0
    if (woodOnSpace < 5) return

    const ownerId = context.ownerPlayer?.id
    if (!ownerId) return

    const triggerPlayerId = context.triggerPlayer?.id ?? context.player.id

    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'gain',
            params: {
              food: 1,
              recipientPlayerId: ownerId,
              payerId: triggerPlayerId,
            },
            sourceCard: CARD_ID,
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [onBuyListener, collectListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B138_ForestGuardian = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Forest Guardian',
    deck: 'B',
    number: 138,
    category: 'GOODS_PROVIDER',
    desc: [
        'When you play this card, you immediately get 2 <WOOD>. Each time before another player takes at least 5 <WOOD> from an accumulation space, they must first pay you 1 <FOOD>.',
      ],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const B138_ForestGuardian_impl = B138_ForestGuardian.impl
