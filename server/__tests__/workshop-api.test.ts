/**
 * Workshop API integration tests.
 * Tests card CRUD, like toggle, and comment operations
 * by calling the handler functions with mock req/res objects.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import Database from 'better-sqlite3'

// ── Mock DB ──────────────────────────────────────────────────────────────────

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    display_name TEXT NOT NULL, password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL, last_login_at INTEGER
  );
  CREATE TABLE sessions (
    token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE workshop_cards (
    id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id),
    card_id TEXT NOT NULL, card_type TEXT NOT NULL, name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', card_json TEXT NOT NULL,
    effect_dsl TEXT, effect_code TEXT, compiled_code TEXT,
    art_url TEXT, art_prompt TEXT, status TEXT NOT NULL DEFAULT 'draft',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX idx_workshop_card_id_published
    ON workshop_cards(card_id) WHERE status = 'published';
  CREATE TABLE card_likes (
    user_id TEXT NOT NULL REFERENCES users(id),
    card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL, PRIMARY KEY (user_id, card_id)
  );
  CREATE TABLE card_comments (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE sandbox_cards (
    user_id TEXT NOT NULL REFERENCES users(id),
    workshop_card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
    added_at INTEGER NOT NULL, PRIMARY KEY (user_id, workshop_card_id)
  );
`)

vi.mock('../db.ts', () => ({ getDb: () => db, cleanExpiredSessions: () => {} }))

// Seed user and session
const NOW = Date.now()
db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('u1', 'alice', 'Alice', 'hash', NOW, null)
db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('tok-alice', 'u1', NOW + 86400000, NOW)
db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?)').run('u2', 'bob', 'Bob', 'hash', NOW, null)
db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('tok-bob', 'u2', NOW + 86400000, NOW)

vi.mock('../auth.ts', async () => {
  const actual = await vi.importActual('../auth.ts') as Record<string, unknown>
  return {
    ...actual,
    validateSession: (token: string) => {
      const row = db.prepare('SELECT u.id, u.username, u.display_name FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?').get(token, Date.now()) as { id: string; username: string; display_name: string } | undefined
      if (!row) return null
      return { id: row.id, username: row.username, displayName: row.display_name }
    },
    extractToken: (h: string | undefined) => {
      if (!h) return ''
      const m = /^Bearer\s+(.+)$/i.exec(h)
      return m ? m[1] : ''
    },
  }
})

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function mockReq(method: string, url: string, body: unknown = null, token?: string): IncomingMessage {
  const bodyStr = body ? JSON.stringify(body) : ''
  let dataEmitted = false
  const req = {
    method,
    url,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}) },
    on(event: string, cb: (chunk?: Buffer) => void) {
      if (event === 'data' && bodyStr && !dataEmitted) {
        dataEmitted = true
        cb(Buffer.from(bodyStr))
      }
      if (event === 'end') cb()
      return req
    },
  } as unknown as IncomingMessage
  return req
}

function mockRes(): ServerResponse & { statusCode: number; body: string } {
  let statusCode = 200
  let body = ''
  const headers: Record<string, string> = {}
  return {
    get statusCode() { return statusCode },
    set statusCode(v) { statusCode = v },
    get body() { return body },
    writeHead(code: number, h?: Record<string, string>) {
      statusCode = code
      Object.assign(headers, h ?? {})
    },
    end(data?: string) { body = data ?? '' },
    getHeader: (k: string) => headers[k],
  } as unknown as ServerResponse & { statusCode: number; body: string }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Imported lazily after mocks are set up
let handleWorkshopRoute: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>

beforeAll(async () => {
  const mod = await import('../workshop.ts')
  handleWorkshopRoute = mod.handleWorkshopRoute
})

describe('workshop API', () => {
  describe('POST /api/workshop/cards (create)', () => {
    it('creates a draft card', async () => {
      const req = mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_TestCard',
        card_type: 'minor',
        name: 'Test Card',
        description: 'A test card',
        card_json: { id: 'CUSTOM_TestCard', name: 'Test Card', deck: 'CUSTOM', number: 0, desc: [] },
      }, 'tok-alice')
      const res = mockRes()
      const handled = await handleWorkshopRoute(req, res)
      expect(handled).toBe(true)
      const d = JSON.parse(res.body)
      expect(d.ok).toBe(true)
      expect(d.id).toBeTruthy()
    })

    it('rejects card_id without CUSTOM_ prefix', async () => {
      const req = mockReq('POST', '/api/workshop/cards', {
        card_id: 'BadCard',
        card_type: 'minor',
        name: 'Bad',
        card_json: { id: 'BadCard' },
      }, 'tok-alice')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      expect(res.statusCode).toBe(400)
    })

    it('requires auth', async () => {
      const req = mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_X', card_type: 'minor', name: 'X', card_json: {},
      })
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      expect(res.statusCode).toBe(401)
    })

    it('prevents duplicate published card_id', async () => {
      // First publish
      const req1 = mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_UniqueCard',
        card_type: 'minor', name: 'Unique', card_json: { id: 'CUSTOM_UniqueCard', name: 'Unique', deck: 'CUSTOM', number: 0, desc: [] },
        status: 'published',
      }, 'tok-alice')
      const res1 = mockRes()
      await handleWorkshopRoute(req1, res1)
      expect(JSON.parse(res1.body).ok).toBe(true)

      // Second publish with same card_id → 409
      const req2 = mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_UniqueCard',
        card_type: 'minor', name: 'Unique2', card_json: { id: 'CUSTOM_UniqueCard', name: 'Unique2', deck: 'CUSTOM', number: 0, desc: [] },
        status: 'published',
      }, 'tok-bob')
      const res2 = mockRes()
      await handleWorkshopRoute(req2, res2)
      expect(res2.statusCode).toBe(409)
    })
  })

  describe('GET /api/workshop/cards', () => {
    it('returns card list', async () => {
      const req = mockReq('GET', '/api/workshop/cards')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      const d = JSON.parse(res.body)
      expect(d.ok).toBe(true)
      expect(Array.isArray(d.cards)).toBe(true)
    })
  })

  describe('POST /api/workshop/cards/:id/like', () => {
    let cardDbId = ''

    beforeAll(async () => {
      // Create a published card to like
      const req = mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_LikeCard',
        card_type: 'minor', name: 'Like Card',
        card_json: { id: 'CUSTOM_LikeCard', name: 'Like Card', deck: 'CUSTOM', number: 0, desc: [] },
        status: 'published',
      }, 'tok-alice')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      cardDbId = JSON.parse(res.body).id
    })

    it('toggles like on', async () => {
      const req = mockReq('POST', `/api/workshop/cards/${cardDbId}/like`, null, 'tok-bob')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      const d = JSON.parse(res.body)
      expect(d.ok).toBe(true)
      expect(d.liked).toBe(true)
    })

    it('toggles like off', async () => {
      const req = mockReq('POST', `/api/workshop/cards/${cardDbId}/like`, null, 'tok-bob')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      const d = JSON.parse(res.body)
      expect(d.liked).toBe(false)
    })

    it('requires auth', async () => {
      const req = mockReq('POST', `/api/workshop/cards/${cardDbId}/like`)
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      expect(res.statusCode).toBe(401)
    })
  })

  describe('comments', () => {
    let cardDbId = ''

    beforeAll(async () => {
      const req = mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_CommentCard',
        card_type: 'minor', name: 'Comment Card',
        card_json: { id: 'CUSTOM_CommentCard', name: 'Comment Card', deck: 'CUSTOM', number: 0, desc: [] },
        status: 'published',
      }, 'tok-alice')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      cardDbId = JSON.parse(res.body).id
    })

    it('adds a comment', async () => {
      const req = mockReq('POST', `/api/workshop/cards/${cardDbId}/comments`, { body: 'Great card!' }, 'tok-bob')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      expect(JSON.parse(res.body).ok).toBe(true)
    })

    it('lists comments', async () => {
      const req = mockReq('GET', `/api/workshop/cards/${cardDbId}/comments`)
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      const d = JSON.parse(res.body)
      expect(d.ok).toBe(true)
      expect(d.comments.length).toBeGreaterThan(0)
      expect(d.comments[0].body).toBe('Great card!')
    })

    it('rejects empty comment', async () => {
      const req = mockReq('POST', `/api/workshop/cards/${cardDbId}/comments`, { body: '' }, 'tok-alice')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      expect(res.statusCode).toBe(400)
    })
  })
})
