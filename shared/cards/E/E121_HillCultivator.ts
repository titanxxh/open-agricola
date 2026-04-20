import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E121_HillCultivator'

// Each time you use Grain Seeds, also get 2 clay.
// Each time you use Vegetable Seeds, also get 3 clay.
const listener: CardListenerRegistration = {
  id: 'E121-hill-cultivator-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (spaceId === 'grain-seeds') {
      return { flow: gainLeaf(CARD_ID, { clay: 2 }), sourceCard: CARD_ID }
    }
    if (spaceId === 'vegetable-seeds') {
      return { flow: gainLeaf(CARD_ID, { clay: 3 }), sourceCard: CARD_ID }
    }
  },
}

export const E121_HillCultivator = new Occupation({
  id: CARD_ID,
  name: 'Hill Cultivator',
  deck: 'E',
  number: 121,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use the __Grain Seeds__ or __Vegetable Seeds__ action space, you also get 2 or 3 <CLAY>, respectively.'],
  cost: {},
  players: '1+',
})

export const E121_HillCultivator_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
