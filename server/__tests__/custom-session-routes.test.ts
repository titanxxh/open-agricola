import Database from 'better-sqlite3'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as database from '../db.ts'
import { validateAndCompileCustomCode } from '../custom-code/engine.ts'
import {
  approveCurrentDraft,
  createCard,
  publish,
} from '../workshop-drafts.ts'
import { RoomRegistry } from '../game/room-registry.ts'
import { InMemoryRoomPersistence } from '../game/persistence/memory-adapter.ts'
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

const createRunawayCard = (db: Database.Database, authorId: string) => {
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
        cardDefinition: compiled.cardDefinition,
      },
      artUrl: null,
      generation: {},
    },
  })
}

const addUser = (db: Database.Database, id: string, token: string) => {
  const now = Date.now()
  db.prepare(`
    INSERT INTO users (id, username, display_name, password_hash, created_at)
    VALUES (?, ?, ?, 'x', ?)
  `).run(id, id, id, now)
  db.prepare(`
    INSERT INTO sessions (token, user_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).run(token, id, now + 3_600_000, now)
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('custom session routes', () => {
  it('runs POST /api/game/new-sandbox commands off the HTTP event loop', async () => {
    const db = new Database(':memory:')
    database.runMigrations(db)
    addUser(db, 'author', 'sandbox-token')
    const customCard = createRunawayCard(db, 'author')
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    const { handleGameRoute, disposeSandboxSessionsUsingCard } = await import('../game-router.ts')
    const start = mockRes()
    await handleGameRoute(mockReq('POST', '/api/game/new-sandbox', {
      seed: 42,
      customCardIds: [customCard.id],
    }, 'sandbox-token'), start)
    expect(start.statusCode).toBe(200)

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
    disposeSandboxSessionsUsingCard(customCard.id)
    db.close()
  })

  it('runs community-room commands through the WebSocket session worker', async () => {
    const db = new Database(':memory:')
    database.runMigrations(db)
    addUser(db, 'host', 'host-token')
    addUser(db, 'guest', 'guest-token')
    const customCard = createRunawayCard(db, 'host')
    approveCurrentDraft(db, { cardId: customCard.id, authorId: 'host' })
    publish(db, { cardId: customCard.id, authorId: 'host', baseRevision: customCard.revision })
    vi.spyOn(database, 'getDb').mockReturnValue(db)
    const persistence = new InMemoryRoomPersistence()
    const registry = new RoomRegistry()
    const checkpoint = createRoomPersistenceCheckpoint({ persistence })
    const broadcaster = new Broadcaster({ checkpoint })
    const lobby = createLobby({ registry, checkpoint, broadcaster })
    const deps = { registry, checkpoint, broadcaster, lobby }
    const hostWs = fakeWs()
    const guestWs = fakeWs()
    const host = createConnectionCtx(hostWs as never, deps, true, 'host')
    const guest = createConnectionCtx(guestWs as never, deps, true, 'guest')

    await dispatch(host, {
      type: 'createRoom',
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
    hostWs.send.mockClear()
    const command = dispatch(host, {
      type: 'action',
      spaceId: 'forest',
      requestId: 'runaway',
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
    expect(stateUpdate.payload.state.actionSpaces.find((space: { id: string }) => space.id === 'forest').takenBy)
      .toEqual([])
    registry.delete(host.currentRoom!.id)
    checkpoint.shutdown()
    db.close()
  })
})
