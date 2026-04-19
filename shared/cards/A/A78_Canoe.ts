import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'A78_Canoe'

// A78 Canoe: Each time you use the Fishing accumulation space, you get an additional 1 FOOD and 1 REED.
const listener: CardListenerRegistration = {
  id: 'A78-canoe-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.space || context.space.id !== 'fishing') return
    return { flow: gainLeaf(CARD_ID, { reed: 1, food: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const A78_Canoe = new MinorImprovement({
  id: CARD_ID,
  name: 'Canoe',
  deck: 'A',
  number: 78,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Each time you use the __Fishing__ accumulation space, you get an additional 1 <FOOD> and 1 <REED>.'],
  cost: { wood: 2 },
  vp: 1,
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})
