import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getActionRoomConstructions } from '../helpers/construction-events'
import type { CardImpl } from '../registry'

const CARD_ID = 'D123_RenovationPreparer'
const listener: CardListenerRegistration = {
  id: 'D123-renovation-preparer-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gains = { clay: 0, stone: 0 }
    for (const operation of getActionRoomConstructions(context)) {
      if (operation.roomType === 'wood') gains.clay += 2 * operation.positions.length
      if (operation.roomType === 'clay') gains.stone += 2 * operation.positions.length
    }
    if (gains.clay + gains.stone > 0) return { flow: gainLeaf(CARD_ID, gains), sourceCard: CARD_ID }
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
    desc: ['For each new <WOOD>/clay room you build, you get 2 <CLAY>/2 <STONE>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const D123_RenovationPreparer_impl = D123_RenovationPreparer.impl
