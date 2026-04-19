import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { ensureCardState } from '../helpers/card-state'

const CARD_ID = 'D158_BeanCounter'

/**
 * Each time you use an action space on round spaces 1 to 8,
 * place 1 food on this card. When it reaches 3, gain them.
 */
const listener: CardListenerRegistration = {
  id: 'D158-bean-counter-place-farmer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const roundAvailable = context.space?.roundAvailable ?? 99
    if (roundAvailable > 8) return

    const cs = ensureCardState(context.player, CARD_ID)
    if (!cs.counters) cs.counters = {}
    const current = (cs.counters.food ?? 0) + 1

    if (current >= 3) {
      cs.counters.food = 0
      return {
        flow: gainLeaf(CARD_ID, { food: 3 }),
        sourceCard: CARD_ID,
      }
    } else {
      cs.counters.food = current
    }
  },
}

registerCardListener(listener)

export const D158_BeanCounter = new Occupation({
  id: "D158_BeanCounter",
  name: "Bean Counter",
  deck: "D",
  number: 158,
  category: "FOOD_PROVIDER",
  desc: [
    'Each time you use an action space on round spaces 1 to 8, place 1 <FOOD> on this card. Each time this card has 3 <FOOD> on it, move the <FOOD> to your supply.',
  ],
  cost: {},
  players: "4+",
})
