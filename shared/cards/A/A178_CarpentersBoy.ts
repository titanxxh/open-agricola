import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A178_CarpentersBoy'
const listener: CardListenerRegistration = {
  id: 'A178-carpenters-boy-opponent-construct',
  cardIds: [CARD_ID],
  actions: ['construct'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const roomsBuilt = getRoomsBuiltThisAction(context.triggerPlayer ?? context.player)
    if (roomsBuilt <= 0) return
    return { flow: gainLeaf(CARD_ID, { wood: roomsBuilt }), sourceCard: CARD_ID }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A178_CarpentersBoy = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Carpenter's Boy",
    deck: 'A',
    number: 178,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each time another player builds a room, you immediately get 1 <WOOD>.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A178_CarpentersBoy_impl = A178_CarpentersBoy.impl
