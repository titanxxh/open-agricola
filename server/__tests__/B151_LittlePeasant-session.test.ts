import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { computeAllowedPlacementSpaces } from '../../shared/actions/helpers/placement-availability'
import { setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import '../../shared/cards/B/B151_LittlePeasant'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setupOccupiedSpaceSession = (options?: {
  withCard?: boolean
  houseType?: 'wood' | 'clay' | 'stone'
  rooms?: number
}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.houseType = options?.houseType ?? 'wood'
  player.rooms = options?.rooms ?? 2
  player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 },
    ...[{ row: 1, col: 1 }].slice(0, player.rooms - 2)]

  if (options?.withCard ?? true) {
    player.occupationPlayed.push('B151_LittlePeasant')
  }

  const opponentId = state.players[1]!.id
  const forest = state.actionSpaces.find((space) => space.id === 'forest')
  const meetingPlace = state.actionSpaces.find((space) => space.id === 'meeting-place')
  if (!forest || !meetingPlace) throw new Error('required action space missing')
  forest.takenBy = [{ playerId: opponentId, workerId: '1' }]
  meetingPlace.takenBy = [{ playerId: opponentId, workerId: '2' }]

  session.loadState(state)
  return session
}

const setupPlaySession = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = ['B151_LittlePeasant']

  session.loadState(state)
  return session
}

describe('B151_LittlePeasant session', () => {
  it('treats occupied non-meeting-place spaces as available only in a 2-room wooden house', () => {
    const withCard = setupOccupiedSpaceSession({ withCard: true }).getState()
    expect(withCard.actionAvailability?.forest).toBe(true)
    expect(withCard.actionAvailability?.['meeting-place']).toBe(false)

    const withoutCard = setupOccupiedSpaceSession({ withCard: false }).getState()
    expect(withoutCard.actionAvailability?.forest).toBe(false)

    const wrongRooms = setupOccupiedSpaceSession({ withCard: true, rooms: 3 }).getState()
    expect(wrongRooms.actionAvailability?.forest).toBe(false)

    const wrongHouse = setupOccupiedSpaceSession({ withCard: true, houseType: 'clay' }).getState()
    expect(wrongHouse.actionAvailability?.forest).toBe(false)
  })

  it('lets the player use occupied forest without overwriting the occupant', () => {
    const session = setupOccupiedSpaceSession({ withCard: true })

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBeGreaterThan(0)
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)
  })

  it('does not offer occupied urgent-wish-children when the player has no inactive worker to grow', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 12

    const player = state.players[0]!
    const opponent = state.players[1]!
    setActiveWorkerCount(player, 5)
    player.houseType = 'wood'
    player.rooms = 2
    player.occupationPlayed.push('B151_LittlePeasant')

    for (const space of state.actionSpaces) {
      space.takenBy = space.takenBy.filter((ref) => ref.playerId !== player.id)
    }
    state.actionSpaces.find((space) => space.id === 'forest')!.takenBy = [
      { playerId: opponent.id, workerId: '1' },
    ]
    state.actionSpaces.find((space) => space.id === 'urgent-wish-children')!.takenBy = [
      { playerId: player.id, workerId: '1' },
      { playerId: player.id, workerId: '2' },
      { playerId: player.id, workerId: '3' },
      { playerId: player.id, workerId: '4' },
    ]

    session.loadState(state)
    const loaded = session.getState().state
    const allowed = session.withCtx(() => computeAllowedPlacementSpaces(loaded, loaded.players[0]!, { actionHooks: session.actionHooks }))

    expect(allowed).toEqual(
      expect.arrayContaining([{ spaceId: 'forest', allowOccupied: true, option: expect.any(Object) }]),
    )
    expect(allowed.some((entry) => entry.spaceId === 'urgent-wish-children')).toBe(false)
  })

  it('gives 1 stone when the occupation is played', () => {
    const session = setupPlaySession()

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.occupationPlayed).toContain('B151_LittlePeasant')
    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })
})

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, take, finish, play, ownerTurn, rooms, at, res, occupiedByOpponent } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B151 N1 real purchase grants one stone and occupied Day Laborer remains usable in a two-room wooden house', () => { const b = make('B151_LittlePeasant', undefined, false), bought = finish(b, play(b, 'B151_LittlePeasant')); res(bought, { stone: 1 }); const s = make('B151_LittlePeasant', st => { st.currentPlayerIndex = 1; }); occupiedByOpponent(s); const r = finish(s, take(s, 0, 'day-laborer')); res(r, { food: 102 }); assert.equal(at(r, 'day-laborer').length, 1); assert.equal(at(r, 'day-laborer', 1).length, 1); save('B151-N1', { bought, r }); });
  it('B151 N2 Meeting Place house type room count and held card exclude occupied-space reuse', () => { for (const mode of ['meeting', 'clay', 'stone', 'rooms', 'hand']) {
      const target = mode === 'meeting' ? 'meeting-place' : 'day-laborer', s = make('B151_LittlePeasant', st => { st.currentPlayerIndex = 1; if (mode === 'clay' || mode === 'stone')
          st.players[0]!.houseType = mode; if (mode === 'rooms')
          rooms(st.players[0]!, 3); }, mode !== 'hand');
      occupiedByOpponent(s, target);
      const r = assertRejectedUnchanged(s, () => s.takeAction(0, target));
      res(r, { food: 100 });
      assert.equal(at(r, target).length, 0);
      save(`B151-N2-${mode}`, r);
  } });
  it('B151 N3 its own occupied non-Meeting space can be reused by a second distinct person', () => { const s = make('B151_LittlePeasant'), first = finish(s, take(s, 0, 'day-laborer')); ownerTurn(s); const r = finish(s, take(s, 0, 'day-laborer')); res(r, { food: 104 }); assert.equal(at(r, 'day-laborer').length, 2); assert.equal(new Set(at(r, 'day-laborer').map(x => x.workerId)).size, 2); assert.equal(workersAvailable(r.state, r.state.players[0]!), 0); save('B151-N3', { first, r }); });
})
