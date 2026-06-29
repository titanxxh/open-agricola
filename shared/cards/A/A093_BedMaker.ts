import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'A093_BedMaker'
const listener: CardListenerRegistration = {
  id: 'A93-bed-maker-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const roomsBuilt = getRoomsBuiltThisAction(context.player)
    if (roomsBuilt <= 0) return
    return {
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            type: 'leaf',
            actionId: 'pay',
            params: { wood: 1, grain: 1 },
            sourceCard: CARD_ID,
          },
          {
            type: 'leaf',
            actionId: 'wish-children',
            sourceCard: CARD_ID,
            actionContext: { constraints: ['freeRoom'], trueAction: false },
          },
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

export const A093_BedMaker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Bed Maker',
    deck: 'A',
    number: 93,
    category: 'ACTIONS_BOOSTER',
    desc: ['Each time you add rooms to your house, you can also pay 1 <WOOD> and 1 <GRAIN> to immediately get a __Family Growth with Room Only__ action.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const A093_BedMaker_impl = A093_BedMaker.impl
