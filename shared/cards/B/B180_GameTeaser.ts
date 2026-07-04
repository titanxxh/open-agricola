import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isFoodAccumulationSpace } from '../helpers/action-space-categories'
import { sumActionSpaceMovedToTriggerPlayerFromSpace } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'B180_GameTeaser'
const listener: CardListenerRegistration = {
  id: 'B180-game-teaser-after-food-accumulation',
  cardIds: [CARD_ID],
  actions: ['collect'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isFoodAccumulationSpace(context.space)) return
    const food = sumActionSpaceMovedToTriggerPlayerFromSpace(context, 'food')
    if (food === 1) return { flow: gainLeaf(CARD_ID, { cattle: 1 }), sourceCard: CARD_ID }
    if (food === 2) return { flow: gainLeaf(CARD_ID, { boar: 1 }), sourceCard: CARD_ID }
    if (food === 3) return { flow: gainLeaf(CARD_ID, { sheep: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B180_GameTeaser = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Game Teaser',
    deck: 'B',
    number: 180,
    category: 'LIVESTOCK_PROVIDER',
    desc: ['Each time you take 1/2/3 <FOOD> from a <FOOD> accumulation space, you also get 1 <CATTLE>/<<PIG>>/<SHEEP>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const B180_GameTeaser_impl = B180_GameTeaser.impl
