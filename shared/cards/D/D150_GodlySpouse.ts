import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { initCardState, incCounter } from '../__stubs__/helpers'

const CARD_ID = 'D150_GodlySpouse'

registerCardEffect({
  id: CARD_ID,
  onBeforeStartOfTurn: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const counters = initCardState(player, CARD_ID)
    counters['flagged'] = 0
    counters['placedThisTurn'] = 0
  },
})

const afterWishChildrenListener: CardListenerRegistration = {
  id: 'D150-godly-spouse-after-wish-children',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['wish-children-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const counters = initCardState(context.player, CARD_ID)
    if (counters['flagged']) return
    const placed = counters['placedThisTurn'] ?? 0
    if (placed < 2) return
    counters['flagged'] = 1
    incCounter(context.player, CARD_ID, 'triggerCount')

    const occupiedSpaces = context.state.actionSpaces.filter(
      (s) => s.takenBy === context.player.id && s.id !== 'meeting-place',
    )
    if (occupiedSpaces.length === 0) return

    const firstOccupied = occupiedSpaces[0]
    firstOccupied.takenBy = null
    context.player.workersAvailable += 1

    return {
      logKey: 'log.cardEffectTrigger',
      logParams: { cardId: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(afterWishChildrenListener)

export const D150_GodlySpouse = new Occupation({
  id: CARD_ID,
  name: "Godly Spouse",
  deck: "D",
  number: 150,
  category: "ACTIONS_BOOSTER",
  desc: ["After you use Wish for Children and have placed a second person this round, you may return your first placed person home (unless on Meeting Place)."],
  cost: {},
  players: "4+",
})
