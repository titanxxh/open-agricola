import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D160_Midwife'

/**
 * D160 Midwife (Occupation, D, 160)
 * Each time another player uses Family Growth, card owner gets 1 grain.
 *
 * BGA: onPlayerPlaceFarmer — checks if the opponent placed on Family Growth
 * action space (wish-children or urgent-wish-children).
 *
 * scope 'opponent' — fires when an opponent uses the family growth space.
 * Players 4+.
 */
const FAMILY_GROWTH_SPACES = new Set(['wish-children', 'urgent-wish-children'])

const listener: CardListenerRegistration = {
  id: 'D160-midwife-opponent-family-growth',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!FAMILY_GROWTH_SPACES.has(context.space?.id ?? '')) return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const D160_Midwife = new Occupation({
  id: CARD_ID,
  name: 'Midwife',
  deck: 'D',
  number: 160,
  category: 'CROP_PROVIDER',
  desc: [
    'Each time another player uses the first person they place in a round to take a __Family Growth__ action, you get 1 <GRAIN> from the general supply.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
