import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'E164_MountainPlowman'

// E164 Mountain Plowman: Each time you plow at least 1 field, you get 1 SHEEP
// for each field that you just plowed.
// BGA awards 1 sheep per plow action, triggered per-plow.
// In our system the 'plow' action id fires once per field, so each trigger gives 1 sheep.
const listener: CardListenerRegistration = {
  id: 'E164-mountain-plowman-after-plow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['plow'],
  handler: (_context: CardListenerContext): ActionHookResult | void => {
    return { flow: gainLeaf(CARD_ID, { sheep: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const E164_MountainPlowman = new Occupation({
  id: CARD_ID,
  name: 'Mountain Plowman',
  deck: 'E',
  number: 164,
  category: 'ANIMALS_SHEEP',
  desc: ['Each time you plow at least 1 field, you get 1 <SHEEP> for each field that you just plowed.'],
  cost: {},
  players: '4+',
})
