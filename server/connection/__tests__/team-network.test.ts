import { request } from 'node:http'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import WebSocket from 'ws'
import { expect, it } from 'vitest'
import type { ClientCommand, ServerEvent } from '../../../shared/contract/protocol/ws'
import type { PrereleaseIdentityState } from '../../../shared/contract/prerelease-identity'
import { BROWSER_WS_PROTOCOL } from '../../../shared/contract/browser-auth'
import { PRERELEASE_BUILD_PROTOCOL_PREFIX, PRERELEASE_GENERATION_PROTOCOL_PREFIX } from '../../../shared/contract/prerelease-runtime'
import { PrereleaseSessions } from '../../prerelease-sessions'
import { getAccountDeletionRoomIds } from '../../auth'
import { GameContextStore } from '../../game/game-context-store'
import { GamePreferencesStore } from '../../game/game-preferences-store'
import { RoomDirectory } from '../../game/room-directory'
import { listMyActiveRooms } from '../../lobby-my-rooms'
import { createTestDatabase } from '../../__tests__/_helpers/postgres'
import { startFormalSoloBackend } from '../../__tests__/_helpers/formal-solo-network'
import { parseTeamRoomMembers } from '../../../shared/contract/team-room'

class Peer {
  readonly events: ServerEvent[] = []
  constructor(readonly socket: WebSocket) {
    socket.on('message', raw => { const event: ServerEvent = JSON.parse(raw.toString()); this.events.push(event) })
  }
  wait<T extends ServerEvent>(predicate: (event: ServerEvent) => event is T): Promise<T> {
    const existing = this.events.find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.off('message', receive); reject(new Error(`Expected Team event; received ${this.events.map(event => event.type + ('playerIndex' in event ? `(seat ${event.playerIndex})` : '')).join(', ')}`)) }, 8_000)
      const receive = () => { const event = this.events.find(predicate); if (event) { clearTimeout(timer); this.socket.off('message', receive); resolve(event) } }
      this.socket.on('message', receive)
    })
  }
  async mutate(command: ClientCommand, allocationId?: string, roomId?: string) {
    const requestId = randomUUID()
    this.socket.send(JSON.stringify({ type: 'getCommandScope', requestId }))
    const scope = await this.wait((event): event is Extract<ServerEvent, { type: 'commandScope' }> => event.type === 'commandScope' && event.requestId === requestId)
    const mutationId = randomUUID()
    this.socket.send(JSON.stringify({ ...command, requestId: mutationId,
      commandContext: { scopeId: scope.scope.scopeId, commandId: randomUUID(), ...(allocationId ? { allocationId } : {}), ...(roomId ? { roomId, expectedVersion: 0 } : {}) } }))
    const result = await this.wait((event): event is Extract<ServerEvent, { type: 'commandReceipt' }> => event.type === 'commandReceipt' && event.requestId === mutationId)
    if (result.status !== 'completed') throw new Error('Team command did not complete')
    return result.receipt.outcome
  }
  async close() { if (this.socket.readyState !== WebSocket.CLOSED) { const closed = once(this.socket, 'close'); this.socket.close(); await closed } }
}

async function teamNetwork(count = 2) {
  const db = await createTestDatabase()
  const runtime = { buildId: 'a'.repeat(40), generationId: randomUUID(), appOrigin: 'https://pre.example.test',
    formalAppOrigin: 'https://formal.example.test', formalApiBase: 'https://formal-api.example.test', targetId: 'prerelease-main' }
  let subject = { id: randomUUID(), username: 'team_host', displayName: 'Host Farmer' }
  const service = new PrereleaseSessions({ db, runtime, authority: {
    exchange: async () => {
      const now = Date.now()
      return { protocolVersion: 1, channel: 'prerelease', targetOrigin: runtime.appOrigin, generationId: runtime.generationId,
        grantId: randomUUID().replaceAll('-', '').padEnd(43, 'g'), account: { kind: 'active', subject },
        source: { kind: 'active', expiresAt: now + 86_400_000 }, grant: { kind: 'active', expiresAt: now + 86_400_000 },
        betaAccess: true, confirmedAt: now, validUntil: now + 30_000 } satisfies PrereleaseIdentityState
    }, status: async () => { throw new Error('Unexpected fixture identity refresh') }, events: async () => [], acknowledge: async () => {},
  } })
  let backend: Awaited<ReturnType<typeof startFormalSoloBackend>> | undefined
  const peers: Peer[] = [], userIds: string[] = [], tokens: string[] = []
  try {
    backend = await startFormalSoloBackend(db, { RELEASE_CHANNEL: 'prerelease', GAME_BUILD_ID: runtime.buildId,
      PUBLIC_APP_ORIGIN: runtime.appOrigin, PUBLIC_API_BASE: runtime.appOrigin, FORMAL_APP_ORIGIN: runtime.formalAppOrigin,
      FORMAL_API_BASE: runtime.formalApiBase, PRERELEASE_DATA_GENERATION: runtime.generationId,
      PRERELEASE_TARGET_ID: runtime.targetId, PRERELEASE_IDENTITY_SERVICE_KEY: 'team-fixture-service-key-'.repeat(2) })
    for (let index = 0; index < count; index++) {
      subject = { id: randomUUID(), username: `team_farmer_${index}`, displayName: `Farmer ${index}` }; userIds.push(subject.id)
      const pending = await service.beginHandoff(), params = new URLSearchParams(new URL(pending.formalUrl).hash.slice(1))
      const issued = await service.exchangeHandoff(pending.cookie, { protocolVersion: 1, code: 'c'.repeat(43),
        state: params.get('state')!, browserChallenge: params.get('browserChallenge')!, returnTo: runtime.formalAppOrigin + '/' })
      tokens.push(issued.token)
      const peer = new Peer(new WebSocket(backend.baseUrl.replace('http:', 'ws:') + '/ws', [BROWSER_WS_PROTOCOL,
        PRERELEASE_BUILD_PROTOCOL_PREFIX + runtime.buildId, PRERELEASE_GENERATION_PROTOCOL_PREFIX + runtime.generationId],
      { headers: { Host: new URL(runtime.appOrigin).host, Origin: runtime.appOrigin, Cookie: `__Host-oa-pre-session=${issued.token}` } }))
      peers.push(peer); await once(peer.socket, 'open')
    }
    const reconnect = async (index: number) => {
      const peer = new Peer(new WebSocket(backend!.baseUrl.replace('http:', 'ws:') + '/ws', [BROWSER_WS_PROTOCOL,
        PRERELEASE_BUILD_PROTOCOL_PREFIX + runtime.buildId, PRERELEASE_GENERATION_PROTOCOL_PREFIX + runtime.generationId],
      { headers: { Host: new URL(runtime.appOrigin).host, Origin: runtime.appOrigin, Cookie: `__Host-oa-pre-session=${tokens[index]}` } }))
      peers[index] = peer
      await once(peer.socket, 'open')
      return peer
    }
    const create = async (configuration?: import('../../../shared/contract/team').TeamConfiguration, maxPlayers = 4) => {
      const allocationId = randomUUID()
      const locate = await new Promise<{ status: number; body: string }>((resolve, reject) => {
        const req = request(`${backend!.baseUrl}/api/rooms/locate`, { method: 'POST',
            headers: { Host: new URL(runtime.appOrigin).host, Origin: runtime.appOrigin,
              Cookie: `__Host-oa-pre-session=${tokens[0]}`, 'Content-Type': 'application/json',
              'x-oa-browser-protocol': '2', 'x-oa-pre-build': runtime.buildId, 'x-oa-pre-generation': runtime.generationId } }, res => {
            let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk })
            res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
        })
        req.on('error', reject); req.end(JSON.stringify({ allocationId }))
      })
      expect(locate.status, locate.body).toBe(200)
      return peers[0]!.mutate({ type: 'createRoom', maxPlayers, enableCommunityDeck: false, customCardIds: [], teamConfig: configuration }, allocationId)
    }
    const close = async () => {
      service.close()
      for (const peer of peers) await peer.close()
      await backend?.close(); await db.close()
    }
    return { db, peers, userIds, create, reconnect, close }
  } catch (error) {
    service.close()
    for (const peer of peers) await peer.close()
    await backend?.close(); await db.close()
    throw error
  }
}

it('keeps prerelease Multihand accounts unseated until the host starts, then binds all controlled seats', async () => {
  const fixture = await teamNetwork()
  const { db, peers, userIds } = fixture
  try {
    const created = await fixture.create({ mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' })
    expect(created.ok).toBe(true)
    if (!created.roomId) throw new Error('Missing created Team room')
    const roomId = created.roomId
    const waiting = await db.prepare('SELECT status,team_members_json FROM rooms WHERE id=?').get(roomId)
    expect(waiting).toMatchObject({ status: 'waiting', team_members_json: [{ userId: userIds[0], teamIndex: 0, seatCount: 2 }] })
    expect(await db.prepare('SELECT * FROM room_players WHERE room_id=?').all(roomId)).toEqual([])
    expect(peers[0]!.events.some(event => event.type === 'stateUpdate')).toBe(false)
    const hostWaiting = await peers[0]!.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting')
    expect(hostWaiting).toMatchObject({ roomId, isHost: true, canStart: false, members: [{ name: 'Farmer 0', teamIndex: 0, seatCount: 2 }] })
    expect(JSON.stringify(hostWaiting)).not.toContain('userId')
    expect(await new RoomDirectory(db).lobby(50, userIds[1])).toMatchObject([{
      id: roomId, playerCount: 2, maxPlayers: 4, status: 'waiting',
      teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' },
    }])
    peers[1]!.socket.send(JSON.stringify({ type: 'joinRoom', roomId }))
    await peers[1]!.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting' && event.canStart === false)
    expect(await getAccountDeletionRoomIds(userIds[1]!, db)).toEqual([roomId])
    expect(await db.prepare('SELECT user_id FROM prerelease_retained_identity_refs WHERE user_id=?').all(userIds[1])).toEqual([{ user_id: userIds[1] }])
    expect(await new GameContextStore(db).resolve(roomId, userIds[1])).toMatchObject({ ok: true, lifecycle: 'active', phase: 'waiting', playerIndex: null })
    expect(await listMyActiveRooms(db, userIds[1]!)).toMatchObject([{ id: roomId, player_index: null, teamWaiting: { selfMemberId: expect.any(String) } }])
    const beforeStart = await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)
    const multihandMembers = parseTeamRoomMembers(beforeStart?.team_members_json)
    if (!multihandMembers?.[0] || !multihandMembers[1]) throw new Error('Missing Multihand membership')
    expect(await peers[0]!.mutate({ type: 'setTeam', teamIndex: 1, swapMemberId: multihandMembers[1].memberId }, undefined, roomId))
      .toMatchObject({ ok: false, code: 'team_change_failed' })
    expect(await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)).toEqual(beforeStart)
    expect((await peers[1]!.mutate({ type: 'startTeamGame' }, undefined, roomId)).ok).toBe(false)
    expect(await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)).toEqual(beforeStart)
    // #2039: the host start copies each member's account default into every seat that member controls.
    await new GamePreferencesStore(db).write(userIds[1]!, { autoResolveIndependentReactions: false })
    expect((await peers[0]!.mutate({ type: 'startTeamGame' }, undefined, roomId)).ok).toBe(true)
    expect(await db.prepare('SELECT player_index,user_id FROM room_players WHERE room_id=? ORDER BY player_index').all(roomId)).toEqual([
      { player_index: 0, user_id: userIds[0] }, { player_index: 1, user_id: userIds[1] },
      { player_index: 2, user_id: userIds[0] }, { player_index: 3, user_id: userIds[1] },
    ])
    for (const [index, peer] of peers.entries()) {
      const joined = await peer.wait((event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined' && event.status === 'playing')
      expect(joined).toMatchObject({ roomId, controlledPlayerIndexes: [index, index + 2], visiblePlayerIds: [`p${index + 1}`, `p${index + 3}`] })
      const state = await peer.wait((event): event is Extract<ServerEvent, { type: 'stateUpdate' }> => event.type === 'stateUpdate')
      expect(state.payload.state).toMatchObject({ team: { playerTeams: [0, 1, 0, 1] } })
      expect(state.payload.state.players.map(player => player.preferences))
        .toEqual([undefined, { autoResolveIndependentReactions: false }, undefined, { autoResolveIndependentReactions: false }])
    }
    expect((await peers[0]!.mutate({ type: 'proposeGameEnd', intent: 'rematch' }, undefined, roomId)).ok).toBe(true)
    const proposed = await peers[0]!.wait((event): event is Extract<ServerEvent, { type: 'gameEndProposal' }> => event.type === 'gameEndProposal' && event.proposal !== null)
    if (!proposed.proposal || proposed.proposal.intent !== 'rematch') throw new Error('Missing rematch proposal')
    const rematch = await peers[1]!.mutate({ type: 'respondGameEnd', proposalId: proposed.proposal.id, agree: true }, undefined, roomId)
    expect(rematch).toMatchObject({ ok: true, roomId: proposed.proposal.nextRoomId })
    const nextRoom = await db.prepare('SELECT status FROM rooms WHERE id=?').get(proposed.proposal.nextRoomId)
    expect(nextRoom).toEqual({ status: 'playing' })
    expect(await db.prepare('SELECT player_index,user_id FROM room_players WHERE room_id=? ORDER BY player_index').all(proposed.proposal.nextRoomId)).toEqual([
      { player_index: 0, user_id: userIds[0] }, { player_index: 1, user_id: userIds[1] },
      { player_index: 2, user_id: userIds[0] }, { player_index: 3, user_id: userIds[1] },
    ])
    const retained = await db.prepare('SELECT state_json FROM rooms WHERE id=?').get(proposed.proposal.nextRoomId)
    expect((await fixture.create({ mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' })).ok).toBe(true)
    for (const playerIndex of [0, 2]) await peers[1]!.wait((event): event is Extract<ServerEvent, { type: 'playerDisconnected' }> =>
      event.type === 'playerDisconnected' && event.playerIndex === playerIndex)
    expect(await db.prepare('SELECT state_json FROM rooms WHERE id=?').get(proposed.proposal.nextRoomId)).toEqual(retained)
  } finally { await fixture.close() }
}, 60_000)

it('permits empty-slot pairing and rejects over-capacity single-member moves after full occupancy', async () => {
  const fixture = await teamNetwork(4)
  const { db, peers } = fixture
  try {
    const created = await fixture.create({ mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'shared' })
    if (!created.roomId) throw new Error('Missing Team room')
    const roomId = created.roomId
    for (const peer of peers.slice(1, 3)) {
      peer.socket.send(JSON.stringify({ type: 'joinRoom', roomId }))
      await peer.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting')
    }
    const partial = await peers[0]!.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting' && event.members.length === 3)
    const adjusted = partial.members.find(value => value.name === 'Farmer 1')
    if (!adjusted) throw new Error('Missing adjusted member')
    expect(await peers[1]!.mutate({ type: 'setTeam', memberId: partial.selfMemberId, teamIndex: 1 }, undefined, roomId))
      .toMatchObject({ ok: false, code: 'team_change_failed' })
    expect(await peers[1]!.mutate({ type: 'setTeam', teamIndex: 1 }, undefined, roomId)).toMatchObject({ ok: true })
    await peers[1]!.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting'
      && event.members.some(member => member.memberId === adjusted.memberId && member.teamIndex === 1))
    expect(await peers[1]!.mutate({ type: 'setTeam', teamIndex: 0 }, undefined, roomId)).toMatchObject({ ok: true })
    expect(await peers[0]!.mutate({ type: 'setTeam', memberId: adjusted.memberId, teamIndex: 1 }, undefined, roomId)).toMatchObject({ ok: true })
    peers[3]!.socket.send(JSON.stringify({ type: 'joinRoom', roomId }))
    const full = await peers[0]!.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting' && event.canStart)
    expect(full.members.map(member => [member.name, member.teamIndex])).toEqual([
      ['Farmer 0', 0], ['Farmer 1', 1], ['Farmer 2', 1], ['Farmer 3', 0],
    ])
    const before = await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)
    for (const member of full.members) {
      expect(await peers[0]!.mutate({ type: 'setTeam', memberId: member.memberId, teamIndex: 1 - member.teamIndex }, undefined, roomId))
        .toMatchObject({ ok: false, code: 'team_change_failed' })
    }
    expect(await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)).toEqual(before)
  } finally { await fixture.close() }
}, 60_000)

it.each(['shared', 'private'] as const)('atomically reassigns a full %s roster to the host-selected member', async teammateVisibility => {
  const fixture = await teamNetwork(4)
  const { db, peers } = fixture
  try {
    const created = await fixture.create({ mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility })
    if (!created.roomId) throw new Error('Missing Team room')
    const roomId = created.roomId
    for (const peer of peers.slice(1)) {
      peer.socket.send(JSON.stringify({ type: 'joinRoom', roomId }))
      await peer.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting')
    }
    const full = await peers[0]!.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting' && event.canStart)
    const member = full.members.find(value => value.name === 'Farmer 1')
    const target = full.members.find(value => value.name === 'Farmer 2')
    if (!member || !target) throw new Error('Missing swap members')
    const before = await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)
    if (!before) throw new Error('Missing stored room')
    const original = parseTeamRoomMembers(before.team_members_json)
    if (!original) throw new Error('Missing stored members')
    const command = { type: 'setTeam', memberId: member.memberId, teamIndex: target.teamIndex,
      swapMemberId: target.memberId } satisfies Extract<ClientCommand, { type: 'setTeam' }>
    for (const invalid of [
      { ...command, memberId: randomUUID() },
      { ...command, swapMemberId: randomUUID() },
      { ...command, swapMemberId: member.memberId },
      { ...command, teamIndex: member.teamIndex },
      { ...command, teamIndex: -1 },
      { ...command, teamIndex: 2 },
      { ...command, teamIndex: 0.5 },
      { ...command, swapMemberId: full.selfMemberId, teamIndex: member.teamIndex },
      { type: 'setTeam', memberId: member.memberId, teamIndex: target.teamIndex } satisfies ClientCommand,
    ]) {
      expect(await peers[0]!.mutate(invalid, undefined, roomId)).toMatchObject({ ok: false, code: 'team_change_failed' })
      expect(await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)).toEqual(before)
    }
    for (const invalid of [command, { ...command, memberId: full.selfMemberId }]) {
      expect(await peers[1]!.mutate(invalid, undefined, roomId)).toMatchObject({ ok: false, code: 'team_change_failed' })
      expect(await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)).toEqual(before)
    }
    // @ts-expect-error Exercise the untrusted WebSocket optional-field boundary.
    expect(await peers[0]!.mutate({ ...command, swapMemberId: null }, undefined, roomId)).toMatchObject({ ok: false, code: 'team_change_failed' })
    // @ts-expect-error Exercise the untrusted WebSocket optional-field boundary.
    expect(await peers[0]!.mutate({ ...command, swapMemberId: 1 }, undefined, roomId)).toMatchObject({ ok: false, code: 'team_change_failed' })
    expect(await peers[0]!.mutate({ ...command, swapMemberId: '' }, undefined, roomId)).toMatchObject({ ok: false, code: 'team_change_failed' })
    await db.exec(`CREATE TABLE team_meta_writes (count integer NOT NULL);
      INSERT INTO team_meta_writes VALUES (0);
      CREATE FUNCTION count_team_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        UPDATE team_meta_writes SET count=count+1; RETURN NEW; END $$;
      CREATE TRIGGER count_team_change AFTER UPDATE ON rooms FOR EACH ROW
        WHEN (OLD.team_members_json IS DISTINCT FROM NEW.team_members_json) EXECUTE FUNCTION count_team_change()`)
    expect(await peers[0]!.mutate(command, undefined, roomId)).toMatchObject({ ok: true })
    const expected = original.map(value => value.memberId === member.memberId ? { ...value, teamIndex: target.teamIndex }
      : value.memberId === target.memberId ? { ...value, teamIndex: member.teamIndex } : value)
    expect(await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)).toEqual({
      state_json: before.state_json, team_members_json: expected,
    })
    expect(await db.prepare('SELECT count FROM team_meta_writes').get()).toEqual({ count: 1 })
    const swapped = await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)
    await db.exec(`CREATE FUNCTION reject_team_change() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'test Team metadata storage unavailable'; END $$;
      CREATE TRIGGER reject_team_change BEFORE UPDATE ON rooms FOR EACH ROW
        WHEN (OLD.team_members_json IS DISTINCT FROM NEW.team_members_json) EXECUTE FUNCTION reject_team_change()`)
    expect(await peers[0]!.mutate({ ...command, teamIndex: member.teamIndex }, undefined, roomId)).toMatchObject({ ok: false, code: 'team_change_failed' })
    expect(await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)).toEqual(swapped)
    expect(await db.prepare('SELECT count FROM team_meta_writes').get()).toEqual({ count: 1 })
    await db.exec('DROP TRIGGER reject_team_change ON rooms; DROP FUNCTION reject_team_change()')
    expect(await peers[0]!.mutate({ type: 'setTeam', memberId: member.memberId, teamIndex: target.teamIndex }, undefined, roomId)).toMatchObject({ ok: true })
    expect(await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)).toEqual(swapped)
    for (const peer of peers) await peer.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> =>
      event.type === 'teamRoomWaiting' && event.members.some(value => value.memberId === member.memberId && value.teamIndex === target.teamIndex)
      && event.members.some(value => value.memberId === target.memberId && value.teamIndex === member.teamIndex))
    expect(await db.prepare('SELECT * FROM room_players WHERE room_id=?').all(roomId)).toEqual([])
    expect(peers.flatMap(peer => peer.events).some(event => event.type === 'gameStarted')).toBe(false)
    expect((await peers[0]!.mutate({ type: 'startTeamGame' }, undefined, roomId)).ok).toBe(true)
    for (const [index, peer] of peers.entries()) {
      const joined = await peer.wait((event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined' && event.status === 'playing')
      const state = await peer.wait((event): event is Extract<ServerEvent, { type: 'stateUpdate' }> => event.type === 'stateUpdate')
      const ownMember = expected.find(value => value.userId === fixture.userIds[index])
      if (!ownMember) throw new Error('Missing member ownership')
      expect(joined.controlledPlayerIndexes).toHaveLength(ownMember.seatCount)
      expect(joined.controlledPlayerIndexes?.every(seat => state.payload.state.team?.playerTeams[seat] === ownMember.teamIndex)).toBe(true)
      expect(state.payload.state.players).toHaveLength(4)
      for (const seat of joined.controlledPlayerIndexes ?? []) expect(state.payload.state.players[seat]?.name).toBe(ownMember.name)
      const visible = state.payload.state.players.flatMap((player, seat) =>
        (teammateVisibility === 'shared' ? state.payload.state.team?.playerTeams[seat] === ownMember.teamIndex
          : joined.controlledPlayerIndexes?.includes(seat)) ? [player.id] : [])
      expect(joined.visiblePlayerIds).toEqual(visible)
      for (const player of state.payload.state.players) {
        expect(player.occupationHand).toHaveLength(7)
        expect(player.occupationHand.every(cardId => visible.includes(player.id) ? cardId !== '?' : cardId === '?')).toBe(true)
      }
      expect(await db.prepare('SELECT player_index FROM room_players WHERE room_id=? AND user_id=? ORDER BY player_index').all(roomId, ownMember.userId))
        .toEqual(joined.controlledPlayerIndexes?.map(player_index => ({ player_index })))
    }
    const playing = await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)
    expect(await peers[0]!.mutate(command, undefined, roomId)).toMatchObject({ ok: false, error: 'Team assignments are unavailable' })
    expect(await db.prepare('SELECT state_json,team_members_json FROM rooms WHERE id=?').get(roomId)).toEqual(playing)
  } finally { await fixture.close() }
}, 60_000)

it.each(['shared', 'private'] as const)('publishes %s Team hands without granting teammate command authority and updates waiting disconnects', async teammateVisibility => {
  const fixture = await teamNetwork(4)
  const { db, peers } = fixture
  try {
    const created = await fixture.create({ mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility })
    if (!created.roomId) throw new Error('Missing Team room')
    const roomId = created.roomId
    peers[1]!.socket.send(JSON.stringify({ type: 'joinRoom', roomId }))
    await peers[0]!.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> =>
      event.type === 'teamRoomWaiting' && event.members.some(member => member.name === 'Farmer 1' && member.connected === true))
    await peers[1]!.close()
    await peers[0]!.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> =>
      event.type === 'teamRoomWaiting' && event.members.some(member => member.name === 'Farmer 1' && member.connected === false))
    await fixture.reconnect(1)
    for (let index = 1; index < peers.length; index++) {
      peers[index]!.socket.send(JSON.stringify({ type: 'joinRoom', roomId, intent: index === 1 ? 'resume' : 'join' }))
      await peers[index]!.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting')
    }
    await peers[0]!.wait((event): event is Extract<ServerEvent, { type: 'teamRoomWaiting' }> => event.type === 'teamRoomWaiting' && event.canStart)
    expect((await peers[0]!.mutate({ type: 'startTeamGame' }, undefined, roomId)).ok).toBe(true)
    const joins = await Promise.all(peers.map(peer => peer.wait((event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined' && event.status === 'playing')))
    const states = await Promise.all(peers.map(peer => peer.wait((event): event is Extract<ServerEvent, { type: 'stateUpdate' }> => event.type === 'stateUpdate')))
    for (const [index, joined] of joins.entries()) {
      expect(joined.controlledPlayerIndexes).toEqual([joined.playerIndex])
      const visible = teammateVisibility === 'shared' ? joined.playerIndex % 2 === 0 ? ['p1', 'p3'] : ['p2', 'p4'] : [`p${joined.playerIndex + 1}`]
      expect(joined.visiblePlayerIds).toEqual(visible)
      for (const player of states[index]!.payload.state.players) {
        expect(player.occupationHand).toHaveLength(7)
        expect(player.minorHand).toHaveLength(7)
        if (visible.includes(player.id)) expect(player.occupationHand.every(id => id !== '?')).toBe(true)
        else expect(player.occupationHand.every(id => id === '?')).toBe(true)
      }
    }
    const interaction = states[0]!.payload.interaction
    const actor = interaction.stateId === 'wait' ? interaction.playerIndex : states[0]!.payload.state.currentPlayerIndex
    const teammate = joins.findIndex(joined => joined.playerIndex !== actor && joined.playerIndex % 2 === actor % 2)
    expect(teammate).toBeGreaterThanOrEqual(0)
    expect(states[teammate]!.payload.interaction.allowedCommands).toEqual([])
    const before = await db.prepare('SELECT state_json FROM rooms WHERE id=?').get(roomId)
    const replay = await db.prepare('SELECT * FROM game_replays WHERE room_id=?').get(roomId)
    expect(await peers[teammate]!.mutate({ type: 'action', spaceId: 'grain-seeds' }, undefined, roomId)).toMatchObject({ ok: false, error: 'seat mismatch: you cannot act on another player' })
    expect(await db.prepare('SELECT state_json FROM rooms WHERE id=?').get(roomId)).toEqual(before)
    expect(await db.prepare('SELECT * FROM game_replays WHERE room_id=?').get(roomId)).toEqual(replay)
  } finally { await fixture.close() }
}, 60_000)


it('keeps ordinary two-player reserved-seat start and resume valid while the owner is offline', async () => {
  const fixture = await teamNetwork()
  const { db, peers, userIds } = fixture
  try {
    const created = await fixture.create(undefined, 2)
    if (!created.roomId) throw new Error('Missing ordinary room')
    const roomId = created.roomId
    peers[1]!.socket.send(JSON.stringify({ type: 'joinRoom', roomId }))
    const waiting = await peers[1]!.wait((event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined' && event.status === 'waiting')
    expect(waiting.colorConfirmationPlayerIndex).toBe(waiting.playerIndex)
    const owners = await db.prepare('SELECT player_index,user_id FROM room_players WHERE room_id=? ORDER BY player_index').all(roomId)
    expect(await peers[0]!.mutate({ type: 'setTeam', teamIndex: 1, swapMemberId: 'not-a-Team-member' }, undefined, roomId))
      .toMatchObject({ ok: false, error: 'Team assignments are unavailable' })
    await peers[0]!.close()
    await peers[1]!.wait((event): event is Extract<ServerEvent, { type: 'playerDisconnected' }> => event.type === 'playerDisconnected')
    expect((await peers[1]!.mutate({ type: 'confirmPlayerColor' }, undefined, roomId)).ok).toBe(true)
    await peers[1]!.wait((event): event is Extract<ServerEvent, { type: 'gameStarted' }> => event.type === 'gameStarted')
    const resumed = await fixture.reconnect(0)
    resumed.socket.send(JSON.stringify({ type: 'joinRoom', roomId, intent: 'resume' }))
    const joined = await resumed.wait((event): event is Extract<ServerEvent, { type: 'roomJoined' }> => event.type === 'roomJoined' && event.status === 'playing')
    expect(joined.controlledPlayerIndexes).toEqual([joined.playerIndex])
    const state = await resumed.wait((event): event is Extract<ServerEvent, { type: 'stateUpdate' }> => event.type === 'stateUpdate')
    expect(state.payload.state.players).toHaveLength(2)
    expect(await db.prepare('SELECT player_index,user_id FROM room_players WHERE room_id=? ORDER BY player_index').all(roomId)).toEqual(owners)
    expect(await db.prepare('SELECT player_index FROM room_players WHERE room_id=? AND user_id=?').get(roomId, userIds[0])).toEqual({ player_index: joined.playerIndex })
    const beforeCommand = await db.prepare('SELECT state_json FROM rooms WHERE id=?').get(roomId)
    expect(await resumed.mutate({ type: 'confirmPlayerColor' }, undefined, roomId)).toMatchObject({ ok: false, error: 'Colors are locked after the game starts' })
    expect(await db.prepare('SELECT state_json FROM rooms WHERE id=?').get(roomId)).toEqual(beforeCommand)
  } finally { await fixture.close() }
}, 60_000)
