import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { isCardFlagged } from '../helpers/card-state'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { D27_Retraining } from '../../cards-display/D/D27_Retraining'

const CARD_ID = D27_Retraining.id

/**
 * D27 Retraining (Minor, D, 27):
 * - At the end of each turn in which the player renovates, they may exchange
 *   their Joinery for the Pottery, OR their Pottery for the Basketmaker's
 *   Workshop (one swap, at most once per renovation).
 *
 * BGA (D27_Retraining.php):
 * - Listens to Renovation (unflagged) → flags the card.
 * - Listens to PlaceFarmer (after) → if flagged, builds an optional node
 *   offering the currently-available swap, then unflags.
 *
 * Implementation:
 * - After a `renovate-house` action, return a flow leaf that flags the card.
 * - After the same player's next `place-farmer`, if flagged and a swap is
 *   available, return a flow that clears the flag and then optionally swaps a
 *   player major with the board. Declining the optional branch only clears the
 *   renovation marker.
 */

const determineSwap = (
  state: GameState,
  player: PlayerState,
): { from: string; to: string } | null => {
  const playedMajors = new Set(player.improvements)
  const available = new Set(state.availableMajorImprovements)
  if (playedMajors.has('Major_Joinery') && available.has('Major_Pottery')) {
    return { from: 'Major_Joinery', to: 'Major_Pottery' }
  }
  if (playedMajors.has('Major_Pottery') && available.has('Major_Basket')) {
    return { from: 'Major_Pottery', to: 'Major_Basket' }
  }
  return null
}

const setFlagFlow = (flag: boolean): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-flag', flag },
})

const renovationListener: CardListenerRegistration = {
  id: 'D27-retraining-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    return {
      flow: setFlagFlow(true),
      sourceCard: CARD_ID,
    }
  },
}

const placeFarmerListener: CardListenerRegistration = {
  id: 'D27-retraining-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isCardFlagged(context.player, CARD_ID)) return

    const swap = determineSwap(context.state, context.player)
    if (!swap) {
      return {
        flow: setFlagFlow(false),
        sourceCard: CARD_ID,
      }
    }

    const flow: ActionFlow = {
      type: 'seq',
      children: [
        setFlagFlow(false),
        {
          type: 'seq',
          optional: true,
          children: [
            {
              type: 'leaf',
              actionId: 'special-effect',
              sourceCard: CARD_ID,
              params: {
                kind: 'swap-improvement-with-board',
                from: swap.from,
                to: swap.to,
              },
            },
          ],
        },
      ],
    }
    return {
      flow,
      sourceCard: CARD_ID,
    }
  },
}

export const D27_Retraining_impl = {
  listeners: [renovationListener, placeFarmerListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
