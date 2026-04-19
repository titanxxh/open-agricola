import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E79_FieldSpade'

// E79 Field Spade: Each time after you sow in at least 1 field, you get 1 STONE.
const listener: CardListenerRegistration = {
  id: 'E79-field-spade-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { stone: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const E79_FieldSpade = new MinorImprovement({
  id: CARD_ID,
  name: 'Field Spade',
  deck: 'E',
  number: 79,
  category: 'BUILDING_RESOURCES_STONE',
  desc: ['Each time after you sow in at least 1 field, you get 1 <STONE>.'],
  cost: { wood: 1 },
})
