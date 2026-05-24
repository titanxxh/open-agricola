import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { E157_Usufructuary } from '../../cards-display/E/E157_Usufructuary'

const CARD_ID = E157_Usufructuary.id

const listener: CardListenerRegistration = {
  id: 'E157-usufructuary-after-occupation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['occupation'],
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

export const E157_Usufructuary_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
