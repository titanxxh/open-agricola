import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookResult } from '../../actions/hooks'
import { sumActionSpaceMovedToPlayer } from '../helpers/event-provenance'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E077_Mattock'
const listener: CardListenerRegistration = {
  id: 'E77-mattock-after-collect',
  previousIds: ['E77-mattock-place-farmer'],
  cardIds: [CARD_ID],
  phases: ['after'],
  actionSpaces: 'all',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Old cursors also captured a dormant placement reaction on non-market spaces.
    if (context.actionId === 'place-farmer' && context.space.id !== 'resource-market-4') return
    const events = context.actionEvents ?? context.transactionEvents
    if (!(['reed', 'stone'] as const).some(resource =>
      sumActionSpaceMovedToPlayer(events, resource, context.player.id) > 0)) return
    return { flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E077_Mattock = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Mattock',
    deck: 'E',
    number: 77,
    category: 'BUILDING_RESOURCES_-_CLAY',
    desc: ['Each time you get <REED> and/or <STONE> from an action space, you get 1 additional <CLAY>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const E077_Mattock_impl = E077_Mattock.impl
