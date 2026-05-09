import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A168_AnimalTeacher } from '../../cards-display/A/A168_AnimalTeacher'

const CARD_ID = A168_AnimalTeacher.id

const LESSONS_SPACES = new Set(['lessons', 'lessons-4'])

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

export const A168_AnimalTeacher_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
