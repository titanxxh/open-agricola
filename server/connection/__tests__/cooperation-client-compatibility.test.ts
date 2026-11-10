import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'
import type { ServerEvent } from '../../../shared/contract/protocol/ws'
import { TEAM_COOPERATION_CAPABILITY } from '../../../shared/contract/client-capabilities'
import { createWorkSession } from '../../__tests__/_helpers/session-fixtures'
import { serializeState } from '../../../shared/session/serialization'
import type { Room } from '../../game/room'

const { newDeps, dispatch } = recordedRouterFixture()
const teamConfig = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private', cooperationRules: true } as const
const client = (deps: ReturnType<typeof newDeps>, userId: string) => createConnectionCtx(
  { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() } as never, deps, true, userId,
)
const events = (ctx: ReturnType<typeof client>): ServerEvent[] => vi.mocked(ctx.ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw)))
const declare = (ctx: ReturnType<typeof client>) => dispatch(ctx, { type: 'getCommandScope', clientCapabilities: [TEAM_COOPERATION_CAPABILITY] })

it('durably rejects unsupported cooperation creation before allocating a Room and never re-executes its identity', async () => {
  vi.stubEnv('NODE_ENV', 'production')
  vi.stubEnv('ADMIN_USERS', 'host')
  const deps = newDeps(), host = client(deps, 'host')
  await dispatch(host, { type: 'getCommandScope' })
  const scope = events(host).find(event => event.type === 'commandScope')
  if (scope?.type !== 'commandScope') throw new Error('Expected public command scope')
  const command = { type: 'createRoom', maxPlayers: 4, teamConfig, commandContext: { scopeId: scope.scope.scopeId, commandId: randomUUID() } } as const
  await dispatch(host, command)
  expect(deps.registry.size()).toBe(0)
  expect(host.currentRoom).toBeNull()
  expect(await deps.commands.db.prepare('SELECT id FROM rooms').all()).toEqual([])
  const outcomes = await deps.commands.db.prepare('SELECT outcome_json FROM command_requests WHERE outcome_json IS NOT NULL').all<{ outcome_json: string }>()
  expect(outcomes.map(row => JSON.parse(row.outcome_json))).toEqual([{ ok: false, code: 'client_refresh_required', error: 'Please refresh this page to use official cooperation rules.' }])
  const published = events(host)
  expect(published.findIndex(event => event.type === 'commandReceipt' && event.status === 'completed')).toBeLessThan(published.findIndex(event => event.type === 'error' && event.code === 'client_refresh_required'))
  await dispatch(host, command)
  expect(deps.registry.size()).toBe(0)
  expect(await deps.commands.db.prepare('SELECT outcome_json FROM command_requests WHERE outcome_json IS NOT NULL').all()).toEqual(outcomes)
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig: { ...teamConfig, cooperationRules: false } })
  expect(host.currentRoom?.session.state.team?.configuration.cooperationRules).toBe(false)
})

it.each(['team', 'multihand'] as const)('rejects unsupported %s join/resume before membership or socket replacement and preserves omitted scope declarations', async mode => {
  const deps = newDeps(), host = client(deps, 'host'), guest = client(deps, 'guest')
  await declare(host)
  await dispatch(host, { type: 'getCommandScope' })
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig: { ...teamConfig, mode } })
  const room = host.currentRoom!
  expect(room.session.state.team?.configuration.cooperationRules).toBe(true)
  await dispatch(guest, { type: 'createRoom', maxPlayers: 2 })
  const previous = guest.currentRoom
  const before = { members: structuredClone(room.teamMembers), version: room.version, snapshot: await deps.persistence.load(room.id) }
  await dispatch(guest, { type: 'joinRoom', roomId: room.id })
  expect(guest.currentRoom).toBe(previous)
  expect({ members: room.teamMembers, version: room.version, snapshot: await deps.persistence.load(room.id) }).toEqual(before)
  expect(events(guest)).toContainEqual(expect.objectContaining({ type: 'error', code: 'client_refresh_required', error: 'Please refresh this page to use official cooperation rules.' }))
  await declare(guest)
  await dispatch(guest, { type: 'getCommandScope' })
  await dispatch(guest, { type: 'joinRoom', roomId: room.id })
  expect(guest.currentRoom).toBe(room)
  const member = room.teamMembers!.find(value => value.userId === 'guest')!
  const resumed = client(deps, 'guest')
  const joined = await deps.persistence.load(room.id)
  await dispatch(resumed, { type: 'joinRoom', roomId: room.id, intent: 'resume' })
  expect(resumed.currentRoom).toBeNull()
  expect(room.waitingTeamConnections?.get(member.memberId)).toBe(guest.ws)
  expect(guest.ws.close).not.toHaveBeenCalled()
  expect(await deps.persistence.load(room.id)).toEqual(joined)
  await declare(resumed)
  await dispatch(resumed, { type: 'joinRoom', roomId: room.id, intent: 'resume' })
  expect(resumed.currentRoom).toBe(room)
  expect(room.waitingTeamConnections?.get(member.memberId)).toBe(resumed.ws)
  expect(guest.ws.close).toHaveBeenCalledWith(4001, 'connection replaced')
  expect(JSON.stringify(await deps.persistence.load(room.id))).not.toContain(TEAM_COOPERATION_CAPABILITY)
})

it('withholds cooperative publication from an already joined old socket while preserving its seat and durable writes', async () => {
  const deps = newDeps(), host = client(deps, 'host'), old = client(deps, 'old')
  const session = createWorkSession({ seed: 1632, options: { playerCount: 4 }, configure(state) {
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
  } })
  const room: Room = { id: `dev4-${randomUUID()}`, session, players: [], seatOwners: [], maxPlayers: 4, version: 0, status: 'playing' }
  deps.registry.set(room)
  deps.committer.lockNewRoom(room)
  expect(await deps.committer.prepareRoom(room, { missingPrefix: false })).toMatchObject({ kind: 'committed' })
  await dispatch(host, { type: 'joinRoom', roomId: room.id, requestedPlayerIndex: 0 })
  await dispatch(old, { type: 'joinRoom', roomId: room.id, requestedPlayerIndex: 1 })
  expect(old.currentRoom?.id, JSON.stringify(events(old))).toBe(room.id)
  expect(events(old).some(event => event.type === 'stateUpdate')).toBe(true)
  await declare(host)
  const target = createWorkSession({ seed: 1632, options: { playerCount: 4, teamConfig }, configure(state) {
    state.currentPlayerIndex = 0
    state.players[0]!.resources.wood = 0
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
  } })
  let loaded: ReturnType<typeof serializeState>
  try { loaded = target.withCtx(() => serializeState(target.state, {})) } finally { target.dispose() }
  vi.mocked(old.ws.send).mockClear()
  await dispatch(host, { type: 'loadGame', state: loaded })
  expect(room.session.state.team?.configuration.cooperationRules).toBe(true)
  expect(events(old).filter(event => event.type === 'stateUpdate')).toEqual([])
  expect(events(old)).toContainEqual(expect.objectContaining({ type: 'error', code: 'client_refresh_required', error: 'Please refresh this page to use official cooperation rules.' }))
  expect(room.players.find(player => player.userId === 'old')?.ws).toBe(old.ws)
  expect(old.ws.close).not.toHaveBeenCalled()
  const before = { version: room.version, state: JSON.stringify(room.session.state), snapshot: await deps.persistence.load(room.id), replay: await deps.persistence.loadReplayHead(room.id), proposal: room.endProposal }
  for (const command of [{ type: 'getState' }, { type: 'action', spaceId: 'forest' }, { type: 'proposeGameEnd', intent: 'end' }] as const) await dispatch(old, command)
  expect({ version: room.version, state: JSON.stringify(room.session.state), snapshot: await deps.persistence.load(room.id), replay: await deps.persistence.loadReplayHead(room.id), proposal: room.endProposal }).toEqual(before)
  const rejection = events(old).findLast(event => event.type === 'commandReceipt' && event.status === 'completed')
  expect(rejection).toMatchObject({ type: 'commandReceipt', status: 'completed', receipt: { outcome: { ok: false, code: 'client_refresh_required' } } })
  await dispatch(host, { type: 'action', spaceId: 'forest' })
  expect(room.session.state.players[0]!.resources.wood).toBe(3)
  expect(room.version).toBeGreaterThan(before.version)
  expect(events(old).filter(event => event.type === 'stateUpdate')).toEqual([])
})
