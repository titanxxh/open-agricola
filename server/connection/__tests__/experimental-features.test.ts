import { describe, expect, it, vi } from 'vitest'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'

const { newDeps, dispatch } = recordedRouterFixture()
const teamConfig = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' } as const
const client = (deps: ReturnType<typeof newDeps>, userId: string) => createConnectionCtx(
  { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() } as never, deps, true, userId,
)
const events = (ctx: ReturnType<typeof client>) => vi.mocked(ctx.ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw)))

describe('experimental feature entry gates', () => {
  it('rejects team creation without creating a room and permits a newly granted account', async () => {
    vi.stubEnv('DEV_EXPERIMENTAL_FEATURES', 'declared')
    const deps = newDeps(), host = client(deps, 'host')
    await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig })
    expect(host.currentRoom?.id).toBeUndefined()
    expect(deps.registry.size()).toBe(0)
    expect(events(host)).toContainEqual(expect.objectContaining({ type: 'error', code: 'experimental_feature_unavailable', feature: 'team-modes' }))
    expect(await deps.commands.db.prepare('SELECT id FROM rooms').all()).toEqual([])
    await deps.commands.db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?)').run('host', 'host', 1)
    await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig })
    expect(host.currentRoom?.session.state.team?.configuration).toEqual(teamConfig)
  })
})

it('filters both public lobby paths but preserves joining, team choice, starting and spectating existing rooms', async () => {
  const { RoomDirectory } = await import('../../game/room-directory')
  vi.stubEnv('DEV_EXPERIMENTAL_FEATURES', 'declared')
  vi.stubEnv('ADMIN_USERS', 'host')
  const deps = newDeps()
  const host = client(deps, 'host'), guest = client(deps, 'guest'), third = client(deps, 'third'), fourth = client(deps, 'fourth'), spectator = client(deps, 'spectator')
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig })
  const room = host.currentRoom!
  expect(await deps.lobby.getRooms(50, 'guest')).toEqual([])
  expect((await deps.lobby.getRooms(50, 'host')).map(summary => summary.id)).toEqual([room.id])
  const directory = new RoomDirectory(deps.commands.db)
  await directory.register('gates-lobby', 'http://gates-lobby:9000', 'gates-lobby')
  await directory.activate('gates-lobby')
  const owner = (await directory.claim(room.id, 'gates-lobby')).owner
  await deps.commands.db.transaction(async () => { await directory.markActive(room.id, owner); await directory.presence(room.id, owner, 1, 1) })()
  expect(await directory.lobby(50, 'guest')).toEqual([])
  expect((await directory.lobby(50, 'host')).map(summary => summary.id)).toEqual([room.id])
  await dispatch(guest, { type: 'joinRoom', roomId: room.id })
  expect(guest.currentRoom?.id).toBe(room.id)
  await dispatch(guest, { type: 'setTeam', teamIndex: 1 })
  await dispatch(third, { type: 'joinRoom', roomId: room.id })
  await dispatch(fourth, { type: 'joinRoom', roomId: room.id })
  vi.stubEnv('ADMIN_USERS', '')
  for (const connection of [host, guest, third, fourth, spectator]) connection.experimentalFeatureAccess = async () => false
  await dispatch(host, { type: 'startTeamGame' })
  expect(room.status).toBe('playing')
  await dispatch(spectator, { type: 'spectateRoom', roomId: room.id })
  expect(events(spectator).some(event => event.type === 'stateUpdate')).toBe(true)
})
