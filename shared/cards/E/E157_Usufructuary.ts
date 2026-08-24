import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { countTriggerCardsAs } from '../helpers/trigger-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'E157_Usufructuary'
const listener: CardListenerRegistration = {
  id: 'E157-usufructuary-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (countTriggerCardsAs(context, context.player, 'occupation') !== 1) return
    const otherOccupations = context.state.players
      .filter((p) => p.id !== context.player.id)
      .reduce((sum, p) => sum + countTriggerCardsAs(context, p, 'occupation'), 0)
    if (otherOccupations <= 0) return
    const food = Math.min(7, otherOccupations)
    return { flow: gainLeaf(CARD_ID, { food }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E157_Usufructuary = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Usufructuary',
    deck: 'E',
    number: 157,
    category: 'FOOD',
    desc: [
        'When you play this card as your first occupation, you immediately get 1 <FOOD> for every other occupation in play (by any player), up to a maximum of 7 <FOOD>.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const E157_Usufructuary_impl = E157_Usufructuary.impl
