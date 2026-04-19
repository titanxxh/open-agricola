import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E50_WildGreens'

// E50 Wild Greens: Each time you sow, you get 1 FOOD for every different type of good that you sow.
// BGA counts grain, vegetable, wood, stone sowed in the action.
// Our sow action fires once per field sow. Each sow is one type, so we give 1 food per sow.
const listener: CardListenerRegistration = {
  id: 'E50-wild-greens-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    // Each sow action plants one distinct type → 1 food
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const E50_WildGreens = new MinorImprovement({
  id: CARD_ID,
  name: 'Wild Greens',
  deck: 'E',
  number: 50,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you sow, you get 1 <FOOD> for every different type of good that you sow.'],
  cost: {},
})
