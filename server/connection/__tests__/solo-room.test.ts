import { describe, expect, it, vi } from 'vitest'
import type { WebSocket } from 'ws'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { getDb } from '../../db'
import { createConnectionCtx } from '../connection-ctx'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { handleGameContextRoute } from '../../game-context-routes'
import { RoomDirectory } from '../../game/room-directory'

const { newDeps, dispatch } = recordedRouterFixture()

const createActor = (userId = 'solo-owner', deps = newDeps()) => {
  const socket = { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() }
  const ctx = createConnectionCtx(socket as unknown as WebSocket, deps, true, userId)
  return { ctx, socket, deps }
}

const seedWorkshopCard = async (id: string, players = '1+') => {
  const db = getDb()
  await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES('author','author','Author','hash',1) ON CONFLICT DO NOTHING").run()
  const card = { id: `CUSTOM_${id}`, name: `Approved ${id}`, deck: 'CUSTOM', number: 1, desc: ['Probe'], players }
  await db.prepare(`INSERT INTO workshop_cards(id,author_id,card_id,card_type,name,card_json,created_at,updated_at,review_status,live,approved_version_id)
    VALUES (?,'author',?,'minor',?,?,1,1,'approved',1,?)`)
    .run(id, card.id, card.name, JSON.stringify({ ...card, name: 'Unpublished draft' }), `${id}-v1`)
  await db.prepare("INSERT INTO workshop_card_versions(id,card_id,card_json,version_number,created_by,created_at) VALUES(?,?,?,1,'author',1)")
    .run(`${id}-v1`, id, JSON.stringify(card))
  return card
}

describe('formal solo creation', () => {
  it('starts one real seat and commits Step 0 before publishing the new game', async () => {
    const { ctx, socket, deps } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1, name: 'Solo farmer' })

    const room = ctx.currentRoom!
    expect(room.maxPlayers).toBe(1)
    expect(room.status).toBe('playing')
    expect(room.session.state.players).toHaveLength(1)
    expect(room.session.state.players[0]!.name).toBe('Solo farmer')
    expect((await deps.persistence.load(room.id))?.serialized?.state.players).toHaveLength(1)
    expect(await getDb().prepare('SELECT step_no, command_type FROM game_replay_steps WHERE room_id=?').all(room.id))
      .toEqual([{ step_no: 0, command_type: 'initial' }])
    const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    expect(messages.some(message => message.type === 'roomWaiting')).toBe(false)
    expect(messages.find(message => message.type === 'stateUpdate')?.payload.state.players).toHaveLength(1)
    expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome)
      .toMatchObject({ ok: true, roomId: room.id, roomVersion: 0, stepNo: 0 })
  })

  it('persists the accepted creation choices separately from the game snapshot', async () => {
    const { ctx, deps } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1, soloHandMode: 'random', enableParentCards: true, draftParents: false })
    const room = ctx.currentRoom!
    expect(await deps.persistence.loadCreationConfiguration(room.id)).toEqual({
      configuration: {
        kind: 'standard-solo', maxPlayers: 1, soloHandMode: 'random',
        enableCommunityDeck: false, customCardIds: [], officialCardPool: 'default-implemented-A-E',
        enableParentCards: true, draftParents: false,
        enableThroughTheSeasons: false, enableFarmersOfTheMoor: false,
      },
      resolvedWorkshopSources: [],
    })
    const stored = await deps.persistence.load(room.id)
    expect(stored?.meta.soloHandMode).toBe('random')
    expect(stored?.serialized?.frame).not.toHaveProperty('creationConfiguration')
  })

  it('reads a completed configuration only for its original sole player after the active Room is deleted', async () => {
    const { ctx, deps } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1 })
    const room = ctx.currentRoom!
    // A terminal authoritative fixture exercises archiving, not the fourteen-round rules acceptance.
    const final = room.session.loadState({ ...room.session.state, round: 14, gameOver: true })
    expect((await deps.committer.commit(room, final, { commandType: 'test-completion', intentJson: '{}' }, 0)).kind).toBe('committed')
    expect(await deps.persistence.load(room.id)).toBeNull()

    expect(await deps.gameContextStore.readCreationConfiguration(room.id, 'solo-owner'))
      .toMatchObject({ ok: true, configuration: { soloHandMode: 'random', maxPlayers: 1 }, issues: [] })
    expect(await deps.gameContextStore.readCreationConfiguration(room.id))
      .toMatchObject({ ok: false, code: 'login_required' })
    expect(await deps.gameContextStore.readCreationConfiguration(room.id, 'outsider'))
      .toMatchObject({ ok: false, code: 'not_participant' })
    expect(await deps.gameContextStore.resolve(room.id)).not.toHaveProperty('configuration')
  })

  it('creates one new game per stable completed-source command without loading the old Room or Replay', async () => {
    const first = createActor()
    await dispatch(first.ctx, { type: 'createRoom', maxPlayers: 1, soloHandMode: 'random' })
    const source = first.ctx.currentRoom!
    const terminal = source.session.loadState({ ...source.session.state, round: 14, gameOver: true })
    expect((await first.deps.committer.commit(source, terminal, { commandType: 'test-completion', intentJson: '{}' }, 0)).kind).toBe('committed')
    first.deps.registry.delete(source.id)
    source.session.dispose()
    await getDb().prepare('DELETE FROM game_replay_steps WHERE room_id=?').run(source.id)
    const before = await first.deps.gameContextStore.resolve(source.id)

    const next = createActor('solo-owner')
    const scope = await next.deps.commands.issueScope('user:solo-owner')
    const command = { type: 'createRoom' as const, sourceGameContextId: source.id,
      commandContext: { scopeId: scope.scopeId, commandId: randomUUID() } }
    await dispatch(next.ctx, command)
    const destination = next.ctx.currentRoom!
    expect(destination.id).not.toBe(source.id)
    expect(destination.maxPlayers).toBe(1)
    expect(destination.session.state.gameSeed).not.toBe(source.session.state.gameSeed)
    expect(await next.deps.persistence.loadCreationConfiguration(destination.id))
      .toEqual(await next.deps.persistence.loadCreationConfiguration(source.id))
    await dispatch(next.ctx, command)
    expect(next.deps.registry.size()).toBe(1)
    expect(next.ctx.currentRoom!.id).toBe(destination.id)
    expect(await next.deps.gameContextStore.resolve(source.id)).toEqual(before)
    await dispatch(next.ctx, { type: 'createRoom', sourceGameContextId: source.id })
    expect(next.ctx.currentRoom!.id).not.toBe(destination.id)
    expect(next.deps.registry.size()).toBe(2)
  })

  it('serves the original player configuration through a private no-store HTTP response', async () => {
    const { ctx, deps } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1 })
    const room = ctx.currentRoom!
    const terminal = room.session.loadState({ ...room.session.state, round: 14, gameOver: true })
    await deps.committer.commit(room, terminal, { commandType: 'test-completion', intentJson: '{}' }, 0)
    const server = createServer((req, res) => {
      void handleGameContextRoute(req, res, deps.gameContextStore,
        { id: 'solo-owner', username: 'solo-owner', displayName: 'Owner' })
        .then(handled => { if (!handled) { res.writeHead(404); res.end() } })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Test HTTP server did not start')
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/game-contexts/${room.id}/creation-configuration`)
      expect(response.status).toBe(200)
      expect(response.headers.get('cache-control')).toBe('no-store')
      expect(response.headers.get('etag')).toBeNull()
      expect(await response.json()).toMatchObject({ ok: true, configuration: { maxPlayers: 1, soloHandMode: 'random' } })
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('returns the unchanged choices and a missing-card difference instead of creating a subset game', async () => {
    const { ctx, socket } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1, enableCommunityDeck: true, customCardIds: ['missing-card'] })
    expect(ctx.currentRoom === null).toBe(true)
    const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    expect(messages.some(message => message.type === 'roomCreated' || message.type === 'stateUpdate')).toBe(false)
    expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome)
      .toMatchObject({ ok: false, code: 'creation_requires_adjustment', creationAdjustment: {
        configuration: { enableCommunityDeck: true, customCardIds: ['missing-card'] },
        issues: [{ workshopCardId: 'missing-card', reason: 'missing' }],
      } })
    expect(await getDb().prepare('SELECT count(*) AS count FROM rooms').get()).toEqual({ count: 0 })
    expect(await getDb().prepare('SELECT count(*) AS count FROM game_creation_configurations').get()).toEqual({ count: 0 })
    await seedWorkshopCard('valid')
    const disabled = createActor()
    await dispatch(disabled.ctx, { type: 'createRoom', maxPlayers: 1, enableCommunityDeck: false, customCardIds: ['valid'] })
    const disabledMessages = disabled.socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    expect(disabledMessages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome)
      .toMatchObject({ ok: false, creationAdjustment: { configuration: { customCardIds: ['valid'] }, issues: [{ workshopCardId: 'valid', reason: 'not-applicable' }] } })
  })

  it('hides active solo games from both public discovery implementations while preserving their seats', async () => {
    const { ctx, deps } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1 })
    const room = ctx.currentRoom!
    const directory = new RoomDirectory(getDb())
    await directory.register('solo-node', 'http://127.0.0.1:9901', 'test')
    await directory.activate('solo-node')
    const route = await directory.claim(room.id, 'solo-node')
    await getDb().transaction(async () => {
      await directory.markActive(room.id, route.owner)
      await directory.presence(room.id, route.owner, 1, 1)
    })()
    expect((await directory.lobby()).map(summary => summary.id)).toEqual([])
    expect(deps.lobby.getRooms().map(summary => summary.id)).toEqual([])
    expect((await deps.persistence.load(room.id))?.meta.players).toEqual([{ userId: 'solo-owner', playerIndex: 0 }])
  })

  it('requires an authenticated player for a formal solo even when anonymous development sockets are enabled', async () => {
    const { ctx, socket } = createActor()
    ctx.currentUserId = undefined
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1 })
    expect(ctx.currentRoom === null).toBe(true)
    const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome)
      .toMatchObject({ ok: false, code: 'login_required' })
  })

  it('rejects multiplayer draft and development-only switches on formal solo creation', async () => {
    for (const option of [{ hotseat: true }, { enableSnakeOpening: true },
      { allowIncompleteFarmersOfTheMoorMinorDeal: true }, { draftMode: 'simultaneous' as const, draftPoolSize: 9 }]) {
      const { ctx, socket } = createActor()
      await dispatch(ctx, { type: 'createRoom', maxPlayers: 1, ...option })
      expect(ctx.currentRoom === null).toBe(true)
      const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
      expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome.ok).toBe(false)
    }
    expect(await getDb().prepare('SELECT count(*) AS count FROM rooms').get()).toEqual({ count: 0 })
  })

  it('keeps an active formal solo intact when the legacy newGame command is sent', async () => {
    const { ctx, deps, socket } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1 })
    const sourceId = ctx.currentRoom!.id
    socket.send.mockClear()
    await dispatch(ctx, { type: 'newGame' })
    expect(ctx.currentRoom!.id).toBe(sourceId)
    expect(deps.registry.size()).toBe(1)
    const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome.ok).toBe(false)
  })

  it('resolves the current approved Workshop version for rematch and ignores unpublished drafts', async () => {
    const card = await seedWorkshopCard('selected')
    const { ctx, deps } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1, enableCommunityDeck: true, customCardIds: ['selected'] })
    const source = ctx.currentRoom!
    expect(source.customCards?.[0]?.cardJson.name).toBe('Approved selected')
    expect((await deps.persistence.loadCreationConfiguration(source.id))?.resolvedWorkshopSources)
      .toEqual([{ workshopCardId: 'selected', logicalCardId: card.id, approvedVersionId: 'selected-v1' }])
    const terminal = source.session.loadState({ ...source.session.state, round: 14, gameOver: true })
    await deps.committer.commit(source, terminal, { commandType: 'test-completion', intentJson: '{}' }, 0)
    await getDb().prepare("INSERT INTO workshop_card_versions(id,card_id,card_json,version_number,created_by,created_at) VALUES('selected-v2','selected',?,2,'author',2)")
      .run(JSON.stringify({ ...card, name: 'New approved card' }))
    await getDb().prepare("UPDATE workshop_cards SET approved_version_id='selected-v2',card_json=? WHERE id='selected'")
      .run(JSON.stringify({ ...card, name: 'Still unpublished draft' }))
    await dispatch(ctx, { type: 'createRoom', sourceGameContextId: source.id })
    expect(ctx.currentRoom!.customCards?.[0]?.cardJson.name).toBe('New approved card')
    expect((await deps.persistence.loadCreationConfiguration(ctx.currentRoom!.id))?.resolvedWorkshopSources[0]?.approvedVersionId).toBe('selected-v2')
    expect((await deps.persistence.loadCreationConfiguration(source.id))?.resolvedWorkshopSources[0]?.approvedVersionId).toBe('selected-v1')
  })

  it('keeps every unavailable explicit source for adjustment instead of accepting the remaining subset', async () => {
    await seedWorkshopCard('valid')
    await seedWorkshopCard('off')
    await seedWorkshopCard('other-count', '2+')
    await seedWorkshopCard('takeover')
    await seedWorkshopCard('broken')
    await getDb().prepare("UPDATE workshop_cards SET live=0 WHERE id='off'").run()
    await getDb().prepare("UPDATE workshop_cards SET review_status='merged',built_in=1 WHERE id='takeover'").run()
    await getDb().prepare("UPDATE workshop_card_versions SET card_json='{' WHERE id='broken-v1'").run()
    const { ctx, socket } = createActor()
    const selected = ['valid', 'off', 'other-count', 'takeover', 'broken', 'missing']
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1, enableCommunityDeck: true, customCardIds: selected })
    const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    const outcome = messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome
    expect(ctx.currentRoom === null).toBe(true)
    expect(outcome.creationAdjustment.configuration.customCardIds).toEqual([...selected].sort())
    expect(outcome.creationAdjustment.issues.map(({ workshopCardId, reason }: { workshopCardId: string; reason: string }) => [workshopCardId, reason]))
      .toEqual([['broken', 'load-failed'], ['missing', 'missing'], ['off', 'not-live'], ['other-count', 'not-applicable'], ['takeover', 'community-takeover']])
    expect(await getDb().prepare('SELECT count(*) AS count FROM game_creation_configurations').get()).toEqual({ count: 0 })
  })

  it('rolls back Room, Step 0, configuration and receipt together and retries the captured initialization', async () => {
    const { ctx, deps, socket } = createActor()
    const writes = vi.spyOn(deps.persistence, 'commitReplay')
    await getDb().exec(`CREATE FUNCTION reject_creation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test storage unavailable'; END $$;
      CREATE TRIGGER reject_creation BEFORE INSERT ON game_creation_configurations FOR EACH ROW EXECUTE FUNCTION reject_creation()`)
    const pending = dispatch(ctx, { type: 'createRoom', maxPlayers: 1 })
    await vi.waitFor(() => expect(socket.send.mock.calls.some(([raw]: [string]) => JSON.parse(raw).type === 'roomPersistencePaused')).toBe(true), { timeout: 3000 })
    expect(ctx.currentRoom === null).toBe(true)
    for (const table of ['rooms', 'game_replay_steps', 'game_creation_configurations']) {
      expect(await getDb().prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 0 })
    }
    expect(socket.send.mock.calls.some(([raw]: [string]) => ['roomCreated', 'stateUpdate'].includes(JSON.parse(raw).type))).toBe(false)
    await getDb().exec('DROP TRIGGER reject_creation ON game_creation_configurations')
    await pending
    expect(ctx.currentRoom!.maxPlayers).toBe(1)
    expect(writes.mock.calls.length).toBeGreaterThan(1)
    expect(new Set(writes.mock.calls.map(([commit]) => commit.roomId)).size).toBe(1)
    expect(new Set(writes.mock.calls.map(([commit]) => commit.serialized.state.gameSeed)).size).toBe(1)
    for (const table of ['rooms', 'game_replay_steps', 'game_creation_configurations']) {
      expect(await getDb().prepare(`SELECT count(*) AS count FROM ${table}`).get()).toEqual({ count: 1 })
    }
    const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    expect(messages.filter(message => message.type === 'roomCreated')).toHaveLength(1)
    expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome.ok).toBe(true)
  })

  it('rechecks source removal in the initial transaction without replacing the previous connection room', async () => {
    const { ctx, deps, socket } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1 })
    const source = ctx.currentRoom!
    const terminal = source.session.loadState({ ...source.session.state, round: 14, gameOver: true })
    await deps.committer.commit(source, terminal, { commandType: 'test-completion', intentJson: '{}' }, 0)
    const commit = deps.persistence.commitReplay.bind(deps.persistence)
    vi.spyOn(deps.persistence, 'commitReplay').mockImplementationOnce(async input => {
      await getDb().prepare("UPDATE game_contexts SET lifecycle='removed' WHERE room_id=?").run(source.id)
      return commit(input)
    })
    socket.send.mockClear()
    await dispatch(ctx, { type: 'createRoom', sourceGameContextId: source.id })
    expect(ctx.currentRoom!.id).toBe(source.id)
    expect(await getDb().prepare('SELECT count(*) AS count FROM rooms').get()).toEqual({ count: 0 })
    expect(await getDb().prepare('SELECT count(*) AS count FROM game_creation_configurations').get()).toEqual({ count: 1 })
    const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    expect(messages.some(message => ['roomCreated', 'stateUpdate'].includes(message.type))).toBe(false)
    expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome.code).toBe('source_removed')
  })

  it('stops a selected source withdrawn after preflight instead of committing it with the first frame', async () => {
    await seedWorkshopCard('withdrawn')
    const { ctx, deps, socket } = createActor()
    const commit = deps.persistence.commitReplay.bind(deps.persistence)
    vi.spyOn(deps.persistence, 'commitReplay').mockImplementationOnce(async input => {
      await getDb().prepare("UPDATE workshop_cards SET live=0 WHERE id='withdrawn'").run()
      return commit(input)
    })
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1, enableCommunityDeck: true, customCardIds: ['withdrawn'] })
    expect(ctx.currentRoom === null).toBe(true)
    expect(await getDb().prepare('SELECT count(*) AS count FROM rooms').get()).toEqual({ count: 0 })
    const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome)
      .toMatchObject({ ok: false, code: 'creation_requires_adjustment', creationAdjustment: {
        configuration: { customCardIds: ['withdrawn'] }, issues: [{ workshopCardId: 'withdrawn', reason: 'not-live' }],
      } })
  })

  it('finishes a pending creation with a typed rejection when its completed source is removed during storage retry', async () => {
    const { ctx, deps, socket } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1 })
    const source = ctx.currentRoom!
    const terminal = source.session.loadState({ ...source.session.state, round: 14, gameOver: true })
    await deps.committer.commit(source, terminal, { commandType: 'test-completion', intentJson: '{}' }, 0)
    await getDb().exec(`CREATE FUNCTION reject_creation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test storage unavailable'; END $$;
      CREATE TRIGGER reject_creation BEFORE INSERT ON game_creation_configurations FOR EACH ROW EXECUTE FUNCTION reject_creation()`)
    socket.send.mockClear()
    const pending = dispatch(ctx, { type: 'createRoom', sourceGameContextId: source.id })
    await vi.waitFor(() => expect(socket.send.mock.calls.some(([raw]: [string]) => JSON.parse(raw).type === 'roomPersistencePaused')).toBe(true), { timeout: 3000 })
    await getDb().prepare("UPDATE game_contexts SET lifecycle='removed' WHERE room_id=?").run(source.id)
    await getDb().exec('DROP TRIGGER reject_creation ON game_creation_configurations')
    await pending
    expect(ctx.currentRoom!.id).toBe(source.id)
    expect(await getDb().prepare('SELECT count(*) AS count FROM rooms').get()).toEqual({ count: 0 })
    const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    expect(messages.some(message => ['roomCreated', 'stateUpdate'].includes(message.type))).toBe(false)
    expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome.code).toBe('source_removed')
  })

  it('rejects active, foreign, multiplayer, removed, expired and unconfigured completed sources at the create boundary', async () => {
    const { ctx, deps } = createActor()
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1 })
    const source = ctx.currentRoom!
    const reject = async (code: string, actor = 'solo-owner') => {
      const next = createActor(actor)
      await dispatch(next.ctx, { type: 'createRoom', sourceGameContextId: source.id })
      expect(next.ctx.currentRoom === null).toBe(true)
      const messages = next.socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
      expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome.code).toBe(code)
    }
    await reject('source_not_completed')
    const terminal = source.session.loadState({ ...source.session.state, round: 14, gameOver: true })
    await deps.committer.commit(source, terminal, { commandType: 'test-completion', intentJson: '{}' }, 0)
    await reject('not_participant', 'outsider')
    await getDb().prepare('UPDATE game_results SET player_count=2 WHERE room_id=?').run(source.id)
    await reject('source_not_solo')
    await getDb().prepare('UPDATE game_results SET player_count=1 WHERE room_id=?').run(source.id)
    await getDb().prepare("UPDATE game_contexts SET lifecycle='removed' WHERE room_id=?").run(source.id)
    await reject('source_removed')
    await getDb().prepare("UPDATE game_contexts SET lifecycle='expired' WHERE room_id=?").run(source.id)
    await reject('source_not_completed')
    await getDb().prepare("UPDATE game_contexts SET lifecycle='completed' WHERE room_id=?").run(source.id)
    await getDb().prepare('DELETE FROM game_creation_configurations WHERE room_id=?').run(source.id)
    await reject('creation_configuration_unavailable')
    expect(await getDb().prepare('SELECT count(*) AS count FROM rooms').get()).toEqual({ count: 0 })
  })

  it('recovers a durably committed initialization after its database acknowledgement is lost even if a card is subsequently unpublished', async () => {
    await seedWorkshopCard('later-offline')
    const { ctx, deps, socket } = createActor()
    const commit = deps.persistence.commitReplay.bind(deps.persistence)
    vi.spyOn(deps.persistence, 'commitReplay').mockImplementationOnce(async input => {
      await commit(input)
      await getDb().prepare("UPDATE workshop_cards SET live=0 WHERE id='later-offline'").run()
      throw new Error('Database acknowledgement lost after commit')
    })
    await dispatch(ctx, { type: 'createRoom', maxPlayers: 1, enableCommunityDeck: true, customCardIds: ['later-offline'] })
    expect(ctx.currentRoom !== null).toBe(true)
    expect(await getDb().prepare('SELECT count(*) AS count FROM rooms').get()).toEqual({ count: 1 })
    expect(await getDb().prepare('SELECT count(*) AS count FROM game_replay_steps').get()).toEqual({ count: 1 })
    const messages = socket.send.mock.calls.map(([raw]: [string]) => JSON.parse(raw))
    expect(messages.filter(message => message.type === 'roomCreated')).toHaveLength(1)
    expect(messages.find(message => message.type === 'commandReceipt' && message.status === 'completed')?.receipt.outcome.ok).toBe(true)
  })

  it('keeps the committed authoritative session alive when creation publication fails after adoption', async () => {
    const { ctx, deps } = createActor()
    const disposal = vi.fn()
    vi.spyOn(deps.broadcaster, 'sendRoomEvent').mockImplementationOnce(async (_socket, room) => {
      vi.spyOn(room.session, 'dispose').mockImplementation(disposal)
      throw new Error('Publication transport failed')
    })
    await expect(dispatch(ctx, { type: 'createRoom', maxPlayers: 1 })).rejects.toThrow('Publication transport failed')
    expect((await deps.persistence.load(ctx.currentRoom!.id))?.meta.maxPlayers).toBe(1)
    expect(deps.registry.get(ctx.currentRoom!.id)).toBe(ctx.currentRoom)
    expect(disposal).not.toHaveBeenCalled()
  })
})
