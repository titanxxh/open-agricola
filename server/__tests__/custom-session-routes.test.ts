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

})
