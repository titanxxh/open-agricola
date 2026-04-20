import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'C126_Excavator'

// C126 Excavator: After Day Laborer, gain 1 wood + 1 clay, and optionally pay 1 food for 1 stone.
// Uses after phase (onPlayerAfterPlaceFarmer in BGA = HAPPENS_AFTER_COTTAGER).
const listener: CardListenerRegistration = {
  id: 'C126-excavator-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  order: 10,
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

export const C126_Excavator = new Occupation({
  id: CARD_ID,
  name: 'Excavator',
  deck: 'C',
  number: 126,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time after you use the __Day Laborer__ action space, you get 1 additional <WOOD> and <CLAY>, and you can buy 1 <STONE> for 1 <FOOD>.'],
  cost: {},
  players: '1+',
})

export const C126_Excavator_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
