import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'E157_Usufructuary'

// E157 Usufructuary: When you play this card as your first occupation, you immediately get
// 1 FOOD for every other occupation in play (by any player), up to a maximum of 7 FOOD.
const listener: CardListenerRegistration = {
  id: 'E157-usufructuary-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['play-occupation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.occupationPlayed.length !== 1) return
    // Count occupations played by all other players
    const otherOccupations = context.state.players
      .filter((p) => p.id !== context.player.id)
      .reduce((sum, p) => sum + p.occupationPlayed.length, 0)
    if (otherOccupations <= 0) return
    const food = Math.min(7, otherOccupations)
    return { flow: gainLeaf(CARD_ID, { food }), sourceCard: CARD_ID }
  },
}

export const E157_Usufructuary = new Occupation({
  id: CARD_ID,
  name: 'Usufructuary',
  deck: 'E',
  number: 157,
  category: 'FOOD',
  desc: [
    'When you play this card as your first occupation, you immediately get 1 <FOOD> for every other occupation in play (by any player), up to a maximum of 7 <FOOD>.',
  ],
  cost: {},
  players: '4+',
})

export const E157_Usufructuary_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
