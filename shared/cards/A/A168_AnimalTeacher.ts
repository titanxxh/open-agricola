import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A168_AnimalTeacher'

const LESSONS_SPACES = new Set(['lessons', 'lessons-4'])

// A168 Animal Teacher: Immediately after each time you use a Lessons action space,
// you can also buy 1 SHEEP/PIG/CATTLE for 0/1/2 FOOD.
const listener: CardListenerRegistration = {
  id: 'A168-animal-teacher-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || !LESSONS_SPACES.has(context.space.id)) return
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: [
          gainLeaf(CARD_ID, { sheep: 1 }),
          {
            type: 'seq',
            children: [
              payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
              gainLeaf(CARD_ID, { boar: 1 }),
            ],
          },
          {
            type: 'seq',
            children: [
              payLeaf({ cardId: CARD_ID, cost: { food: 2 } }),
              gainLeaf(CARD_ID, { cattle: 1 }),
            ],
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(listener)

export const A168_AnimalTeacher = new Occupation({
  id: CARD_ID,
  name: 'Animal Teacher',
  deck: 'A',
  number: 168,
  category: 'LIVESTOCK_PROVIDER',
  desc: ['Immediately after each time you use a __Lessons__ action space, you can also buy 1 <SHEEP>/<PIG>/<CATTLE> for 0/1/2 <FOOD>.'],
  cost: {},
  players: '4+',
  newSet: true,
})
