import type {
  ActionFlow, GameState, GuestPlacementScope, GuestRecord, GuestWorkerSource, PlayerState,
} from '../../contract/types'
import { findDispatchableGuest } from '../../domain/guests'
import { workersAvailable } from '../../domain/player'

export type GuestGrantOptions = {
  /** The round the Guest is for; the current round by default. A later round books it ahead. */
  round?: number
  /** The spaces it may go to; any space by default. */
  where?: GuestPlacementScope
}

/**
 * Leaf that hands the acting player a Guest from `cardId`. Rotation offers the
 * Guest on any of the owner's work turns in its round; the card only grants it.
 * A card whose Guest comes at another moment grants it from that moment's hook
 * with `grantImmediateGuestLeaf`.
 */
export const grantGuestLeaf = (cardId: string, options: GuestGrantOptions = {}): ActionFlow => ({
  type: 'leaf',
  actionId: 'guest',
  sourceCard: cardId,
  params: { operation: 'grant', ...options },
})

/** Grants a Guest whose placement (or forfeiture) must resolve within this card's flow. */
export const grantImmediateGuestLeaf = (
  cardId: string,
  options: { where?: GuestPlacementScope; optional?: boolean } = {},
): ActionFlow => ({
  type: 'leaf',
  actionId: 'guest',
  sourceCard: cardId,
  params: { operation: 'grant-immediate', ...options },
})

/** How a choice names a Guest; the client reads the Guest and its card from the label parameters. */
const guestChoiceLabel = (guest: GuestRecord) => ({
  choiceLabelKey: 'actions.activate-extra-turn.name',
  choiceLabelParams: { guestId: guest.id, guestCardId: guest.sourceCardId },
})

/** The Guest's entry among several opportunities for the same turn. */
export const guestTurnActivation = (guest: GuestRecord): ActionFlow => ({
  type: 'leaf',
  actionId: 'activate-extra-turn',
  params: { guestId: guest.id },
  ...guestChoiceLabel(guest),
})

/**
 * The work turn a Guest gives its owner. While the owner still has family
 * members to place, taking the Guest's turn was already a choice; once they are
 * all placed it is the last chance, so the owner may decline and void the Guest.
 */
export const guestTurnFlow = (state: GameState, player: PlayerState, guestId: unknown): ActionFlow | undefined => {
  const guest = findDispatchableGuest(state, player, guestId)
  if (!guest) return
  const source: GuestWorkerSource = { kind: 'guest', guestId: guest.id }
  const dispatch: ActionFlow = {
    type: 'leaf',
    actionId: 'place-farmer',
    ...guestChoiceLabel(guest),
    actionContext: { workerSource: source },
  }
  if (workersAvailable(state, player) > 0) return dispatch
  return {
    type: 'xor',
    children: [
      dispatch,
      {
        type: 'leaf',
        actionId: 'guest',
        choiceLabelKey: 'ui.interactionDecline',
        params: { operation: 'void', guestId: guest.id },
      },
    ],
  }
}
