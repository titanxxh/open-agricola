import './_helpers/opening-seat-random'
import { createWorkSession } from './_helpers/session-fixtures'
import type { PostgresDatabase } from '../database/postgres'
import { createTestDatabase } from './_helpers/postgres'
import { PostgresRoomPersistence } from '../game/persistence/postgres-adapter'
import { RoomCommitter } from '../game/room-committer'
import { CommandStore } from '../game/command-store'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as database from '../db.ts'
import * as rng from '../../shared/utils/rng'
import { validateAndCompileCustomCode } from '../custom-code/engine.ts'
import {
  approveCurrentDraft,
  createCard,
  publish,
} from '../workshop-drafts.ts'
import { RoomRegistry } from '../game/room-registry.ts'
import { createRoomPersistenceCheckpoint } from '../game/room-persistence-checkpoint.ts'
import { Broadcaster } from '../connection/broadcaster.ts'
import { createLobby } from '../game/lobby.ts'
import { createConnectionCtx } from '../connection/connection-ctx.ts'
import { dispatch } from '../connection/room-router.ts'

const SOURCE = `
const CARD_ID = 'CUSTOM_RouteRunaway'
const CARD_DEF = MinorImprovement({
  id: CARD_ID,
  name: 'Route Runaway',
  deck: 'CUSTOM',
  number: 0,
  desc: [],
  cost: {},
  vp: 0,
  implemented: true,
})
const CARD_IMPL = {
  listeners: [{
    actions: ['collect'],
    phases: ['after'],
    handler: () => { while (true) {} },
  }],
}
`

const fakeWs = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() })

type MockRes = ServerResponse & { statusCode: number; body: string }

const mockReq = (
  method: string,
  url: string,
  body: unknown,
  token?: string,
): IncomingMessage => {
  const bodyText = JSON.stringify(body)
  const request = {
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    on(event: string, callback: (chunk?: Buffer) => void) {
      if (event === 'data') callback(Buffer.from(bodyText))
      if (event === 'end') callback()
      return request
    },
  }
  return request as unknown as IncomingMessage
}

const mockRes = (): MockRes => {
  let statusCode = 200
  let body = ''
  return {
    get statusCode() { return statusCode },
    set statusCode(value) { statusCode = value },
    get body() { return body },
    writeHead(code: number) { statusCode = code },
    end(data?: string) { body = data ?? '' },
  } as unknown as MockRes
}

const createRunawayCard = (db: PostgresDatabase, authorId: string, manifestPhase = 'after', manifestAction = 'collect') => {
  const compiled = validateAndCompileCustomCode(SOURCE, 'CUSTOM_RouteRunaway')
  expect(compiled.valid).toBe(true)
  if (!compiled.valid) throw new Error(compiled.errors.join('; '))
  return createCard(db, {
    authorId,
    draft: {
      cardId: 'CUSTOM_RouteRunaway',
      cardType: 'minor',
      name: 'Route Runaway',
      description: '',
      cardJson: {
        id: 'CUSTOM_RouteRunaway',
        name: 'Route Runaway',
        card_type: 'minor',
        deck: 'CUSTOM',
        number: 0,
        desc: [],
        cost: {},
        vp: 0,
        implemented: true,
      },
      effectCode: SOURCE,
      compiledCode: compiled.compiledCode,
      codeManifest: {
        ...compiled.manifest,
        listeners: compiled.manifest.listeners.map(listener => ({ ...listener, actions: [manifestAction], phases: [manifestPhase] })),
        cardDefinition: compiled.cardDefinition,
      },
      artUrl: null,
      generation: {},
    },
  })
}

// HTTP debug games load only reviewed live cards; the HTTP sandbox loads none (ADR 0052).
const createLiveRunawayCard = async (db: PostgresDatabase, authorId: string) => {
  const card = await createRunawayCard(db, authorId)
  await approveCurrentDraft(db, { cardId: card.id, authorId })
  await publish(db, { cardId: card.id, authorId, baseRevision: card.revision })
  return card
}

const addUser = async (db: PostgresDatabase, id: string, token: string) => {
  const now = Date.now()
  await db.prepare(`
    INSERT INTO users (id, username, display_name, password_hash, created_at)
    VALUES (?, ?, ?, 'x', ?)
  `).run(id, id, id, now)
  await db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at, auth_policy_version) VALUES (?, ?, ?, ?, 2)
  `).run(token, id, now + 3_600_000, now)
}

const databases: PostgresDatabase[] = []
afterEach(async () => {
  for (const db of databases.splice(0)) await db.close()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('custom session routes', () => {
  it('serves a read-only sandbox fence quote for its current pending actor', async () => {
    const db = await createTestDatabase()
    databases.push(db)
    await addUser(db, 'fence-author', 'fence-token')
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    const { handleGameRoute, disposeSandboxSessionsForUser } = await import('../game-router')
    const prepared = createWorkSession({ configure: state => {
      state.round = 14
      state.actionSpaces.find(space => space.id === 'fencing')!.roundAvailable = 1
      state.players[0]!.resources.wood = 10
    } })
    try {
      const load = mockRes()
      await handleGameRoute(mockReq('POST', '/api/game/load', { state: prepared.state }, 'fence-token'), load)
      expect(load.statusCode).toBe(200)
      const select = mockRes()
      await handleGameRoute(mockReq('POST', '/api/game/action', { playerIndex: 0, spaceId: 'fencing' }, 'fence-token'), select)
      const pending = JSON.parse(select.body)
      expect(pending.ok).toBe(true)
      const requestKey = pending.interaction.requestKey
      const payload = { edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'] }
      const quote = mockRes()
      await handleGameRoute(mockReq('POST', '/api/game/fence-quote', { playerIndex: 0, requestKey, payload }, 'fence-token'), quote)
      expect(quote.statusCode).toBe(200)
      expect(JSON.parse(quote.body)).toEqual({ requestKey, woodCost: 4, affordable: true, valid: true, error: null })
      const after = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'fence-token'), after)
      expect(JSON.parse(after.body)).toEqual(pending)
      const wrong = mockRes()
      await handleGameRoute(mockReq('POST', '/api/game/fence-quote', { playerIndex: 1, requestKey, payload }, 'fence-token'), wrong)
      expect(wrong.statusCode).toBe(400)
    } finally { prepared.dispose(); disposeSandboxSessionsForUser('fence-author') }
  })

  it.each(['/api/game/new'].flatMap(url =>
    [false, true].flatMap(guarded => ['phase', 'target'].map(invalid => ({ url, guarded, invalid }))),
  ))('rejects unsupported saved $invalid in $url (authority=$guarded) without replacing the game', async ({ url, guarded, invalid }) => {
    const db = await createTestDatabase()
    databases.push(db)
    await addUser(db, 'phase-author', 'phase-token')
    // Simulate a retained executable snapshot; new source cannot compile this phase.
    const customCard = await createRunawayCard(db, 'phase-author', invalid === 'phase' ? 'during' : 'after', invalid === 'phase' ? 'collect' : 'special-effect')
    await approveCurrentDraft(db, { cardId: customCard.id, authorId: 'phase-author' })
    await publish(db, { cardId: customCard.id, authorId: 'phase-author', baseRevision: customCard.revision })
    const gameDatabase = await import('../db.ts')
    vi.spyOn(gameDatabase, 'getDb').mockReturnValue(db)
    const { handleGameRoute, configureSandboxAuthority, shutdownSandboxSessions } = await import('../game-router.ts')
    if (guarded) {
      const { RoomDirectory } = await import('../game/room-directory.ts')
      const { SandboxAuthority } = await import('../game/sandbox-authority.ts')
      const directory = new RoomDirectory(db)
      await directory.register('phase-test-node', 'http://127.0.0.1:7100', 'test')
      await directory.activate('phase-test-node')
      configureSandboxAuthority(new SandboxAuthority(directory, 'phase-test-node'))
    }
    const { workerObservation } = await import('../game/custom-session-executor.ts')
    try {
      const start = mockRes()
      await handleGameRoute(mockReq('POST', '/api/game/new', { seed: 42, playerCount: 2 }, 'phase-token'), start)
      expect(start.statusCode).toBe(200)
      const workersBefore = workerObservation()

      const rejected = mockRes()
      expect(await handleGameRoute(mockReq('POST', url, {
        seed: 99, playerCount: 2, enableCommunityDeck: true, customCardIds: [customCard.id],
      }, 'phase-token'), rejected)).toBe(true)
      expect(rejected.statusCode).toBe(400)
      expect(JSON.parse(rejected.body)).toMatchObject({
        ok: false,
        code: invalid === 'phase' ? 'unsupported_listener_phase' : 'unsupported_listener_subscription',
        error: expect.stringContaining(invalid === 'phase' ? "unsupported listener phase 'during'" : "unsupported action target 'special-effect'"),
      })
      expect(workerObservation()).toEqual(workersBefore)
      const current = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'phase-token'), current)
      expect(JSON.parse(current.body).state).toEqual(JSON.parse(start.body).state)
    } finally {
      shutdownSandboxSessions()
    }
  })

  it('runs POST /api/game/new commands off the HTTP event loop', async () => {
    const db = await createTestDatabase()
    databases.push(db)
    await addUser(db, 'author', 'sandbox-token')
    const customCard = await createLiveRunawayCard(db, 'author')
    const gameDatabase = await import('../db.ts')
    vi.spyOn(gameDatabase, 'getDb').mockReturnValue(db)
    const { handleGameRoute, disposeSandboxSessionsUsingCard } = await import('../game-router.ts')
    const start = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/new', {
      seed: 42, playerCount: 2,
      enableCommunityDeck: true, customCardIds: [customCard.id],
    }, 'sandbox-token'), start)
    expect(start.statusCode).toBe(200)
    // A listener only reacts while its card is in play.
    const played = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/dev/play-card', {
      playerIndex: 0,
      cardId: 'CUSTOM_RouteRunaway',
    }, 'sandbox-token'), played)
    expect(played.statusCode).toBe(200)

    const action = mockRes()
    const command = handleGameRoute(mockReq('POST', '/api/game/action', {
      playerIndex: 0,
      spaceId: 'forest',
    }, 'sandbox-token'), action)
    const timer = new Promise<'timer'>((resolve) => setTimeout(() => resolve('timer'), 0))

    expect(await Promise.race([timer, command.then(() => 'command' as const)])).toBe('timer')
    await command
    const payload = JSON.parse(action.body)
    expect(action.statusCode).toBe(400)
    expect(payload.error).toMatch(/timed out/i)
    expect(payload.state.actionSpaces.find((space: { id: string }) => space.id === 'forest').takenBy).toEqual([])
    expect(payload.cardWarnings).toEqual([expect.stringMatching(/timed out/i)])

    const state = mockRes()
    await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'sandbox-token'), state)
    expect(JSON.parse(state.body).cardWarnings).toEqual([expect.stringMatching(/timed out/i)])
    disposeSandboxSessionsUsingCard(customCard.id)

  }, 20_000)

  it('keeps the existing game when executable worker capacity is exhausted', async () => {
    const db = await createTestDatabase()
    databases.push(db)
    await addUser(db, 'capacity-author', 'capacity-token')
    const customCard = await createLiveRunawayCard(db, 'capacity-author')
    const gameDatabase = await import('../db.ts')
    vi.spyOn(gameDatabase, 'getDb').mockReturnValue(db)
    const { GameSession } = await import('../game/authoritative-session.ts')
    const { CustomSessionExecutor } = await import('../game/custom-session-executor.ts')
    const slots = Array.from(
      { length: 14 },
      () => new CustomSessionExecutor(new GameSession(42), []),
    )
    slots.forEach((executor) => expect(executor.reserveWorkerSlot()).toBe(true))
    const { handleGameRoute, disposeSandboxSessionsUsingCard } = await import('../game-router.ts')

    try {
      const start = mockRes()
      await handleGameRoute(mockReq('POST', '/api/game/new', {
        seed: 42, playerCount: 2,
        enableCommunityDeck: true, customCardIds: [customCard.id],
      }, 'capacity-token'), start)
      expect(start.statusCode).toBe(200)

      const rejected = mockRes()
      await handleGameRoute(mockReq('POST', '/api/game/new', {
        seed: 99, playerCount: 2,
        enableCommunityDeck: true, customCardIds: [customCard.id],
      }, 'capacity-token'), rejected)
      expect(rejected.statusCode).toBe(503)
      expect(JSON.parse(rejected.body).error).toMatch(/capacity/i)

      const current = mockRes()
      await handleGameRoute(mockReq('GET', '/api/game/state', {}, 'capacity-token'), current)
      expect(JSON.parse(current.body).state.gameSeed).toBe(42)
      expect(JSON.parse(current.body).state).toEqual(JSON.parse(start.body).state)
    } finally {
      disposeSandboxSessionsUsingCard(customCard.id)
      slots.forEach((executor) => {
        executor.dispose()
        executor.session.dispose()
      })

    }
  })

  it('runs community-room commands through the WebSocket session worker', async () => {
    const resolveSeed = rng.resolveSeed
    vi.spyOn(rng, 'resolveSeed').mockImplementation((seed) => resolveSeed(seed ?? 42))
    const db = await createTestDatabase()
    databases.push(db)
    await addUser(db, 'host', 'host-token')
    await addUser(db, 'guest', 'guest-token')
    const customCard = await createRunawayCard(db, 'host')
    await approveCurrentDraft(db, { cardId: customCard.id, authorId: 'host' })
    await publish(db, { cardId: customCard.id, authorId: 'host', baseRevision: customCard.revision })
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    const persistence = new PostgresRoomPersistence(db)
    const committer = new RoomCommitter({ persistence, viewerBuildId: 'test-viewer', gameBuildId: 'test', viewerBuildExists: () => true })
    const commands = new CommandStore(db)
    const scope = await commands.issueScope('user:host')
    const registry = new RoomRegistry()
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const broadcaster = new Broadcaster()
    const lobby = createLobby({ registry, checkpoint, broadcaster })
    const deps = { registry, checkpoint, broadcaster, lobby, committer, commands }
    const hostWs = fakeWs()
    const guestWs = fakeWs()
    const host = createConnectionCtx(hostWs as never, deps, true, 'host')
    const guest = createConnectionCtx(guestWs as never, deps, true, 'guest')

    await dispatch(host, {
      type: 'createRoom',
      commandContext: { scopeId: scope.scopeId, commandId: randomUUID() },
      maxPlayers: 2,
      name: 'Host',
      enableCommunityDeck: true,
      customCardIds: [customCard.id],
    })
    expect(host.currentRoom?.customSessionExecutor).toBeDefined()
    await dispatch(guest, {
      type: 'joinRoom',
      roomId: host.currentRoom!.id,
      name: 'Guest',
    })
    const guestScope = await commands.issueScope('user:guest')
    await dispatch(guest, { type: 'confirmPlayerColor', commandContext: {
      scopeId: guestScope.scopeId, commandId: randomUUID(), roomId: host.currentRoom!.id, expectedVersion: 0,
    } })
    // A listener only reacts while its card is in play.
    expect((await host.currentRoom!.customSessionExecutor!.execute('devPlayCard', [0, 'CUSTOM_RouteRunaway'])).ok).toBe(true)
    hostWs.send.mockClear()
    const command = dispatch(host, {
      type: 'action',
      spaceId: 'forest',
      requestId: 'runaway',
      commandContext: { scopeId: scope.scopeId, commandId: randomUUID(), roomId: host.currentRoom!.id, expectedVersion: host.currentRoom!.version },
    })
    const timer = new Promise<'timer'>((resolve) => setTimeout(() => resolve('timer'), 0))

    expect(command).toBeInstanceOf(Promise)
    expect(await Promise.race([timer, command!.then(() => 'command' as const)])).toBe('timer')
    await command
    const stateUpdate = hostWs.send.mock.calls
      .map(([raw]) => JSON.parse(raw as string))
      .find((message) => message.type === 'stateUpdate')
    expect(stateUpdate.requestId).toBe('runaway')
    expect(stateUpdate.payload.ok).toBe(false)
    expect(stateUpdate.payload.error).toMatch(/timed out/i)
    expect(stateUpdate.payload.state.actionSpaces.find((space: { id: string }) => space.id === 'forest').takenBy)
      .toEqual([])
    registry.delete(host.currentRoom!.id)
    checkpoint.shutdown()
    committer.shutdown()

  }, 20_000)
})
