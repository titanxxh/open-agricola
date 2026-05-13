import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import { isCardFlagged } from '../helpers/card-state'
import { gainLeaf } from '../helpers/pay-gain-node'
import { familySize } from '../../domain/player'
import type { CardImpl } from '../registry'
import { D157_PartyOrganizer } from '../../cards-display/D/D157_PartyOrganizer'

const CARD_ID = D157_PartyOrganizer.id

const setFlagLeaf = (ownerPlayerId?: string): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-flag', flag: true },
  ...(ownerPlayerId ? { actionContext: { targetPlayerId: ownerPlayerId } } : {}),
})

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
    const owner = context.ownerPlayer ?? context.effectPlayer ?? context.player
    if (isCardFlagged(owner, CARD_ID)) return
    const opponent = context.triggerPlayer ?? context.player
    if (!opponent) return
    // BGA: trigger only at the moment the opponent reaches family of 5.
    if (familySize(opponent) !== 5) return

    return {
      flow: {
        type: 'seq',
        children: [
          setFlagLeaf(owner.id),
          gainLeaf(CARD_ID, { food: 8 }),
        ],
      },
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
