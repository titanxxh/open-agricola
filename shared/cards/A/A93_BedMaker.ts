import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { getRoomsBuiltThisAction } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'
import { A93_BedMaker } from '../../cards-display/A/A93_BedMaker'
export { A93_BedMaker }

const CARD_ID = A93_BedMaker.id

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

export const A93_BedMaker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
