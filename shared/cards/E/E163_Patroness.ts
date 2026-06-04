import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E163_Patroness'
const listener: CardListenerRegistration = {
  id: 'E163-patroness-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Do not trigger for this card itself
    if (context.choice === CARD_ID) return
    return {
      flow: {
        type: 'xor',
        children: [
          gainLeaf(CARD_ID, { wood: 1 }),
          gainLeaf(CARD_ID, { clay: 1 }),
          gainLeaf(CARD_ID, { reed: 1 }),
          gainLeaf(CARD_ID, { stone: 1 }),
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

export const E163_Patroness = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Patroness',
    deck: 'E',
    number: 163,
    category: 'BUILDING_RESOURCES',
    desc: [
        'Each time after you play an occupation after this one, you get 1 building resource of your choice.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const E163_Patroness_impl = E163_Patroness.impl
