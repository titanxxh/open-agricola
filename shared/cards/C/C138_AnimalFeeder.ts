import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C138_AnimalFeeder } from '../../cards-display/C/C138_AnimalFeeder'

const CARD_ID = C138_AnimalFeeder.id

const listener: CardListenerRegistration = {
  id: 'C138-animal-feeder-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return {
      flow: {
        type: 'xor',
        children: [
          gainLeaf(CARD_ID, { sheep: 1 }),
          gainLeaf(CARD_ID, { grain: 1 }),
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

export const C138_AnimalFeeder_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
