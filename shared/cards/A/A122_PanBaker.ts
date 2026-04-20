import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A122_PanBaker'

// A122 Pan Baker: Each time you use the Grain Utilization action space,
// you also get 2 CLAY and 1 WOOD.
const listener: CardListenerRegistration = {
  id: 'A122-pan-baker-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'grain-utilization') return
    return { flow: gainLeaf(CARD_ID, { clay: 2, wood: 1 }), sourceCard: CARD_ID }
  },
}

export const A122_PanBaker = new Occupation({
  id: CARD_ID,
  name: 'Pan Baker',
  deck: 'A',
  number: 122,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use the __Grain Utilization__ action space, you also get 2 <CLAY> and 1 <WOOD>.'],
  cost: {},
  players: '1+',
  newSet: true,
})

export const A122_PanBaker_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
