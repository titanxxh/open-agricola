import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'E89_Stallwright'

// E89 Stallwright: After you play your 2nd, 3rd, 5th, and 7th occupation (including this one),
// you can build 1 stable at no cost.
const TRIGGER_COUNTS = new Set([2, 3, 5, 7])

const listener: CardListenerRegistration = {
  id: 'E89-stallwright-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const n = context.player.occupationPlayed.length
    if (!TRIGGER_COUNTS.has(n)) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'stables',
        optional: true,
        sourceCard: CARD_ID,
        actionContext: { max: 1, costs: {}, trueAction: false },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E89_Stallwright = new Occupation({
  id: CARD_ID,
  name: 'Stallwright',
  deck: 'E',
  number: 89,
  category: 'FARMYARD_-_STABLE_BUILDING',
  desc: [
    'After you play your 2nd, 3rd, 5th, and 7th occupation (including this one), you can build 1 stable at no cost.',
  ],
  cost: {},
  players: '1+',
})

export const E89_Stallwright_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
