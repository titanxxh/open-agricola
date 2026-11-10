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
    const rejected = await deps.commands.db.prepare('SELECT outcome_json FROM command_requests WHERE outcome_json IS NOT NULL').all<{ outcome_json: string }>()
    expect(rejected.map(row => JSON.parse(row.outcome_json))).toContainEqual({ ok: false, error: 'Experimental feature unavailable', code: 'experimental_feature_unavailable' })
    expect(rejected.every(row => !row.outcome_json.includes('team-modes') && !Object.hasOwn(JSON.parse(row.outcome_json), 'feature'))).toBe(true)
    const denial = events(host).findIndex(event => event.type === 'error' && event.code === 'experimental_feature_unavailable')
    expect(events(host).findIndex(event => event.type === 'commandReceipt' && event.status === 'completed')).toBeLessThan(denial)
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
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig, draftMode: 'simultaneous' })
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
  const { firstDraftPick } = await import('../../../shared/draft/__tests__/draft-fixtures')
  const playerId = room.session.state.players[host.currentPlayerIndex]!.id
  const pick = firstDraftPick(room.session.state.draft!, playerId)
  const version = room.version
  await dispatch(host, { type: 'draftSubmit', playerId, pick })
  expect(room.version).toBeGreaterThan(version)
  await dispatch(spectator, { type: 'spectateRoom', roomId: room.id })
  expect(events(spectator).some(event => event.type === 'stateUpdate')).toBe(true)
})

const multihandTable = async () => {
  vi.stubEnv('DEV_EXPERIMENTAL_FEATURES', 'declared')
  vi.stubEnv('ADMIN_USERS', 'host')
  const deps = newDeps(), host = client(deps, 'host'), guest = client(deps, 'guest')
  await dispatch(host, { type: 'createRoom', maxPlayers: 4,
    teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' },
  })
  const room = host.currentRoom!
  await dispatch(guest, { type: 'joinRoom', roomId: room.id })
  await dispatch(host, { type: 'startTeamGame' })
  expect(room.status).toBe('playing')
  return { deps, host, guest, room }
}

it('checks the proposer before recording a rematch and checks them again when an unqualified guest agrees', async () => {
  const { deps, host, guest, room } = await multihandTable()
  const before = { id: room.id, version: room.version, replay: await deps.persistence.loadReplayHead(room.id), proposal: room.endProposal }
  await dispatch(guest, { type: 'proposeGameEnd', intent: 'rematch' })
  expect({ id: room.id, version: room.version, replay: await deps.persistence.loadReplayHead(room.id), proposal: room.endProposal }).toEqual(before)
  expect(events(guest)).toContainEqual(expect.objectContaining({ type: 'error', code: 'experimental_feature_unavailable', feature: 'team-modes' }))
  await dispatch(host, { type: 'proposeGameEnd', intent: 'rematch' })
  const proposal = structuredClone(room.endProposal)!
  const proposed = { id: room.id, version: room.version, replay: await deps.persistence.loadReplayHead(room.id), snapshot: await deps.persistence.load(room.id) }
  vi.stubEnv('ADMIN_USERS', '')
  await dispatch(guest, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
  expect(room.endProposal).toEqual(proposal)
  expect({ id: room.id, version: room.version, replay: await deps.persistence.loadReplayHead(room.id), snapshot: await deps.persistence.load(room.id) }).toEqual(proposed)
  await deps.commands.db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?)').run('host', 'host', 1)
  await dispatch(guest, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
  expect(room.id).not.toBe(before.id)
  expect(room.status).toBe('playing')
  expect(await deps.gameContextStore.lifecycle(before.id)).toBe('terminated')
})

it('fails closed when the recorded rematch proposer has no account mapping', async () => {
  const { deps, host, guest, room } = await multihandTable()
  await dispatch(host, { type: 'proposeGameEnd', intent: 'rematch' })
  const proposal = structuredClone(room.endProposal)!, id = room.id, version = room.version
  room.seatOwners = room.seatOwners?.filter(owner => owner.playerIndex !== proposal.proposerIndex)
  vi.stubEnv('ADMIN_USERS', 'guest')
  await dispatch(guest, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
  expect(room.id).toBe(id)
  expect(room.version).toBe(version)
  expect(room.endProposal).toEqual(proposal)
  expect(await deps.gameContextStore.lifecycle(id)).toBe('active')
})

it('checks the caller for a completed team rematch and leaves the completed archive unchanged on rejection', async () => {
  const { deps, guest, room } = await multihandTable()
  const terminal = room.session.loadState({ ...room.session.state, round: 14, gameOver: true })
  expect(await deps.committer.commit(room, terminal, { commandType: 'test-completion', intentJson: '{}' }, 0)).toMatchObject({ kind: 'committed' })
  const id = room.id, version = room.version, replay = await deps.persistence.loadReplayHead(id)
  await dispatch(guest, { type: 'newGame' })
  expect(room.id).toBe(id)
  expect(room.version).toBe(version)
  expect(await deps.persistence.loadReplayHead(id)).toEqual(replay)
  expect(await deps.gameContextStore.lifecycle(id)).toBe('completed')
  await deps.commands.db.prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,?)').run('guest', 'host', 1)
  await dispatch(guest, { type: 'newGame' })
  expect(room.id).not.toBe(id)
  expect(await deps.gameContextStore.lifecycle(id)).toBe('completed')
  expect(await deps.persistence.loadReplayHead(id)).toEqual(replay)
})

it('adds the qualification migration without rewriting a retained team room and restores it for continued play', async () => {
  const { migratePostgres } = await import('../../database/migrations')
  const { snapshotToRoom } = await import('../../game/room')
  const { firstDraftPick } = await import('../../../shared/draft/__tests__/draft-fixtures')
  vi.stubEnv('ADMIN_USERS', 'host')
  const deps = newDeps(), host = client(deps, 'host'), guest = client(deps, 'guest')
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, draftMode: 'simultaneous',
    teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' },
  })
  const original = host.currentRoom!, before = await deps.persistence.load(original.id)
  await deps.commands.db.exec('DROP TABLE beta_access; DELETE FROM postgres_schema_migrations WHERE version=36')
  await migratePostgres(deps.commands.db)
  expect(await deps.persistence.load(original.id)).toEqual(before)
  const restored = snapshotToRoom(before!)
  original.session.dispose()
  deps.registry.set(restored)
  const resumed = client(deps, 'host')
  resumed.experimentalFeatureAccess = async () => false
  guest.experimentalFeatureAccess = async () => false
  await dispatch(resumed, { type: 'joinRoom', roomId: restored.id, intent: 'resume' })
  await dispatch(guest, { type: 'joinRoom', roomId: restored.id })
  await dispatch(resumed, { type: 'startTeamGame' })
  expect(restored.status).toBe('playing')
  const playerId = restored.session.state.players[resumed.currentPlayerIndex]!.id
  const version = restored.version
  await dispatch(resumed, { type: 'draftSubmit', playerId, pick: firstDraftPick(restored.session.state.draft!, playerId) })
  expect(restored.version).toBeGreaterThan(version)
})

it('denies cooperation creation independently of Team eligibility while leaving ordinary teams available', async () => {
  vi.stubEnv('DEV_EXPERIMENTAL_FEATURES', 'declared')
  vi.stubEnv('ADMIN_USERS', 'host')
  const deps = newDeps(), host = client(deps, 'host')
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig: { ...teamConfig, cooperationRules: true } })
  expect(host.currentRoom?.id).toBeUndefined()
  expect(deps.registry.size()).toBe(0)
  expect(events(host)).toContainEqual(expect.objectContaining({ type: 'error', code: 'experimental_feature_unavailable', feature: 'team-cooperation-rules' }))
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig })
  expect(host.currentRoom?.session.state.team?.configuration).toEqual(teamConfig)
})

it('rechecks cooperation availability at rematch proposal, final acceptance and completed newGame', async () => {
  const deps = newDeps(), host = client(deps, 'host'), guest = client(deps, 'guest')
  host.experimentalFeatureAccess = async () => true
  guest.experimentalFeatureAccess = async () => true
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', cooperationRules: true } })
  const room = host.currentRoom!
  await dispatch(guest, { type: 'joinRoom', roomId: room.id })
  await dispatch(host, { type: 'startTeamGame' })
  const before = { id: room.id, version: room.version, replay: await deps.persistence.loadReplayHead(room.id), proposal: room.endProposal }
  host.experimentalFeatureAccess = async (_userId, feature) => feature === 'team-modes'
  await dispatch(host, { type: 'proposeGameEnd', intent: 'rematch' })
  expect({ id: room.id, version: room.version, replay: await deps.persistence.loadReplayHead(room.id), proposal: room.endProposal }).toEqual(before)
  expect(events(host)).toContainEqual(expect.objectContaining({ type: 'error', feature: 'team-cooperation-rules' }))
  host.experimentalFeatureAccess = async () => true
  await dispatch(host, { type: 'proposeGameEnd', intent: 'rematch' })
  const proposal = structuredClone(room.endProposal)!
  const proposed = { id: room.id, version: room.version, replay: await deps.persistence.loadReplayHead(room.id), proposal: room.endProposal }
  guest.experimentalFeatureAccess = async (_userId, feature) => feature === 'team-modes'
  await dispatch(guest, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
  expect({ id: room.id, version: room.version, replay: await deps.persistence.loadReplayHead(room.id), proposal: room.endProposal }).toEqual(proposed)
  const terminal = room.session.loadState({ ...room.session.state, round: 14, gameOver: true })
  expect(await deps.committer.commit(room, terminal, { commandType: 'test-completion', intentJson: '{}' }, 0)).toMatchObject({ kind: 'committed' })
  const completed = { id: room.id, version: room.version, replay: await deps.persistence.loadReplayHead(room.id) }
  await dispatch(guest, { type: 'newGame' })
  expect({ id: room.id, version: room.version, replay: await deps.persistence.loadReplayHead(room.id) }).toEqual(completed)
})

it('filters unavailable cooperation from both lobby readers while direct resume still works', async () => {
  const { RoomDirectory } = await import('../../game/room-directory')
  vi.stubEnv('DEV_EXPERIMENTAL_FEATURES', 'declared')
  vi.stubEnv('ADMIN_USERS', 'host')
  const deps = newDeps(), host = client(deps, 'host'), guest = client(deps, 'guest')
  host.experimentalFeatureAccess = async () => true
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig: { ...teamConfig, cooperationRules: true } })
  const room = host.currentRoom!
  expect(await deps.lobby.getRooms(50, 'host')).toEqual([])
  const directory = new RoomDirectory(deps.commands.db)
  await directory.register('cooperation-lobby', 'http://cooperation-lobby:9000', 'cooperation-lobby')
  await directory.activate('cooperation-lobby')
  const owner = (await directory.claim(room.id, 'cooperation-lobby')).owner
  await deps.commands.db.transaction(async () => { await directory.markActive(room.id, owner); await directory.presence(room.id, owner, 1, 1) })()
  expect(await directory.lobby(50, 'host')).toEqual([])
  guest.experimentalFeatureAccess = async () => false
  await dispatch(guest, { type: 'joinRoom', roomId: room.id })
  expect(guest.currentRoom?.id).toBe(room.id)
})
