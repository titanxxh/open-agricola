import { expect, it, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'
import { getDb } from '../../db'
import { snapshotToRoom } from '../../game/room'

const { newDeps, dispatch } = recordedRouterFixture()
const teamConfig = { mode: 'multihand', seatsPerTeam: 2, seating: 'random', scoring: 'sum' } as const
const actor = (deps: ReturnType<typeof newDeps>, id: string) => createConnectionCtx(
  { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() } as unknown as WebSocket, deps, true, id,
)

it('lets either original team participant reuse the accepted setup while rechecking the calling account', async () => {
  const deps = newDeps(), host = actor(deps, 'host'), guest = actor(deps, 'guest')
  await dispatch(host, { type: 'createRoom', maxPlayers: 4, teamConfig, draftMode: 'simultaneous', draftPoolSize: 8,
    enableSnakeOpening: true, enableThroughTheSeasons: true })
  const source = host.currentRoom!
  await dispatch(guest, { type: 'joinRoom', roomId: source.id, name: 'Guest' })
  await dispatch(host, { type: 'startTeamGame' })
  expect(source.status).toBe('playing')
  const expected = { kind: 'team', maxPlayers: 4, teamConfig, draftMode: 'simultaneous', draftPoolSize: 8,
    enableSnakeOpening: true, enableThroughTheSeasons: true, enableCommunityDeck: false, customCardIds: [],
    officialCardPool: 'default-implemented-A-E', enableParentCards: false, draftParents: true,
    enableFarmersOfTheMoor: false, enableMoorBalanceRules: false, allowIncompleteFarmersOfTheMoorMinorDeal: false,
  }
  expect(await deps.persistence.loadCreationConfiguration(source.id)).toEqual({ configuration: expected, resolvedWorkshopSources: [] })
  const terminal = source.session.loadState({ ...source.session.state, round: 14, phase: 'playing', gameOver: true })
  expect((await deps.committer.commit(source, terminal, { commandType: 'test-completion', intentJson: '{}' }, 0)).kind).toBe('committed')
  for (const userId of ['host', 'guest']) {
    expect(await deps.gameContextStore.readCreationConfiguration(source.id, userId)).toEqual({ ok: true, configuration: expected, issues: [] })
  }
  expect(await deps.gameContextStore.readCreationConfiguration(source.id, 'outsider')).toMatchObject({ ok: false, code: 'not_participant' })
  deps.registry.delete(source.id)
  source.session.dispose()
  const next = actor(deps, 'guest')
  vi.stubEnv('DEV_EXPERIMENTAL_FEATURES', 'declared')
  await dispatch(next, { type: 'createRoom', sourceGameContextId: source.id })
  expect(next.currentRoom).toBeNull()
  expect(vi.mocked(next.ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw))))
    .toContainEqual(expect.objectContaining({ code: 'experimental_feature_unavailable', feature: 'team-modes' }))
  await getDb().prepare('INSERT INTO beta_access(user_id,granted_by,granted_at) VALUES(?,?,1)').run('guest', 'host')
  await dispatch(next, { type: 'createRoom', sourceGameContextId: source.id })
  expect(next.currentRoom?.session.state.team?.configuration).toEqual(teamConfig)
  expect(next.currentRoom?.draftMode).toBe('simultaneous')
  expect(next.currentRoom?.enableSnakeOpening).toBe(true)
  expect(await deps.persistence.loadCreationConfiguration(next.currentRoom!.id)).toEqual({ configuration: expected, resolvedWorkshopSources: [] })
  const stored = await deps.persistence.load(next.currentRoom!.id)
  if (!stored) throw new Error('Expected the new waiting team room to be durable')
  const restored = snapshotToRoom(stored)
  try { expect(restored.creationConfiguration).toEqual({ configuration: expected, resolvedWorkshopSources: [] }) }
  finally { restored.session.dispose() }
})
