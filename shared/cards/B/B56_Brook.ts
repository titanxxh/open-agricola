import { MinorImprovement } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B56_Brook'

// B56 Brook: triggers on the four permanent accumulation spaces above Fishing.
// These are Forest, Clay Pit, Reed Bank, and Hollow (4-player only).
const BROOK_SPACES = new Set(['forest', 'clay-pit', 'reed-bank', 'hollow-4'])

const listener: CardListenerRegistration = {
  id: 'B56-brook-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!BROOK_SPACES.has(context.space?.id ?? '')) return
    return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const B56_Brook = new MinorImprovement({
  id: CARD_ID,
  name: 'Brook',
  deck: 'B',
  number: 56,
  category: 'FOOD_PROVIDER',
  desc: ['Each time you use one of the four action spaces above the __Fishing__ accumulation space, you get 1 additional <FOOD>.'],
  cost: {},
  prerequisite: '1 Occupation',
})
