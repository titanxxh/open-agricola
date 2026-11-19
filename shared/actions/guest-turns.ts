import type { GameState, GuestPlacementScope, GuestRecord, GuestWorkerSource, PlayerState } from '../contract/types'
import type { ActionHookRegistry } from './hooks'
import { collectGuestExtraTurnContributions, getCardEffect, registerExtraTurnProvider, spentExtraTurns, type ExtraTurnContribution, type ExtraTurnProvider } from '../cards/card-effects'
import { guestTurnActivation, guestTurnFlow } from '../cards/helpers/guest-flow'
import { dispatchableGuests, findDispatchableGuest, grantGuest } from '../domain/guests'
import { workersAvailable } from '../domain/player'
import { hasLegalPlaceFarmerTargets } from './effects/place-farmer'

const hasLegalTarget = (
  state: GameState,
  player: PlayerState,
  guest: GuestRecord,
  actionHooks: ActionHookRegistry | undefined,
): boolean => {
  const workerSource: GuestWorkerSource = { kind: 'guest', guestId: guest.id }
  return hasLegalPlaceFarmerTargets(state, player, actionHooks, undefined, { workerSource })
}

/** Whether `player` can send this Guest to an action space right now. */
export const canDispatchGuest = (
  state: GameState,
  player: PlayerState,
  guestId: unknown,
  actionHooks: ActionHookRegistry | undefined,
): boolean => {
  const guest = findDispatchableGuest(state, player, guestId)
  return guest !== undefined && hasLegalTarget(state, player, guest, actionHooks)
}

/** Whether a Guest `cardId` would hand `player` now, within `where`, would find a legal space. */
const canPlaceNewGuest = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  where: GuestPlacementScope | undefined,
  actionHooks: ActionHookRegistry | undefined,
): boolean => {
  // `grantGuest` replaces the guest list, so shallow copies keep the real game untouched.
  const probe: PlayerState = { ...player }
  const probeState: GameState = { ...state, players: state.players.map(entry => entry.id === player.id ? probe : entry) }
  const guest = grantGuest(probe, { sourceCardId: cardId, round: state.round, ...(where ? { where } : {}) })
  return hasLegalTarget(probeState, probe, guest, actionHooks)
}

/**
 * How many Guests `player` still has to place this round that a legal space awaits:
 * granted Guests, and card extra turns that place one.
 */
/** Whether `player` holds a Guest record or a card, played or retained, whose extra turn places one. */
const mayHaveGuestTurn = (player: PlayerState): boolean => (player.guests?.length ?? 0) > 0
  || [...(player.improvements ?? []), ...(player.minorPlayed ?? []), ...(player.occupationPlayed ?? []), ...Object.keys(player.cardStates ?? {})]
    .some(cardId => getCardEffect(cardId)?.extraTurnGuest !== undefined)

const placeableGuestCount = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
): number => !mayHaveGuestTurn(player) ? 0 : collectGuestExtraTurnContributions(state, player, actionHooks)
  .filter(contribution => (contribution.cardId === undefined
    || canPlaceNewGuest(state, player, contribution.cardId, getCardEffect(contribution.cardId)?.extraTurnGuest?.where, actionHooks)))
  .reduce((sum, contribution) => sum + contribution.count, 0)

/** Whether `player` still has a Guest to place this round that a legal space awaits. */
export const hasPendingGuestPlacement = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
): boolean => placeableGuestCount(state, player, actionHooks) > 0

/**
 * The people `player` still has to place this round: family members at home plus
 * Guests a legal space awaits. Card text that counts people left to place, the
 * last person or whether all people are placed reads this, never family members alone.
 */
export const peopleLeftToPlace = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry | undefined,
): number => workersAvailable(state, player) + placeableGuestCount(state, player, actionHooks)

/**
 * The Guests rotation offers `player` now: every Guest of this round that has a
 * legal space, on any of the owner's work turns. A card that needs another
 * moment places its Guest from its own hook instead of booking one here.
 */
const guestTurns: ExtraTurnProvider = ({ state, player, actionHooks }) =>
  dispatchableGuests(state, player)
    .filter((guest) => spentExtraTurns(player, guest.id) === 0 && hasLegalTarget(state, player, guest, actionHooks))
    .flatMap((guest): ExtraTurnContribution[] => {
      const flow = guestTurnFlow(state, player, guest.id)
      return flow ? [{
        key: guest.id,
        ownerPlayerId: player.id,
        count: 1,
        flow,
        beforeWorkers: true,
        activation: guestTurnActivation(guest),
        guest: true,
      }] : []
    })

registerExtraTurnProvider(guestTurns)
