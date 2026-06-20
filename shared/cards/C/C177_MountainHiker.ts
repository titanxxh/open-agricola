import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isExtension56AccumulationSpaceId } from '../helpers/action-space-categories'
import { payGainNode } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C177_MountainHiker'
const listener: CardListenerRegistration = {
  id: 'C177-mountain-hiker-after-extension-accumulation',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isExtension56AccumulationSpaceId(context.space?.id)) return
    if ((context.ownerPlayer?.resources.food ?? 0) < 1) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 1 },
      gain: { stone: 1 },
      choiceLabelKey: 'ui.interactionResourceExchange',
    })
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C177_MountainHiker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Mountain Hiker',
    deck: 'C',
    number: 177,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Immediately after each time you use an accumulation space on the game board extension, you can buy 1 stone for 1 food.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const C177_MountainHiker_impl = C177_MountainHiker.impl
