import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C138_AnimalFeeder'
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C138_AnimalFeeder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Animal Feeder',
    deck: 'C',
    number: 138,
    category: 'GOODS_PROVIDER',
    desc: ['On the __Day Laborer__ action space, you also get your choice of 1 <SHEEP> or 1 <GRAIN>. Instead of that good, you can buy 1 <PIG> for 1 <FOOD> or 1 <CATTLE> for 2 <FOOD>.'],
    cost: {},
    players: '3+',
  },
  impl: cardImpl,
})

export const C138_AnimalFeeder_impl = C138_AnimalFeeder.impl
