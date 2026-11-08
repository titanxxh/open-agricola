import { describe, expect, it, vi } from 'vitest'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'
import type { TeamConfiguration } from '../../../shared/contract/team'
import type { ClientCommand, ServerEvent } from '../../../shared/contract/protocol/ws'
import { firstDraftPick } from '../../../shared/draft/__tests__/draft-fixtures'
import { draftSeatProgress } from '../../../shared/projections/draft-progress'
import * as rng from '../../../shared/utils/rng'
import { ReplayStore } from '../../game/replay-store'
import { removePlayerFromRoom, snapshotToRoom } from '../../game/room'

const { newDeps, dispatch } = recordedRouterFixture()
const client = (deps: ReturnType<typeof newDeps>, userId: string) => createConnectionCtx({
  OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn(),
} as never, deps, true, userId)
const messages = (peer: ReturnType<typeof client>): ServerEvent[] =>
  vi.mocked(peer.ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw)))

const table = async (configuration: TeamConfiguration, maxPlayers = 4,
  setup: Omit<Extract<ClientCommand, { type: 'createRoom' }>, 'type' | 'teamConfig' | 'maxPlayers' | 'name'> = {}) => {
  const deps = newDeps()
  const peers = Array.from({ length: configuration.mode === 'multihand' ? maxPlayers / configuration.seatsPerTeam : maxPlayers },
    (_, index) => client(deps, `u${index}`))
  const host = peers[0]!
  await dispatch(host, { type: 'createRoom', maxPlayers, name: 'u0', teamConfig: configuration,
    draftMode: 'simultaneous', draftPoolSize: 7, ...setup,
  })
  const room = host.currentRoom!
  for (const peer of peers.slice(1)) await dispatch(peer, { type: 'joinRoom', roomId: room.id, name: peer.currentUserId })
  await dispatch(host, { type: 'startTeamGame' })
  expect(room.status).toBe('playing')
  return { deps, peers, host, room }
}

const rematch = async (peers: ReturnType<typeof client>[]) => {
  await dispatch(peers[0]!, { type: 'newGame' })
  const proposal = peers[0]!.currentRoom!.endProposal!
  for (const peer of peers.slice(1)) await dispatch(peer, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
}

describe('team rematch', () => {
  it('preserves the roster and team options, rerolls random seats and accepts the first new-game input', async () => {
    let freshSeed = 11
    const resolveSeed = rng.resolveSeed
    vi.spyOn(rng, 'resolveSeed').mockImplementation(seed => resolveSeed(seed ?? freshSeed))
    const configuration = { mode: 'team', seatsPerTeam: 2, seating: 'random', scoring: 'product', teammateVisibility: 'private' } as const
    const { deps, peers, host, room } = await table(configuration)
    expect(room.seatOwners!.map(owner => owner.userId)).toEqual(['u1', 'u3', 'u2', 'u0'])
    const oldId = room.id
    const roster = structuredClone(room.teamMembers)
    for (const peer of peers) vi.mocked(peer.ws.send).mockClear()
    freshSeed = 22
    await rematch(peers)
    expect(room.id).not.toBe(oldId)
    expect(room.session.state.gameSeed).toBe(22)
    expect(room.session.state.team).toEqual({ configuration, playerTeams: [1, 1, 0, 0] })
    expect(room.teamMembers).toEqual(roster)
    expect(room.status).toBe('playing')
    expect(room.seatOwners!.map(owner => owner.userId)).toEqual(['u3', 'u2', 'u0', 'u1'])
    expect((await deps.persistence.load(room.id))!.meta.players).toEqual(room.seatOwners)
    expect(await deps.gameContextStore.lifecycle(oldId)).toBe('terminated')
    for (const peer of peers) {
      const events = messages(peer)
      expect(events.findIndex(event => event.type === 'roomJoined')).toBeLessThan(events.findIndex(event => event.type === 'stateUpdate'))
      expect(events.some(event => event.type === 'teamRoomWaiting')).toBe(false)
    }
    const pick = firstDraftPick(room.session.state.draft!, 'p3')
    await dispatch(host, { type: 'draftSubmit', playerId: 'p3', pick })
    expect(draftSeatProgress(room.session.state.draft!, 'p3').kept).toEqual({ occ: [pick.occCardId], minor: [pick.minorCardId] })
  })

  it('takes one account consent for all Multihand seats and keeps every owned hand playable and private', async () => {
    let freshSeed = 11
    const resolveSeed = rng.resolveSeed
    vi.spyOn(rng, 'resolveSeed').mockImplementation(seed => resolveSeed(seed ?? freshSeed))
    const configuration = { mode: 'multihand', seatsPerTeam: 2, seating: 'random', scoring: 'total-min' } as const
    const { deps, peers, host, room } = await table(configuration)
    const oldId = room.id
    const roster = structuredClone(room.teamMembers)
    freshSeed = 22
    await dispatch(host, { type: 'newGame' })
    expect(room.endProposal!.agreements.map(vote => vote.playerIndex)).toEqual([0, 3])
    const guest = peers[1]!
    for (const peer of peers) vi.mocked(peer.ws.send).mockClear()
    await dispatch(guest, { type: 'respondGameEnd', proposalId: room.endProposal!.id, agree: true })
    expect(room.status).toBe('playing')
    expect(room.session.state.team).toEqual({ configuration, playerTeams: [1, 1, 0, 0] })
    expect(room.teamMembers).toEqual(roster)
    expect(room.players).toHaveLength(2)
    expect(room.seatOwners!.map(owner => owner.userId)).toEqual(['u1', 'u1', 'u0', 'u0'])
    expect(await new ReplayStore(deps.commands.db).manifest(oldId)).toMatchObject({ ok: true })
    for (const [peerIndex, peer] of peers.entries()) {
      const owned = peerIndex === 0 ? [2, 3] : [0, 1]
      expect(messages(peer)).toContainEqual(expect.objectContaining({
        type: 'roomJoined', roomId: room.id, playerIndex: owned[0], controlledPlayerIndexes: owned,
        visiblePlayerIds: owned.map(index => `p${index + 1}`), players: expect.arrayContaining([
          expect.objectContaining({ playerIndex: 0, connected: true }), expect.objectContaining({ playerIndex: 3, connected: true }),
        ]),
      }))
      const state = messages(peer).findLast(event => event.type === 'stateUpdate')
      if (!state || state.type !== 'stateUpdate') throw new Error('Missing rematch state')
      expect(state.connectedPlayerIndexes).toEqual([0, 1, 2, 3])
      for (const [index, player] of state.payload.state.players.entries()) {
        const progress = draftSeatProgress(state.payload.state.draft!, player.id)
        if (progress.kind !== 'selecting') throw new Error('Missing fresh draft pool')
        if (owned.includes(index)) expect(progress.pool.occ).not.toContain('?')
        else expect(progress.pool.occ.every(card => card === '?')).toBe(true)
      }
    }
    for (const [peerIndex, peer] of peers.entries()) {
      const owned = peerIndex === 0 ? [2, 3] : [0, 1]
      for (const index of owned) {
        const playerId = `p${index + 1}`
        const pick = firstDraftPick(room.session.state.draft!, playerId)
        await dispatch(peer, { type: 'draftSubmit', playerId, pick })
        expect(draftSeatProgress(room.session.state.draft!, playerId).kept).toEqual({ occ: [pick.occCardId], minor: [pick.minorCardId] })
      }
    }
    const version = room.version
    const foreign = structuredClone(draftSeatProgress(room.session.state.draft!, 'p1').kept)
    await dispatch(host, { type: 'draftSubmit', playerId: 'p1', pick: firstDraftPick(room.session.state.draft!, 'p1') })
    expect(room.version).toBe(version)
    expect(draftSeatProgress(room.session.state.draft!, 'p1').kept).toEqual(foreign)
  })

  it.each(['team', 'multihand'] as const)('retains offline %s memberships without generated seats and restores them before a normal host start', async mode => {
    const configuration: TeamConfiguration = mode === 'team'
      ? { mode, seatsPerTeam: 2, seating: 'random', scoring: 'category-min', teammateVisibility: 'shared' }
      : { mode, seatsPerTeam: 2, seating: 'random', scoring: 'category-min' }
    const { deps, peers, host, room } = await table(configuration, 6)
    const oldId = room.id
    const oldSeed = room.session.state.gameSeed
    const roster = structuredClone(room.teamMembers)
    await dispatch(host, { type: 'newGame' })
    const proposalId = room.endProposal!.id
    await dispatch(peers[1]!, { type: 'respondGameEnd', proposalId, agree: true })
    removePlayerFromRoom(room, peers[1]!.ws)
    for (const peer of peers) vi.mocked(peer.ws.send).mockClear()
    for (const peer of peers.slice(2)) await dispatch(peer, { type: 'respondGameEnd', proposalId, agree: true })
    expect(room.id).not.toBe(oldId)
    expect(room.status).toBe('waiting')
    expect(room.session.state.gameSeed).toMatch(/^[0-9a-f]{32}$/)
    expect(room.session.state.gameSeed).not.toBe(oldSeed)
    expect(room.teamMembers).toEqual(roster)
    expect(room.players).toEqual([])
    expect(room.seatOwners).toEqual([])
    expect(room.waitingTeamConnections!.size).toBe(peers.length - 1)
    for (const peer of peers.filter((_, index) => index !== 1)) {
      expect(messages(peer)).toContainEqual(expect.objectContaining({ type: 'teamRoomWaiting', roomId: room.id }))
      expect(messages(peer).some(event => event.type === 'roomJoined' || event.type === 'stateUpdate')).toBe(false)
      expect(messages(peer).every(event => !JSON.stringify(event).includes('"userId"'))).toBe(true)
    }
    const saved = (await deps.persistence.load(room.id))!
    expect(saved.meta.players).toEqual([])
    expect(saved.meta.teamMembers).toEqual(roster)
    const restored = snapshotToRoom(saved)
    room.session.dispose()
    deps.registry.set(restored)
    const stranger = client(deps, 'stranger')
    await dispatch(stranger, { type: 'joinRoom', roomId: restored.id })
    expect(stranger.currentRoom).toBeNull()
    const resumed = peers.map(peer => client(deps, peer.currentUserId!))
    for (const peer of resumed) await dispatch(peer, { type: 'joinRoom', roomId: restored.id, intent: 'resume' })
    expect(restored.seatOwners).toEqual([])
    await dispatch(resumed[0]!, { type: 'startTeamGame' })
    expect(restored.status).toBe('playing')
    expect(restored.seatOwners).toHaveLength(6)
    expect(restored.teamMembers).toEqual(roster)
    expect(await deps.gameContextStore.lifecycle(oldId)).toBe('terminated')
    const owner = restored.seatOwners!.find(seat => seat.userId === 'u1')!
    const playerId = `p${owner.playerIndex + 1}`
    const pick = firstDraftPick(restored.session.state.draft!, playerId)
    await dispatch(resumed[1]!, { type: 'draftSubmit', playerId, pick })
    expect(draftSeatProgress(restored.session.state.draft!, playerId).kept).toEqual({ occ: [pick.occCardId], minor: [pick.minorCardId] })
  })

  const formats = [
    { count: 4, seats: 2, seating: 'separated', labels: [0, 1, 0, 1], teamOwners: ['u0', 'u3', 'u1', 'u2'], multihandOwners: ['u0', 'u1', 'u0', 'u1'] },
    { count: 4, seats: 2, seating: 'random', labels: [1, 1, 0, 0], teamOwners: ['u3', 'u2', 'u0', 'u1'], multihandOwners: ['u1', 'u1', 'u0', 'u0'] },
    { count: 6, seats: 2, seating: 'separated', labels: [0, 1, 2, 0, 1, 2], teamOwners: ['u0', 'u3', 'u5', 'u1', 'u2', 'u4'], multihandOwners: ['u0', 'u1', 'u2', 'u0', 'u1', 'u2'] },
    { count: 6, seats: 2, seating: 'random', labels: [1, 2, 2, 0, 1, 0], teamOwners: ['u3', 'u5', 'u4', 'u0', 'u2', 'u1'], multihandOwners: ['u1', 'u2', 'u2', 'u0', 'u1', 'u0'] },
    { count: 6, seats: 3, seating: 'separated', labels: [0, 1, 0, 1, 0, 1], teamOwners: ['u1', 'u4', 'u0', 'u5', 'u2', 'u3'], multihandOwners: ['u0', 'u1', 'u0', 'u1', 'u0', 'u1'] },
    { count: 6, seats: 3, seating: 'random', labels: [0, 0, 1, 0, 1, 1], teamOwners: ['u1', 'u0', 'u4', 'u2', 'u5', 'u3'], multihandOwners: ['u0', 'u0', 'u1', 'u0', 'u1', 'u1'] },
  ] as const
  it.each(formats.flatMap(format => (['team', 'multihand'] as const).map(mode => ({ ...format, mode }))))(
    'rematches $mode $count/$seats/$seating through the shared seating rules', async ({ count, seats, seating, labels, teamOwners, multihandOwners, mode }) => {
      let freshSeed = 11
      const resolveSeed = rng.resolveSeed
      vi.spyOn(rng, 'resolveSeed').mockImplementation(seed => resolveSeed(seed ?? freshSeed))
      const configuration: TeamConfiguration = mode === 'team'
        ? { mode, seatsPerTeam: seats, seating, scoring: 'sum', teammateVisibility: 'shared' }
        : { mode, seatsPerTeam: seats, seating, scoring: 'product' }
      const { deps, peers, room } = await table(configuration, count)
      const roster = structuredClone(room.teamMembers)
      const oldId = room.id
      freshSeed = 22
      await rematch(peers)
      const expectedOwners = mode === 'team' ? teamOwners : multihandOwners
      expect(room.status).toBe('playing')
      expect(room.id).not.toBe(oldId)
      expect(room.session.state.team).toEqual({ configuration, playerTeams: labels })
      expect(room.teamMembers).toEqual(roster)
      expect(room.seatOwners!.map(owner => owner.userId)).toEqual(expectedOwners)
      expect(room.session.state.players.map(player => player.name)).toEqual(expectedOwners)
      expect((await deps.persistence.load(room.id))!.meta.teamMembers).toEqual(roster)
      for (const peer of peers) {
        const index = expectedOwners.findIndex(userId => userId === peer.currentUserId)
        const playerId = `p${index + 1}`
        const pick = firstDraftPick(room.session.state.draft!, playerId)
        await dispatch(peer, { type: 'draftSubmit', playerId, pick })
        expect(draftSeatProgress(room.session.state.draft!, playerId).kept).toEqual({ occ: [pick.occCardId], minor: [pick.minorCardId] })
      }
    },
  )

  it('retains the expansion, draft and card-source choices with Team options', async () => {
    const configuration = { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'total-min', teammateVisibility: 'private' } as const
    const { peers, room } = await table(configuration, 4, {
      enableCommunityDeck: true, enableParentCards: true, draftParents: false,
      enableThroughTheSeasons: true, enableFarmersOfTheMoor: true, enableMoorBalanceRules: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true, enableSnakeOpening: true, draftPoolSize: 8,
    })
    await rematch(peers)
    expect(room.session.state).toMatchObject({
      team: { configuration }, enableCommunityDeck: true, enableParentCards: true,
      enableThroughTheSeasons: true, enableFarmersOfTheMoor: true, enableMoorBalanceRules: true,
      enableSnakeOpening: true, draftMode: 'simultaneous', draftPoolSize: 8,
    })
    expect(room.draftParents).toBe(false)
    expect(room.allowIncompleteFarmersOfTheMoorMinorDeal).toBe(true)
  })

  it('publishes a playable replacement only after its Step 0 and old retirement commit together', async () => {
    const { deps, peers, host, room } = await table({ mode: 'multihand', seatsPerTeam: 2, seating: 'random', scoring: 'sum' })
    const oldId = room.id
    await dispatch(host, { type: 'newGame' })
    const proposalId = room.endProposal!.id
    const nextId = room.endProposal!.intent === 'rematch' ? room.endProposal!.nextRoomId : ''
    for (const peer of peers) vi.mocked(peer.ws.send).mockClear()
    let enter!: () => void, release!: () => void
    const entered = new Promise<void>(resolve => { enter = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const commit = deps.persistence.commitReplay.bind(deps.persistence)
    vi.spyOn(deps.persistence, 'commitReplay').mockImplementationOnce(value => deps.commands.db.transaction(async () => {
      const result = await commit(value)
      enter(); await gate
      return result
    })())
    const finalizing = dispatch(peers[1]!, { type: 'respondGameEnd', proposalId, agree: true })
    try {
      await Promise.race([entered, finalizing.then(() => { throw new Error('Rematch did not reach its initial commit') })])
      expect(room.id).toBe(oldId)
      expect(await deps.gameContextStore.lifecycle(oldId)).toBe('active')
      expect(await deps.persistence.load(nextId)).toBeNull()
      expect(await deps.persistence.loadReplayHead(nextId)).toBeNull()
      for (const peer of peers) expect(messages(peer)).toEqual([])
    } finally { release(); await finalizing }
    expect(room.id).toBe(nextId)
    expect(await deps.gameContextStore.lifecycle(oldId)).toBe('terminated')
    expect((await deps.persistence.loadReplayHead(nextId))!.latestStepNo).toBe(0)
    for (const peer of peers) {
      const events = messages(peer)
      expect(events.findIndex(event => event.type === 'roomJoined')).toBeLessThan(events.findIndex(event => event.type === 'stateUpdate'))
    }
  })

  it('retains the old room after an archive failure and retries the same replacement atomically', async () => {
    const { deps, peers, host, room } = await table({ mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'product' })
    const db = deps.commands.db
    const oldId = room.id
    await dispatch(host, { type: 'newGame' })
    const proposal = room.endProposal!
    if (proposal.intent !== 'rematch') throw new Error('Missing rematch proposal')
    const nextId = proposal.nextRoomId
    await db.exec("CREATE FUNCTION reject_team_rematch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'archive unavailable'; END $$; CREATE TRIGGER reject_team_rematch BEFORE INSERT ON game_terminations FOR EACH ROW EXECUTE FUNCTION reject_team_rematch()")
    let fail!: () => void
    const failed = new Promise<void>(resolve => { fail = resolve })
    const commit = deps.persistence.commitReplay.bind(deps.persistence)
    vi.spyOn(deps.persistence, 'commitReplay').mockImplementation(async value => {
      try { return await commit(value) } catch (error) { fail(); throw error }
    })
    for (const peer of peers) vi.mocked(peer.ws.send).mockClear()
    const finalizing = dispatch(peers[1]!, { type: 'respondGameEnd', proposalId: proposal.id, agree: true })
    try {
      await Promise.race([failed, finalizing.then(() => { throw new Error('Rematch did not fail at the archive') })])
      expect(room.id).toBe(oldId)
      expect(await deps.gameContextStore.lifecycle(oldId)).toBe('active')
      expect(await deps.persistence.load(oldId)).not.toBeNull()
      expect(await deps.persistence.load(nextId)).toBeNull()
      expect(await deps.persistence.loadReplayHead(nextId)).toBeNull()
      for (const peer of peers) expect(messages(peer).some(event => event.type === 'roomJoined' || event.type === 'stateUpdate')).toBe(false)
    } finally { await db.exec('DROP TRIGGER reject_team_rematch ON game_terminations'); await finalizing }
    expect(room.id).toBe(nextId)
    expect((await deps.persistence.loadReplayHead(nextId))!.latestStepNo).toBe(0)
    expect(await deps.gameContextStore.lifecycle(oldId)).toBe('terminated')
    expect(await new ReplayStore(db).manifest(oldId)).toMatchObject({ ok: true })
    for (const peer of peers) expect(messages(peer).filter(event => event.type === 'roomJoined')).toHaveLength(1)
  })

  it('keeps a completed Team result and replay intact when all online members rematch', async () => {
    const configuration = { mode: 'team', seatsPerTeam: 2, seating: 'random', scoring: 'category-min', teammateVisibility: 'shared' } as const
    const { deps, host, room } = await table(configuration)
    const oldId = room.id
    const terminal = room.session.loadState({ ...room.session.state, round: 14, gameOver: true })
    expect(await deps.committer.commit(room, terminal, { commandType: 'test-completion', intentJson: '{}' }, 0)).toMatchObject({ kind: 'committed' })
    const store = new ReplayStore(deps.commands.db)
    const archive = await store.manifest(oldId)
    const terminalReplay = await store.segment(oldId, 0)
    expect(archive).toMatchObject({ ok: true, team: { mode: 'team', scoring: 'category-min' } })
    expect(await deps.gameContextStore.lifecycle(oldId)).toBe('completed')
    await dispatch(host, { type: 'newGame' })
    expect(room.id).not.toBe(oldId)
    expect(room.status).toBe('playing')
    expect(room.session.state.team!.configuration).toEqual(configuration)
    expect(await store.manifest(oldId)).toEqual(archive)
    expect(await store.segment(oldId, 0)).toEqual(terminalReplay)
    expect(await deps.gameContextStore.lifecycle(oldId)).toBe('completed')
  })
})
