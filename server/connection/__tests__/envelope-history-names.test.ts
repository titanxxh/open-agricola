import { afterEach, describe, expect, it, vi } from 'vitest'
import * as historyNames from '../../../shared/projections/history-names'
import { buildSyncPayload } from '../../../shared/session/sync-payload'
import { serializeSessionSnapshot } from '../../../shared/session/serialization'
import { GameCore } from '../../../shared/session/session-core'
import { GameSession } from '../../game/authoritative-session'
import { frameHash } from '../../game/replay-codec'
import { buildEnvelope } from '../envelope-builder'
import { Broadcaster } from '../broadcaster'
import type { Room } from '../../game/room'

const sessions: GameCore[] = []
const setup = () => {
  const session = new GameSession(563, undefined, { playerCount: 2 })
  sessions.push(session)
  session.state.players.forEach(player => {
    player.name = 'Recorded name'
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  session.state.players[0]!.minorHand = ['A075_HouseExtension']
  session.state.players[1]!.minorHand = ['D036_BreedRegistry']
  session.loadState({ ...session.state, log: [{
    key: 'transfer',
    playerRefs: { fromPlayer: 'p1', toPlayer: 'p2' },
    params: { fromPlayer: 'Recorded name', toPlayer: 'Recorded name' },
  }] })
  session.updatePlayerName(0, 'Session actor')
  session.updatePlayerName(1, 'Session recipient')
  return session
}
const seats = (names: [string, string]): Room['players'] => names.map((name, playerIndex) => ({
  playerIndex, name, ws: { OPEN: 1, readyState: 1, send: vi.fn() } as never,
}))
const envelope = (session: GameSession, players: Room['players'], viewerPlayerId: string | null = 'p1', mode?: 'viewer' | 'dev-viewer' | 'debug') =>
  buildEnvelope({ room: { id: 'names', session, players }, resp: session.getState(), viewerPlayerId,
    version: 1, cause: 'reconnect', emittedAt: 0, mode })

afterEach(() => {
  vi.restoreAllMocks()
  sessions.splice(0).forEach(session => session.dispose())
})

describe('Room history name presentation', () => {
  it.each([
    ['aligned', ['Session actor', 'Session recipient']],
    ['overridden', ['Room actor', 'Room recipient']],
  ] as const)('projects each visible log once with %s connection names', (_, names) => {
    const session = setup()
    const before = serializeSessionSnapshot(session.state, session)
    const raw = JSON.stringify(before.frame)
    const hash = frameHash(before.frame)
    const cursor = session.createSessionPrivateCursor()
    const project = vi.spyOn(historyNames, 'projectHistoryLogNames')

    const result = envelope(session, seats([...names]))

    expect(result.payload.state.log).toEqual([{ key: 'transfer',
      playerRefs: { fromPlayer: 'p1', toPlayer: 'p2' },
      params: { fromPlayer: names[0], toPlayer: names[1] } }])
    expect(result.payload.state.players.map(player => player.name)).toEqual(names)
    expect(project).toHaveBeenCalledTimes(result.payload.state.log.length)
    expect(project.mock.calls[0]![2]).toMatchObject({ p1: names[0], p2: names[1] })
    expect(JSON.stringify(serializeSessionSnapshot(session.state, session).frame)).toBe(raw)
    expect(frameHash(before.frame)).toBe(hash)
    expect(session.createSessionPrivateCursor()).toEqual(cursor)
  })

  it('uses the latest Room names on reconnect without changing prior payloads or saved raw names', () => {
    const session = setup()
    const players = seats(['First room actor', 'First room recipient'])
    const first = envelope(session, players)
    const history = first.payload.historyWindow
    players[0]!.name = 'Reconnected actor'
    players[1]!.name = '   '
    session.updatePlayerName(1, 'New session recipient')
    const next = envelope(session, players)
    expect(first.payload.state.log[0]!.params).toMatchObject({ fromPlayer: 'First room actor', toPlayer: 'First room recipient' })
    expect(next.payload.state.log[0]!.params).toMatchObject({ fromPlayer: 'Reconnected actor', toPlayer: 'New session recipient' })
    expect(next.payload.historyWindow).toEqual(history)
    expect(session.state.log[0]!.params).toMatchObject({ fromPlayer: 'Recorded name', toPlayer: 'Recorded name' })
  })

  it.each([undefined, []] as const)('falls back to Session names when Room seats are %j', players => {
    const session = setup()
    const project = vi.spyOn(historyNames, 'projectHistoryLogNames')
    const result = buildEnvelope({ room: { id: 'names', session, players: players ? [...players] : undefined },
      resp: session.getState(), viewerPlayerId: 'p1', version: 1, cause: 'reconnect', emittedAt: 0 })
    expect(result.payload.state.log[0]!.params).toEqual({ fromPlayer: 'Session actor', toPlayer: 'Session recipient' })
    expect(result.payload.state.players.map(player => player.name)).toEqual(['Session actor', 'Session recipient'])
    expect(project).toHaveBeenCalledTimes(result.payload.state.log.length)
  })

  it.each(['viewer', 'dev-viewer'] as const)('preserves private hands and events in %s mode', mode => {
    const session = setup()
    const players = seats(['Room actor', 'Room recipient'])
    const response = session.getState()
    response.privateEvents = [{ schemaVersion: 1, type: 'private.handChanged', recipientPlayerId: 'p1',
      cardIds: ['A075_HouseExtension'], cardType: 'minor', reason: 'dev-draw-card' }]
    const views = ['p1', 'p2', null].map(viewerPlayerId => buildEnvelope({
      room: { id: 'names', session, players }, resp: response, viewerPlayerId, mode,
      version: 1, cause: 'reconnect', emittedAt: 0,
    }).payload)
    expect(views[0]!.state.players[0]!.minorHand).toEqual(['A075_HouseExtension'])
    expect(views[0]!.state.players[1]!.minorHand).not.toContain('D036_BreedRegistry')
    expect(views[1]!.state.players[1]!.minorHand).toEqual(['D036_BreedRegistry'])
    expect(views[1]!.state.players[0]!.minorHand).not.toContain('A075_HouseExtension')
    expect(views[2]!.state.players.flatMap(player => player.minorHand)).not.toContain('A075_HouseExtension')
    expect(views[0]!.privateEvents).toEqual(response.privateEvents)
    expect(views[1]!.privateEvents).toBeUndefined()
    expect(views[2]!.privateEvents).toBeUndefined()
    for (const view of views) {
      expect(view.state).not.toHaveProperty('gameSeed')
      expect(view.state.log[0]!.params).toMatchObject({ fromPlayer: 'Room actor', toPlayer: 'Room recipient' })
      if (mode === 'dev-viewer') expect(view.state.roundActionOrder).toEqual(session.state.roundActionOrder)
    }
  })

  it('keeps hotseat debug history raw and exposes both hands without name projection', () => {
    const session = setup()
    const players = seats(['Room actor', 'Room recipient'])
    const room: Room = { id: 'names', session, players, maxPlayers: 2, version: 1, status: 'playing', hotseat: true }
    const project = vi.spyOn(historyNames, 'projectHistoryLogNames')
    const broadcaster = new Broadcaster({ checkpoint: {} as never })
    broadcaster.broadcastCommitted(room, session.getState(), 'action')
    const sent = vi.mocked(players[0]!.ws.send).mock.calls[0]![0]
    const payload = JSON.parse(String(sent)).payload
    expect(payload.state.log[0].params).toMatchObject({ fromPlayer: 'Recorded name', toPlayer: 'Recorded name' })
    expect(payload.state.players.map((player: { name: string }) => player.name)).toEqual(['Session actor', 'Session recipient'])
    expect(payload.state.players[0].minorHand).toEqual(['A075_HouseExtension'])
    expect(payload.state.players[1].minorHand).toEqual(['D036_BreedRegistry'])
    expect(project).not.toHaveBeenCalled()
  })

  it('keeps default shared and direct Session presentation usable without a Room', () => {
    const session = setup()
    const direct = session.buildSyncPayload(session.getState(), 'p1')
    expect(direct.state.log[0]!.params).toMatchObject({ fromPlayer: 'Session actor', toPlayer: 'Session recipient' })
    const full = session.buildSyncPayload(session.getState(), 'p1', 'viewer', undefined, false, 'deferred')
    expect(full.state.log).toEqual(direct.state.log)
    expect(full.historyWindow).toBeUndefined()
    const core = new GameCore({ stateOrSeed: 563, initialStateOptions: { playerCount: 2 } })
    sessions.push(core)
    core.loadState(session.state)
    const shared = buildSyncPayload(core, core.getState(), 'p1')
    expect(shared.state.log).toEqual(direct.state.log)
    expect(shared.state.players[1]!.minorHand).not.toContain('D036_BreedRegistry')
    expect(core.state.log[0]!.params).toMatchObject({ fromPlayer: 'Recorded name', toPlayer: 'Recorded name' })
  })
})
