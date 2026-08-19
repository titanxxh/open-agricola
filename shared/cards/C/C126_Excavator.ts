import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C126_Excavator'
const listener: CardListenerRegistration = {
  id: 'C126-excavator-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  // The reference:36 — the wood + clay gain is mandatory; the
  // inner pay/stone branch stays optional. Marking the listener mandatory
  // hides __pass__ from the PARALLEL select-trigger prompt so the player
  // cannot silently skip the guaranteed effect.
  mandatory: true,
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.space?.id !== 'day-laborer') return
    return {
      flow: {
        type: 'seq',
        children: [
          gainLeaf(CARD_ID, { clay: 1, wood: 1 }),
          {
            type: 'seq',
            optional: true,
            children: [
              payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
              gainLeaf(CARD_ID, { stone: 1 }),
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

export const C126_Excavator = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Excavator',
    deck: 'C',
    number: 126,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Each time after you use the __Day Laborer__ action space, you get 1 additional <WOOD> and <CLAY>, and you can buy 1 <STONE> for 1 <FOOD>.'],
    cost: {},
    players: '1+',
  },
  impl: cardImpl,
})

export const C126_Excavator_impl = C126_Excavator.impl
