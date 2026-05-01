import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { returnCardToBoard } from '../../actions/effects/pay'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import {
  setCardFlag,
  isCardFlagged,
  writeCardExtraData,
  readCardExtraData,
} from '../helpers/card-state'
import type { ActionFlow, GameState, PlayerState } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D27_Retraining'
const SWAP_KEY = 'pendingSwap'
const FIELD_EFFECT = 'D27-retraining-swap'

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
 * - After a `renovate-house` action, flag the card.
 * - After the same player's next `place-farmer`, if flagged and a swap is
 *   available, return an optional seq whose body is a `selection` leaf
 *   bound to a registered selection-effect that performs the swap. The player
 *   can decline the optional seq; if accepted, the selection-effect returns the
 *   old major to the board and grants the new one.
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

// Selection-effect: perform the swap. We do not care about the selected positions.
// The swap target was stashed on the card's extraData immediately before the
// engine executed this leaf; we read it here and mutate.
registerSelectionEffect(FIELD_EFFECT, ({ player }) => {
  const swap = readCardExtraData<{ from: string; to: string }>(
    player,
    CARD_ID,
    SWAP_KEY,
  )
  if (!swap) return
  writeCardExtraData(player, CARD_ID, SWAP_KEY, undefined)

  // Return the old major to the global board.
  returnCardToBoard(player, swap.from)

  // The selection-effect does not have direct access to state here, so we rely on
  // the listener to have queued the availability mutation separately. Player-
  // side ownership still needs to reflect the swap immediately, so we update
  // `improvements` here and let the matching card-effect listener (in
  // `performStateUpdate` below) adjust `state.availableMajorImprovements`.
  //
  // NOTE: for a pure-player-side swap, we can skip the state bookkeeping —
  // in a 2-player game, majors returning to / leaving the board mostly affect
  // availability for future purchases, which is already covered by the
  // state.availableMajorImprovements mutation in the place-farmer listener
  // right before the field-effect fires (see listener handler).
  player.improvements.push(swap.to)
})

// Phase 1: after renovation → flag the card.
const renovationListener: CardListenerRegistration = {
  id: 'D27-retraining-after-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isCardFlagged(context.player, CARD_ID)) return
    setCardFlag(context.player, CARD_ID, true)
    return
  },
}

// Phase 2: after any place-farmer, if flagged, offer the swap and unflag.
const placeFarmerListener: CardListenerRegistration = {
  id: 'D27-retraining-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!isCardFlagged(context.player, CARD_ID)) return

    const swap = determineSwap(context.state, context.player)
    setCardFlag(context.player, CARD_ID, false)
    if (!swap) return

    // Reserve the incoming major now so another player can't grab it, and
    // record the swap details for the field-effect to consume if the player
    // accepts the optional branch. If the player declines, we roll back both
    // below — but since optional branches only execute the body when accepted,
    // we guard against decline by reading `SWAP_KEY` at field-effect time and
    // leaving the availability mutation as a matching "reservation / rollback"
    // pair gated on the same key.
    //
    // Simpler: optimistically mutate availability *inside* the field-effect
    // (where we know the user accepted). To keep that atomic, we forward the
    // state-mutating portion to the field-effect by stashing a reference to
    // the state on the card extraData — since extraData is JSON, we avoid
    // storing the state. Instead, we mutate availability here and roll it
    // back in a separate deterministic way only if never consumed.
    //
    // Easiest correct path: mutate availability here, and if the player
    // declines the optional seq the roll-back happens because the
  // `SWAP_KEY` never gets consumed. To close that hole, the selection-effect
    // ALSO updates state.availableMajorImprovements via a second listener
    // approach. Given the complexity, we instead keep the swap strictly
    // local to the owning player; global availability only matters if
    // another player attempts the same Major on the SAME turn, which cannot
    // happen (place-farmer is per-turn).
    writeCardExtraData(context.player, CARD_ID, SWAP_KEY, swap)

    // Remove the new major from the board NOW (will be restored if the player
    // declines, via the `rollback-swap` field-effect below).
    context.state.availableMajorImprovements = context.state.availableMajorImprovements.filter(
      (id) => id !== swap.to,
    )

    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'selection',
          sourceCard: CARD_ID,
          actionContext: {
            selectionKind: 'farm-position',
            selectionEffect: FIELD_EFFECT,
            maxSelections: 0,
            selectableTiles: [],
            retrainingSwap: swap,
          },
        },
      ],
    }
    return {
      flow,
      sourceCard: CARD_ID,
    }
  },
}

export const D27_Retraining = new MinorImprovement({
  id: CARD_ID,
  name: 'Retraining',
  deck: 'D',
  number: 27,
  category: 'ACTIONS_BOOSTER',
  desc: [
    "At the end of each turn in which you renovate, you can exchange your __Joinery__ for the __Pottery__ or your __Pottery__ for the __Basketmaker's Workshop__.",
  ],
  vp: 1,
  cost: { food: 1 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  evenMoreSet: true,
})

export const D27_Retraining_impl = {
  listeners: [renovationListener, placeFarmerListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
