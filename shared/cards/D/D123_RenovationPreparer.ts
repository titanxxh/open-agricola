import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'D123_RenovationPreparer'
const listener: CardListenerRegistration = {
  id: 'D123-renovation-preparer-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const roomsBuilt = getRoomsBuiltThisAction(context.player)
    if (roomsBuilt <= 0) return
    const houseType = context.player.houseType
    if (houseType === 'wood') {
      return { flow: gainLeaf(CARD_ID, { clay: 2 * roomsBuilt }), sourceCard: CARD_ID }
    } else if (houseType === 'clay') {
      return { flow: gainLeaf(CARD_ID, { stone: 2 * roomsBuilt }), sourceCard: CARD_ID }
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D123_RenovationPreparer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Renovation Preparer',
    deck: 'D',
    number: 123,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['For each new wood/clay room you build, you get 2 <CLAY>/2 <STONE>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D123_RenovationPreparer_impl = D123_RenovationPreparer.impl
