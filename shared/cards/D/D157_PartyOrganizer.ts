import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { D157_PartyOrganizer } from '../../cards-display/D/D157_PartyOrganizer'
export { D157_PartyOrganizer }

const CARD_ID = D157_PartyOrganizer.id

/**
 * D157 Party Organizer — When an opponent reaches their 5th family member
 * (i.e. grows family from 4 → 5), the owner of this card immediately gains
 * 8 food. Triggers exactly once per game.
 *
 * Scoring bonus: at game end, if the owner has 5 family members and no
 * other player does, +3 VP.
 */
const opponentGrowsToFiveListener: CardListenerRegistration = {
  id: 'D157-after-opponent-family-growth',
  cardIds: [CARD_ID],
  scope: 'opponent',
  phases: ['after' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    const opponent = context.triggerPlayer
    if (!opponent) return
    // BGA: trigger only at the moment the opponent reaches family of 5.
    if (familySize(opponent) !== 5) return

    setCardFlag(context.player, CARD_ID, true)
    return {
      flow: gainLeaf(CARD_ID, { food: 8 }),
      sourceCard: CARD_ID,
    }
  },
}

export const D157_PartyOrganizer_impl = {
  listeners: [opponentGrowsToFiveListener],
  effect: {
    id: CARD_ID,
    computeBonusScore: (state, player) => {
      if (familySize(player) < 5) return 0
      const othersWithFive = state.players.filter(
        (p) => p.id !== player.id && familySize(p) >= 5,
      )
      return othersWithFive.length === 0 ? 3 : 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
