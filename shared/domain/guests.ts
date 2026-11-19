import type { ActionSpace, GameState, GuestPlacementScope, GuestRecord, PlayerState } from '../contract/types'
import { getCardHeldWorkerIds } from '../cards/helpers/card-held-workers'
import { guestWorkerId, guestWorkerIndex } from './guest-id'
import { isWorkerOnAnySpace } from './player'

export { isGuestWorkerId } from './guest-id'

export type GuestGrant = {
  sourceCardId: string
  /** The one round in which the Guest can be dispatched. */
  round: number
  where?: GuestPlacementScope
}

/** Reads a placement scope from flow data: `undefined` for any space, `null` when it is malformed. */
export const readGuestPlacementScope = (value: unknown): GuestPlacementScope | undefined | null => {
  if (value === undefined) return undefined
  if (!value || typeof value !== 'object' || !('kind' in value)) return null
  if (value.kind === 'accumulation') return { kind: 'accumulation' }
  if (value.kind !== 'spaces' || !('spaceIds' in value) || !Array.isArray(value.spaceIds)) return null
  const spaceIds = value.spaceIds.filter((id): id is string => typeof id === 'string')
  return spaceIds.length === value.spaceIds.length ? { kind: 'spaces', spaceIds } : null
}

const nextGuestId = (player: PlayerState): string =>
  guestWorkerId(Math.max(0, ...(player.guests ?? []).map((guest) => guestWorkerIndex(guest.id))) + 1)

/** Hands `player` a Guest. It belongs to the player from then on, whatever happens to its card. */
export const grantGuest = (player: PlayerState, grant: GuestGrant): GuestRecord => {
  const guest: GuestRecord = {
    id: nextGuestId(player),
    sourceCardId: grant.sourceCardId,
    round: grant.round,
    ...(grant.where ? { where: grant.where } : {}),
  }
  player.guests = [...(player.guests ?? []), guest]
  return guest
}

/**
 * This round's Guests that `player` can still send out: those never dispatched
 * and standing neither on an action space nor on a card. A Guest is dispatched
 * once, so one that an effect recalls home waits out the round.
 */
export const dispatchableGuests = (state: GameState, player: PlayerState): GuestRecord[] => {
  const guests = (player.guests ?? []).filter((guest) => guest.round === state.round && !guest.dispatched)
  if (guests.length === 0) return guests
  const held = getCardHeldWorkerIds(player)
  return guests.filter((guest) => !held.has(guest.id) && !isWorkerOnAnySpace(state, player.id, guest.id))
}

export const findDispatchableGuest = (state: GameState, player: PlayerState, guestId: unknown): GuestRecord | undefined =>
  typeof guestId === 'string' ? dispatchableGuests(state, player).find((guest) => guest.id === guestId) : undefined

/** Drops a Guest its owner will not dispatch; a Guest standing somewhere stays until it returns. */
export const voidGuest = (state: GameState, player: PlayerState, guestId: unknown): GuestRecord | undefined => {
  const guest = findDispatchableGuest(state, player, guestId)
  if (guest) player.guests = (player.guests ?? []).filter((entry) => entry !== guest)
  return guest
}

/**
 * Return home: every Guest whose round has come leaves the game. Returns those
 * that were never dispatched, which are void rather than returned.
 */
export const returnGuests = (state: GameState): { playerId: string; guest: GuestRecord }[] => {
  const voided: { playerId: string; guest: GuestRecord }[] = []
  for (const player of state.players) {
    const leaving = (player.guests ?? []).filter((guest) => guest.round <= state.round)
    if (leaving.length === 0) continue
    player.guests = (player.guests ?? []).filter((guest) => guest.round > state.round)
    for (const guest of leaving) if (!guest.dispatched) voided.push({ playerId: player.id, guest })
  }
  return voided
}

/** An accumulation space gains goods every round. */
const isAccumulationSpace = (space: ActionSpace): boolean =>
  Object.values(space.gainPerRound ?? {}).some((amount) => (amount ?? 0) > 0)

export const guestMayEnter = (where: GuestPlacementScope | undefined, space: ActionSpace): boolean => {
  if (!where) return true
  return where.kind === 'spaces' ? where.spaceIds.includes(space.id) : isAccumulationSpace(space)
}

/**
 * Whether this round's work-end window (`onAllWorkersPlaced`) has begun. No
 * work turn follows it, so a Guest granted from then on is placed at once.
 */
export const isWorkEndWindowOpen = (state: Pick<GameState, 'round' | 'roundPhase' | 'workEndWindowRound'>): boolean =>
  state.roundPhase === 'work' && state.workEndWindowRound === state.round
