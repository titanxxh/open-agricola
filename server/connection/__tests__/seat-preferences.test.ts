import { describe, expect, it, vi } from 'vitest'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'

// #2039: a seat's auto-resolve setting is authoritative game state, changed only by that seat.
const { newDeps, dispatch } = recordedRouterFixture()

const client = (deps: ReturnType<typeof newDeps>, userId: string) => {
  const ws = { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() }
  return createConnectionCtx(ws as never, deps, true, userId)
}
const errors = (ctx: ReturnType<typeof client>) => vi.mocked(ctx.ws.send).mock.calls
  .map(([raw]) => JSON.parse(String(raw))).filter(message => message.type === 'error')

const twoSeats = async (deps = newDeps()) => {
  const host = client(deps, 'host')
  const guest = client(deps, 'guest')
  await dispatch(host, { type: 'createRoom', maxPlayers: 2 })
  const room = host.currentRoom!
  await dispatch(guest, { type: 'joinRoom', roomId: room.id })
  expect(room.status).toBe('playing')
  return { deps, host, guest, room }
}

describe('seat preferences over the room connection', () => {
  it('lets a participant change its own seat as one recorded step', async () => {
    const { deps, host, guest, room } = await twoSeats()
    const version = room.version
    const seat = host.currentPlayerIndex
    await dispatch(host, { type: 'setPlayerPreferences', playerIndex: seat, preferences: { autoResolveIndependentReactions: false } })
    expect(errors(host)).toEqual([])
    expect(room.session.state.players[seat]!.preferences).toEqual({ autoResolveIndependentReactions: false })
    expect(room.session.state.players[guest.currentPlayerIndex]!.preferences).toBeUndefined()
    expect(room.version).toBe(version + 1)
    const steps = await deps.commands.db.prepare(`SELECT player_index AS "playerIndex" FROM game_replay_steps
      WHERE room_id = ? AND command_type = 'setPlayerPreferences'`).all<{ playerIndex: string | number }>(room.id)
    expect(steps.map(step => Number(step.playerIndex))).toEqual([seat])
  })

  it('rejects another seat and malformed settings without changing the game', async () => {
    const { host, guest, room } = await twoSeats()
    const before = JSON.stringify(room.session.state)
    const version = room.version
    await dispatch(guest, { type: 'setPlayerPreferences', playerIndex: host.currentPlayerIndex, preferences: { autoResolveIndependentReactions: false }, requestId: 'other-seat' })
    expect(errors(guest)).toEqual([expect.objectContaining({ requestId: 'other-seat', error: 'seat mismatch: you cannot act on another player' })])
    await dispatch(host, { type: 'setPlayerPreferences', playerIndex: host.currentPlayerIndex, preferences: { autoResolveIndependentReactions: 'no' } as never, requestId: 'bad' })
    expect(JSON.stringify(room.session.state)).toBe(before)
    expect(room.version).toBe(version)
  })

  it('copies each account’s stored default into its seat when the game starts', async () => {
    const deps = newDeps()
    await deps.commands.db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,'hash',1) ON CONFLICT(id) DO NOTHING")
      .run('guest', 'guest', 'guest')
    await deps.gamePreferences.write('guest', { autoResolveIndependentReactions: false })
    const { host, guest, room } = await twoSeats(deps)
    expect(room.session.state.players[host.currentPlayerIndex]!.preferences).toBeUndefined()
    expect(room.session.state.players[guest.currentPlayerIndex]!.preferences).toEqual({ autoResolveIndependentReactions: false })
  })
})
