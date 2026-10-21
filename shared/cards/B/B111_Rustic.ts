import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, bonusVpLeaf } from '../helpers/pay-gain-node'
import { getActionRoomConstructions } from '../helpers/construction-events'
import type { CardImpl } from '../registry'

const CARD_ID = 'B111_Rustic'
const listener: CardListenerRegistration = {
  id: 'B111-rustic-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const roomsBuilt = getActionRoomConstructions(context).filter(operation => operation.roomType === 'clay').reduce((count, operation) => count + operation.positions.length, 0)
    if (roomsBuilt <= 0) return
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { food: 2 * roomsBuilt }),
          bonusVpLeaf(CARD_ID, roomsBuilt),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B111_Rustic = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Rustic',
    deck: 'B',
    number: 111,
    category: 'FOOD_PROVIDER',
    desc: ['For each clay room you build, you get 2 <FOOD> and 1 bonus <SCORE>. (this does not apply to stone rooms and renovated wood rooms.)'],
    cost: {},
    players: '1+',
    extraVp: true,
  },
  presentation: { counters: ['bonusVp'] },
  impl: cardImpl,
})

export const B111_Rustic_impl = B111_Rustic.impl
