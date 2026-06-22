import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { EXTENSION_MEEPLE_SPACE_IDS, isExtensionMeepleSpaceId } from '../helpers/action-space-categories'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A174_MasterHora'

const listener: CardListenerRegistration = {
  id: 'A174-master-hora-before-extension-space',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: Array.from(EXTENSION_MEEPLE_SPACE_IDS),
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isExtensionMeepleSpaceId(context.space?.id)) return
    if ((context.player.resources.food ?? 0) < 1) return
    return {
      ...payGainNode({
        cardId: CARD_ID,
        cost: { food: 1 },
        gain: { vegetable: 1 },
      }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A174_MasterHora = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Master Hora',
    deck: 'A',
    number: 174,
    category: 'CROP_PROVIDER',
    desc: ['Immediately before each time you place a person on an action space with the (meeple) symbol on the game board extension, you can buy 1 vegetable for 1 food.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A174_MasterHora_impl = A174_MasterHora.impl
