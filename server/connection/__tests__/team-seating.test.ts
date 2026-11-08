import { describe, expect, it, vi } from 'vitest'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'
import { listMyActiveRooms } from '../../lobby-my-rooms'
import { roomConnectedPlayerCount, roomOccupiedSeatCount, snapshotToRoom } from '../../game/room'
import { removePlayerFromRoom } from '../../game/room'
import { RoomDirectory, RoomCapacityError } from '../../game/room-directory'
import { RoomAuthority } from '../../game/room-authority'
import { Broadcaster } from '../broadcaster'
import { teamWaitingState } from '../../game/team-room'
import { randomUUID } from 'node:crypto'
import { firstDraftPick } from '../../../shared/draft/__tests__/draft-fixtures'
import { draftSeatProgress } from '../../../shared/projections/draft-progress'
import { validateAndCompileCustomCode } from '../../custom-code/engine'
import { createCard, approveCurrentDraft, publish } from '../../workshop-drafts'
import { getAccountDeletionRoomIds } from '../../auth'
import { InvalidationStore } from '../../invalidation'

const { newDeps, dispatch } = recordedRouterFixture()
const client = (deps: ReturnType<typeof newDeps>, userId: string) => createConnectionCtx(
  { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() } as never, deps, true, userId,
)

describe('team room seating', () => {
  it('persists waiting accounts without assigning them player indices', async () => {
    const deps = newDeps()
    const host = client(deps, 'host')
    await dispatch(host, { type: 'createRoom', maxPlayers: 4, name: 'Host',
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'category-min', teammateVisibility: 'shared' },
    })
    const room = host.currentRoom!
    expect(room.status).toBe('waiting')
    expect(room.seatOwners).toEqual([])
    expect(room.players).toEqual([])
    const saved = await deps.persistence.load(room.id)
    expect(saved?.meta.players).toEqual([])
    expect(saved?.meta.teamMembers).toEqual([{
      memberId: expect.any(String), userId: 'host', teamIndex: 0, seatCount: 1, name: 'Host',
    }])
    expect(host.controlledPlayerIndices.size).toBe(0)
    expect(roomConnectedPlayerCount(room)).toBe(1)
    expect(roomOccupiedSeatCount(room)).toBe(1)
    expect(await deps.gameContextStore.resolve(room.id, 'host')).toMatchObject({ ok: true, phase: 'waiting', playerIndex: null })
    expect(await listMyActiveRooms(deps.commands.db, 'host')).toMatchObject([{ id: room.id, player_index: null,
      teamWaiting: { selfMemberId: room.teamMembers![0]!.memberId, members: [{ name: 'Host', teamIndex: 0, seatCount: 1 }] },
    }])
    expect(vi.mocked(host.ws.send).mock.calls.every(([raw]) => !String(raw).includes('"userId"'))).toBe(true)
  })

  it.each([
    { count: 4, seatsPerTeam: 2, seating: 'separated' },
    { count: 4, seatsPerTeam: 2, seating: 'random' },
    { count: 6, seatsPerTeam: 2, seating: 'separated' },
    { count: 6, seatsPerTeam: 2, seating: 'random' },
    { count: 6, seatsPerTeam: 3, seating: 'separated' },
    { count: 6, seatsPerTeam: 3, seating: 'random' },
  ] as const)('assigns actual account seats only at start: $count/$seatsPerTeam/$seating', async ({ count, seatsPerTeam, seating }) => {
    const deps = newDeps()
    const clients = Array.from({ length: count }, (_, index) => client(deps, `u${index}`))
    const host = clients[0]!
    await dispatch(host, { type: 'createRoom', maxPlayers: count, name: 'u0',
      teamConfig: { mode: 'team', seatsPerTeam, seating, scoring: 'sum', teammateVisibility: 'private' },
    })
    const room = host.currentRoom!
    for (const [offset, peer] of clients.slice(1).entries()) await dispatch(peer, { type: 'joinRoom', roomId: room.id, name: `u${offset + 1}` })
    expect(room.players).toEqual([])
    expect(room.seatOwners).toEqual([])
    await dispatch(host, { type: 'startTeamGame' })
    expect(room.status).toBe('playing')
    const teams = room.session.state.team!.playerTeams
    if (seating === 'separated') expect(teams).toEqual(Array.from({ length: count }, (_, index) => index % (count / seatsPerTeam)))
    for (const [teamIndex] of Array.from({ length: count / seatsPerTeam }).entries()) {
      expect(room.seatOwners!.filter(owner => teams[owner.playerIndex] === teamIndex).map(owner => owner.userId).sort())
        .toEqual(Array.from({ length: seatsPerTeam }, (_, offset) => `u${teamIndex * seatsPerTeam + offset}`))
    }
    for (const owner of room.seatOwners!) expect(room.session.state.players[owner.playerIndex]!.name).toBe(owner.userId)
    expect((await deps.persistence.load(room.id))!.meta.players).toEqual(room.seatOwners)
    for (const peer of clients) {
      const types = vi.mocked(peer.ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw)).type)
      expect(types.indexOf('roomJoined')).toBeLessThan(types.indexOf('stateUpdate'))
      await dispatch(peer, { type: 'getState' })
      expect(peer.currentPlayerIndex).toBe(room.seatOwners!.find(owner => owner.userId === peer.currentUserId)!.playerIndex)
    }
  })

  it('restores unseated members and reconnects to the generated seat after starting', async () => {
    const deps = newDeps()
    const clients = Array.from({ length: 4 }, (_, index) => client(deps, `u${index}`))
    const host = clients[0]!
    await dispatch(host, { type: 'createRoom', maxPlayers: 4, name: 'Host',
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'random', scoring: 'sum', teammateVisibility: 'private' },
      draftMode: 'simultaneous', draftPoolSize: 7,
    })
    const previous = host.currentRoom!
    for (const peer of clients.slice(1)) await dispatch(peer, { type: 'joinRoom', roomId: previous.id, name: peer.currentUserId })
    const saved = (await deps.persistence.load(previous.id))!
    const restored = snapshotToRoom(saved)
    previous.session.dispose()
    deps.registry.set(restored)
    const resumed = client(deps, 'u0')
    await dispatch(resumed, { type: 'joinRoom', roomId: restored.id, intent: 'resume' })
    expect(restored.seatOwners).toEqual([])
    expect(restored.teamMembers).toEqual(saved.meta.teamMembers)
    await dispatch(resumed, { type: 'startTeamGame' })
    expect(restored.status).toBe('playing')
    expect(restored.session.state.phase).toBe('draft')
    const actual = restored.seatOwners!.find(owner => owner.userId === 'u0')!.playerIndex
    const another = client(deps, 'u0')
    await dispatch(another, { type: 'joinRoom', roomId: restored.id, intent: 'resume' })
    expect(another.currentPlayerIndex).toBe(actual)
    expect([...another.controlledPlayerIndices]).toEqual([actual])
    const playerId = restored.session.state.players[actual]!.id
    const pick = firstDraftPick(restored.session.state.draft!, playerId)
    await dispatch(another, { type: 'draftSubmit', playerId, pick })
    expect(draftSeatProgress(restored.session.state.draft!, playerId).kept).toEqual({ occ: [pick.occCardId], minor: [pick.minorCardId] })
  })

  it('counts an unseated waiting connection for online quota and freezes expiry only after it disconnects', async () => {
    const deps = newDeps()
    const host = client(deps, 'host')
    await dispatch(host, { type: 'createRoom', maxPlayers: 4,
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' },
    })
    const room = host.currentRoom!
    const directory = new RoomDirectory(deps.commands.db)
    await directory.register('team-instance', 'http://team-instance:9000', 'team-test', 1)
    await directory.activate('team-instance')
    room.owner = (await directory.claim(room.id, 'team-instance')).owner
    await deps.commands.db.transaction(() => directory.markActive(room.id, room.owner!))()
    await new Broadcaster(directory).sendRoomEvent(host.ws, room, { type: 'teamRoomWaiting', ...teamWaitingState(room, 'host') })
    const authority = new RoomAuthority(directory, 'team-instance', deps.registry, deps.persistence, deps.checkpoint, deps.committer, deps.gameContextStore)
    await authority.retainOffline(room, Date.now())
    expect(await deps.gameContextStore.resolve(room.id, 'host')).not.toHaveProperty('expiresAt')
    await expect(directory.allocate('user:another', randomUUID())).rejects.toBeInstanceOf(RoomCapacityError)
    expect(removePlayerFromRoom(room, host.ws)).toBe('empty')
    await authority.retainOffline(room, Date.now())
    expect(await deps.gameContextStore.resolve(room.id, 'host')).toHaveProperty('expiresAt', expect.any(Number))
    await expect(directory.allocate('user:another', randomUUID())).resolves.toHaveProperty('roomId')
  })

  it('publishes the new seat bindings only after the complete seating transaction commits', async () => {
    const deps = newDeps()
    const clients = Array.from({ length: 4 }, (_, index) => client(deps, `u${index}`))
    const host = clients[0]!
    await dispatch(host, { type: 'createRoom', maxPlayers: 4,
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' },
    })
    const room = host.currentRoom!
    await dispatch(host, { type: 'startTeamGame' })
    expect(room.status).toBe('waiting')
    for (const peer of clients.slice(1)) await dispatch(peer, { type: 'joinRoom', roomId: room.id, name: peer.currentUserId })
    await dispatch(clients[1]!, { type: 'startTeamGame' })
    expect(room.status).toBe('waiting')
    for (const peer of clients) vi.mocked(peer.ws.send).mockClear()
    let entered!: () => void
    let release!: () => void
    const atCommit = new Promise<void>(resolve => { entered = resolve })
    const gate = new Promise<void>(resolve => { release = resolve })
    const commit = deps.persistence.commitReplay.bind(deps.persistence)
    vi.spyOn(deps.persistence, 'commitReplay').mockImplementationOnce(async value => { entered(); await gate; return commit(value) })
    const starting = dispatch(host, { type: 'startTeamGame' })
    try {
      await Promise.race([atCommit, starting.then(() => { throw new Error('Start did not reach durable commit') })])
      expect(clients.flatMap(peer => vi.mocked(peer.ws.send).mock.calls)).toEqual([])
      expect((await deps.persistence.load(room.id))!.meta.players).toEqual([])
      expect(await deps.persistence.loadReplayHead(room.id)).toBeNull()
    } finally { release(); await starting }
    expect((await deps.persistence.loadReplayHead(room.id))!.latestStepNo).toBe(0)
    expect((await deps.persistence.load(room.id))!.meta.players).toEqual(room.seatOwners)
    for (const peer of clients) {
      const types = vi.mocked(peer.ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw)).type)
      expect(types.indexOf('roomJoined')).toBeLessThan(types.indexOf('stateUpdate'))
    }
  })

  it('starts an executable Workshop team room with the same account names in the worker and committed state', async () => {
    const deps = newDeps()
    const clients = Array.from({ length: 4 }, (_, index) => client(deps, `u${index}`))
    const host = clients[0]!
    await dispatch(host, { type: 'getCommandScope' })
    const compiled = validateAndCompileCustomCode(`
const CARD_ID = 'CUSTOM_TeamSeating'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Team Seating' })
const CARD_IMPL = { listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], handler: () => undefined }] }
`, 'CUSTOM_TeamSeating')
    if (!compiled.valid) throw new Error(compiled.errors.join('; '))
    const card = await createCard(deps.commands.db, { authorId: 'u0', draft: {
      cardId: 'CUSTOM_TeamSeating', cardType: 'minor', name: 'Team Seating', description: 'Team room worker fixture',
      cardJson: { id: 'CUSTOM_TeamSeating', name: 'Team Seating', card_type: 'minor', deck: 'CUSTOM', number: 1, desc: [] },
      effectCode: null, compiledCode: compiled.compiledCode, codeManifest: compiled.manifest, artUrl: null, generation: {},
    } })
    await approveCurrentDraft(deps.commands.db, { cardId: card.id, authorId: 'u0' })
    await publish(deps.commands.db, { cardId: card.id, authorId: 'u0', baseRevision: card.revision })
    await dispatch(host, { type: 'createRoom', maxPlayers: 4, name: 'u0', customCardIds: [card.id], enableCommunityDeck: true,
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'random', scoring: 'sum', teammateVisibility: 'private' },
    })
    const room = host.currentRoom!
    for (const peer of clients.slice(1)) await dispatch(peer, { type: 'joinRoom', roomId: room.id, name: peer.currentUserId })
    expect(room.customSessionExecutor).toBeDefined()
    await dispatch(host, { type: 'startTeamGame' })
    expect(room.status).toBe('playing')
    const worker = await room.customSessionExecutor!.execute('getState', [])
    expect(worker.ok, worker.error).toBe(true)
    const expected = room.seatOwners!.map(owner => owner.userId)
    expect(worker.state.players.map(player => player.name)).toEqual(expected)
    expect((await deps.persistence.load(room.id))!.serialized!.state.players.map(player => player.name)).toEqual(expected)
  }, 15000)

  it('includes an unseated non-host member in account cleanup and invalidation', async () => {
    const deps = newDeps()
    const host = client(deps, 'host')
    const guest = client(deps, 'guest')
    await dispatch(host, { type: 'createRoom', maxPlayers: 4,
      teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'private' },
    })
    const room = host.currentRoom!
    await dispatch(guest, { type: 'joinRoom', roomId: room.id })
    expect(await getAccountDeletionRoomIds('guest')).toEqual([room.id])
    const operation = await new InvalidationStore(deps.commands.db).begin('user', 'guest', async () => {})
    expect(operation.roomIds).toEqual([room.id])
    expect(await deps.persistence.load(room.id)).toBeNull()
    expect(await deps.gameContextStore.lifecycle(room.id)).toBe('expired')
  })
})
