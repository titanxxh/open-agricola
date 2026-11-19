import { describe, expect, it } from 'vitest'
import type { ActionSpace, GameState, GuestRecord, PlayerState } from '../../contract/types'
import { mkActionSpace } from '../../cards/__tests__/fixtures'
import { holdWorkerOnCard } from '../../cards/helpers/card-held-workers'
import { recallWorkerById } from '../../cards/helpers/recall-worker'
import {
  dispatchableGuests, grantGuest, guestMayEnter, isGuestWorkerId, readGuestPlacementScope, returnGuests, voidGuest,
} from '../guests'
import { addWorkerRef, removeWorkerRef } from '../space'

const guest = (id: string, round: number, extra: Partial<GuestRecord> = {}): GuestRecord =>
  ({ id, sourceCardId: 'CARD', round, ...extra })

const makePlayer = (id: string, guests?: GuestRecord[]): PlayerState =>
  ({ id, workers: [], cardStates: {}, ...(guests ? { guests } : {}) } as unknown as PlayerState)

const makeState = (round: number, players: PlayerState[], actionSpaces: ActionSpace[] = []): GameState =>
  ({ round, players, actionSpaces } as unknown as GameState)

describe('Guest records', () => {
  it('grants Guests with ids that no family token can have, for any own work turn by default', () => {
    const player = makePlayer('p1')

    expect(grantGuest(player, { sourceCardId: 'A', round: 3 })).toEqual({ id: 'guest:1', sourceCardId: 'A', round: 3 })
    expect(grantGuest(player, { sourceCardId: 'B', round: 5, where: { kind: 'accumulation' } }))
      .toEqual({ id: 'guest:2', sourceCardId: 'B', round: 5, where: { kind: 'accumulation' } })
    expect(player.guests?.map(entry => entry.id)).toEqual(['guest:1', 'guest:2'])
    expect(player.guests!.every(entry => isGuestWorkerId(entry.id))).toBe(true)
    expect(['1', '5', 'guest', '', undefined, 7].map(isGuestWorkerId)).toEqual([false, false, false, false, false, false])
  })

  it('does not reuse the id of a Guest that is still around', () => {
    const player = makePlayer('p1', [guest('guest:4', 2)])
    expect(grantGuest(player, { sourceCardId: 'A', round: 2 }).id).toBe('guest:5')
  })

  it('offers only this round\'s Guests that stand nowhere', () => {
    const forest = mkActionSpace({ id: 'forest' })
    const player = makePlayer('p1', [guest('guest:1', 3), guest('guest:2', 3), guest('guest:3', 3), guest('guest:4', 4), guest('guest:5', 2)])
    const state = makeState(3, [player, makePlayer('p2')], [forest])
    addWorkerRef(forest, 'p1', 'guest:1')
    holdWorkerOnCard(player, 'C022_BasketChair', 'guest:2')

    expect(dispatchableGuests(state, player).map(entry => entry.id)).toEqual(['guest:3'])
    // Another player's person with the same id does not stand in for this player's Guest.
    removeWorkerRef(forest, 'p1', 'guest:1')
    addWorkerRef(forest, 'p2', 'guest:1')
    expect(dispatchableGuests(state, player).map(entry => entry.id)).toEqual(['guest:1', 'guest:3'])
    expect(dispatchableGuests(state, makePlayer('p2'))).toEqual([])
  })

  it('does not dispatch a Guest a second time after an effect recalls it home', () => {
    const grain = mkActionSpace({ id: 'grain-utilization' })
    const player = makePlayer('p1', [guest('guest:1', 3, { dispatched: true })])
    const state = makeState(3, [player], [grain])
    addWorkerRef(grain, 'p1', 'guest:1')
    expect(grain.takenBy).toEqual([{ playerId: 'p1', workerId: 'guest:1', guest: true }])
    expect(dispatchableGuests(state, player)).toEqual([])

    expect(recallWorkerById(state, player, 'guest:1')).toBe(true)

    expect(grain.takenBy).toEqual([])
    // A Guest is dispatched once: recalled, it waits out the round and leaves at return home.
    expect(dispatchableGuests(state, player)).toEqual([])
  })

  it('voids only a Guest that could still be dispatched', () => {
    const forest = mkActionSpace({ id: 'forest' })
    const player = makePlayer('p1', [guest('guest:1', 3), guest('guest:2', 3), guest('guest:3', 4)])
    const state = makeState(3, [player], [forest])
    addWorkerRef(forest, 'p1', 'guest:1')

    expect(voidGuest(state, player, 'guest:1')).toBeUndefined()
    expect(voidGuest(state, player, 'guest:3')).toBeUndefined()
    expect(voidGuest(state, player, 'guest:9')).toBeUndefined()
    expect(voidGuest(state, player, 'guest:2')).toMatchObject({ id: 'guest:2' })
    expect(player.guests?.map(entry => entry.id)).toEqual(['guest:1', 'guest:3'])
  })

  it('takes back every Guest whose round has come at return home and reports the unused ones', () => {
    const used = guest('guest:1', 3, { dispatched: true })
    const unused = guest('guest:2', 3)
    const stale = guest('guest:3', 1)
    const booked = guest('guest:4', 6)
    const declined = guest('guest:1', 3)
    const owner = makePlayer('p1', [used, unused, stale, booked])
    const other = makePlayer('p2', [declined])
    const never = makePlayer('p3')
    const state = makeState(3, [owner, other, never])

    expect(returnGuests(state)).toEqual([
      { playerId: 'p1', guest: unused },
      { playerId: 'p1', guest: stale },
      { playerId: 'p2', guest: declined },
    ])
    expect(owner.guests).toEqual([booked])
    expect(other.guests).toEqual([])
    expect(never).not.toHaveProperty('guests')
  })

  it('limits a Guest to the spaces its scope names', () => {
    const forest = mkActionSpace({ id: 'forest', gainPerRound: { wood: 3 } })
    const fishing = mkActionSpace({ id: 'fishing', gainPerRound: { food: 1 } })
    const dayLaborer = mkActionSpace({ id: 'day-laborer' })

    expect([forest, fishing, dayLaborer].map(space => guestMayEnter(undefined, space))).toEqual([true, true, true])
    expect([forest, fishing, dayLaborer].map(space => guestMayEnter({ kind: 'spaces', spaceIds: ['fishing'] }, space)))
      .toEqual([false, true, false])
    expect([forest, fishing, dayLaborer].map(space => guestMayEnter({ kind: 'accumulation' }, space)))
      .toEqual([true, true, false])
  })

  it('reads a scope from flow data and rejects a malformed one instead of widening it', () => {
    expect(readGuestPlacementScope(undefined)).toBeUndefined()
    expect(readGuestPlacementScope({ kind: 'accumulation' })).toEqual({ kind: 'accumulation' })
    expect(readGuestPlacementScope({ kind: 'spaces', spaceIds: ['fishing'] })).toEqual({ kind: 'spaces', spaceIds: ['fishing'] })
    for (const malformed of [null, 'fishing', {}, { kind: 'any' }, { kind: 'spaces' }, { kind: 'spaces', spaceIds: ['fishing', 3] }]) {
      expect(readGuestPlacementScope(malformed), JSON.stringify(malformed)).toBeNull()
    }
  })
})
