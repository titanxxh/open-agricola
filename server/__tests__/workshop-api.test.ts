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
    effect_dsl TEXT, effect_code TEXT, compiled_code TEXT, code_manifest TEXT,
    art_url TEXT, art_prompt TEXT, status TEXT NOT NULL DEFAULT 'draft',
    featured INTEGER NOT NULL DEFAULT 0,
    github_pr_url TEXT,
    github_pr_status TEXT,
    github_pr_last_synced_at INTEGER,
    draft_revision INTEGER NOT NULL DEFAULT 1,
    draft_generation_json TEXT NOT NULL DEFAULT '{}',
    published_version_id TEXT,
    sandbox_pass_version_id TEXT,
    sandbox_passed_at INTEGER,
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
  CREATE TABLE sandbox_settings (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    player_count INTEGER NOT NULL DEFAULT 2,
    deck_ids_json TEXT NOT NULL DEFAULT '["A","B","C","D","E"]',
    enable_through_the_seasons INTEGER NOT NULL DEFAULT 0,
    enable_farmers_of_the_moor INTEGER NOT NULL DEFAULT 0,
    allow_incomplete_farmers_of_the_moor_minor_deal INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE workshop_card_versions (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
    card_json TEXT NOT NULL,
    effect_dsl TEXT,
    effect_code TEXT,
    compiled_code TEXT,
    code_manifest TEXT,
    art_url TEXT,
    version_number INTEGER NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    content_hash TEXT,
    provenance_json TEXT NOT NULL DEFAULT '{}'
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

const createPublishedCard = async (
  body: {
    card_id: string
    card_type: 'minor' | 'occupation'
    name: string
    card_json: Record<string, unknown>
  },
  token: string,
): Promise<string> => {
  const createRes = mockRes()
  await handleWorkshopRoute(
    mockReq('POST', '/api/workshop/cards', body, token),
    createRes,
  )
  const cardDbId = JSON.parse(createRes.body).id as string
  const publishRes = mockRes()
  await handleWorkshopRoute(
    mockReq('POST', `/api/workshop/cards/${cardDbId}/publish`, {
      baseRevision: 1,
    }, token),
    publishRes,
  )
  expect(JSON.parse(publishRes.body).ok).toBe(true)
  return cardDbId
}

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

    it('rejects the removed create-or-update payload', async () => {
      const createRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_CreateOnly',
        card_type: 'minor',
        name: 'Create Only',
        card_json: {
          id: 'CUSTOM_CreateOnly',
          name: 'Create Only',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: [],
        },
      }, 'tok-alice'), createRes)

      const updateRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards', {
        id: JSON.parse(createRes.body).id,
        card_id: 'CUSTOM_CreateOnly',
        card_type: 'minor',
        name: 'Legacy Update',
        card_json: {
          id: 'CUSTOM_CreateOnly',
          name: 'Legacy Update',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: [],
        },
      }, 'tok-alice'), updateRes)

      expect(updateRes.statusCode).toBe(400)
      expect(JSON.parse(updateRes.body).error).toMatch(/revisioned draft/i)
    })

    it('prevents duplicate card_id', async () => {
      await createPublishedCard({
        card_id: 'CUSTOM_UniqueCard',
        card_type: 'minor', name: 'Unique', card_json: { id: 'CUSTOM_UniqueCard', name: 'Unique', deck: 'CUSTOM', number: 0, desc: [] },
      }, 'tok-alice')

      const req2 = mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_UniqueCard',
        card_type: 'minor', name: 'Unique2', card_json: { id: 'CUSTOM_UniqueCard', name: 'Unique2', deck: 'CUSTOM', number: 0, desc: [] },
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

    it('returns both draft and published cards for scope=mine', async () => {
      const createDraft = mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_MyDraftCard',
        card_type: 'minor',
        name: 'My Draft Card',
        card_json: { id: 'CUSTOM_MyDraftCard', name: 'My Draft Card', deck: 'CUSTOM', number: 0, desc: [] },
      }, 'tok-alice')
      const publishedBody = {
        card_id: 'CUSTOM_MyPublishedCard',
        card_type: 'minor' as const,
        name: 'My Published Card',
        card_json: { id: 'CUSTOM_MyPublishedCard', name: 'My Published Card', deck: 'CUSTOM', number: 0, desc: [] },
      }
      const otherBody = {
        card_id: 'CUSTOM_OtherPublishedCard',
        card_type: 'minor' as const,
        name: 'Other Published Card',
        card_json: { id: 'CUSTOM_OtherPublishedCard', name: 'Other Published Card', deck: 'CUSTOM', number: 0, desc: [] },
      }

      await handleWorkshopRoute(createDraft, mockRes())
      await createPublishedCard(publishedBody, 'tok-alice')
      await createPublishedCard(otherBody, 'tok-bob')

      const req = mockReq('GET', '/api/workshop/cards?scope=mine', null, 'tok-alice')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      const d = JSON.parse(res.body)

      expect(d.ok).toBe(true)
      expect(d.cards.some((card: { name: string; status: string }) => card.name === 'My Draft Card' && card.status === 'draft')).toBe(true)
      expect(d.cards.some((card: { name: string; status: string }) => card.name === 'My Published Card' && card.status === 'published')).toBe(true)
      expect(d.cards.some((card: { name: string }) => card.name === 'Other Published Card')).toBe(false)
    })
  })

  describe('GET /api/workshop/cards/:id/versions', () => {
    it('returns version history for an owned card instead of the card list payload', async () => {
      const createReq = mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_VersionRouteCard',
        card_type: 'minor',
        name: 'Version Route Card',
        card_json: { id: 'CUSTOM_VersionRouteCard', name: 'Version Route Card', deck: 'CUSTOM', number: 0, desc: ['v1'] },
      }, 'tok-alice')
      const createRes = mockRes()
      await handleWorkshopRoute(createReq, createRes)
      const cardDbId = JSON.parse(createRes.body).id

      const publishRes = mockRes()
      await handleWorkshopRoute(mockReq(
        'POST',
        `/api/workshop/cards/${cardDbId}/publish`,
        { baseRevision: 1 },
        'tok-alice',
      ), publishRes)
      expect(JSON.parse(publishRes.body).ok).toBe(true)

      const versionsReq = mockReq('GET', `/api/workshop/cards/${cardDbId}/versions`, null, 'tok-alice')
      const versionsRes = mockRes()
      await handleWorkshopRoute(versionsReq, versionsRes)
      const data = JSON.parse(versionsRes.body)

      expect(data.ok).toBe(true)
      expect(data.cards).toBeUndefined()
      expect(data.versions).toHaveLength(1)
      expect(data.versions[0].version_number).toBe(1)
    })
  })

  describe('revisioned workspace commands', () => {
    it('loads private generation context only for the author', async () => {
      const createRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_PrivateWorkspace',
        card_type: 'minor',
        name: 'Private Workspace',
        card_json: {
          id: 'CUSTOM_PrivateWorkspace',
          name: 'Private Workspace',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: [],
        },
      }, 'tok-alice'), createRes)
      const cardDbId = JSON.parse(createRes.body).id

      const checkpointRes = mockRes()
      await handleWorkshopRoute(mockReq('PUT', `/api/workshop/cards/${cardDbId}/draft`, {
        baseRevision: 1,
        draft: {
          cardId: 'CUSTOM_PrivateWorkspace',
          cardType: 'minor',
          name: 'Private Workspace',
          description: '',
          cardJson: {
            id: 'CUSTOM_PrivateWorkspace',
            name: 'Private Workspace',
            card_type: 'minor',
            deck: 'CUSTOM',
            number: 0,
            desc: [],
          },
          effectCode: null,
          artUrl: null,
          generation: {
            art: {
              lastCompleted: {
                id: 'private-art',
                kind: 'art',
                prompt: 'private prompt',
                resultUrl: '/card-art/private.png',
                model: 'private-model',
                createdAt: 100,
              },
            },
          },
        },
      }, 'tok-alice'), checkpointRes)
      expect(JSON.parse(checkpointRes.body).workspace.revision).toBe(2)

      const workspaceRes = mockRes()
      await handleWorkshopRoute(
        mockReq('GET', `/api/workshop/cards/${cardDbId}/workspace`, null, 'tok-alice'),
        workspaceRes,
      )
      expect(JSON.parse(workspaceRes.body).workspace.draft.generation.art.lastCompleted.prompt)
        .toBe('private prompt')

      const ownerDetailRes = mockRes()
      await handleWorkshopRoute(
        mockReq('GET', `/api/workshop/cards/${cardDbId}`, null, 'tok-alice'),
        ownerDetailRes,
      )
      expect(ownerDetailRes.statusCode).toBe(200)
      expect(JSON.parse(ownerDetailRes.body).card.name).toBe('Private Workspace')
      expect(ownerDetailRes.body).not.toContain('private prompt')

      const otherRes = mockRes()
      await handleWorkshopRoute(
        mockReq('GET', `/api/workshop/cards/${cardDbId}/workspace`, null, 'tok-bob'),
        otherRes,
      )
      expect(otherRes.statusCode).toBe(403)

      const publicRes = mockRes()
      await handleWorkshopRoute(mockReq('GET', `/api/workshop/cards/${cardDbId}`), publicRes)
      expect(publicRes.statusCode).toBe(404)
      expect(publicRes.body).not.toContain('private prompt')
    })

    it('returns the complete server draft on revision conflict', async () => {
      const createRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_ConflictWorkspace',
        card_type: 'occupation',
        name: 'Conflict Workspace',
        card_json: {
          id: 'CUSTOM_ConflictWorkspace',
          name: 'Conflict Workspace',
          card_type: 'occupation',
          deck: 'CUSTOM',
          number: 0,
          desc: [],
        },
      }, 'tok-alice'), createRes)
      const cardDbId = JSON.parse(createRes.body).id
      const draft = {
        cardId: 'CUSTOM_ConflictWorkspace',
        cardType: 'occupation',
        name: 'Server wins',
        description: '',
        cardJson: {
          id: 'CUSTOM_ConflictWorkspace',
          name: 'Server wins',
          card_type: 'occupation',
          deck: 'CUSTOM',
          number: 0,
          desc: [],
        },
        effectCode: null,
        artUrl: null,
        generation: {},
      }
      await handleWorkshopRoute(mockReq('PUT', `/api/workshop/cards/${cardDbId}/draft`, {
        baseRevision: 1,
        draft,
      }, 'tok-alice'), mockRes())

      const conflictRes = mockRes()
      await handleWorkshopRoute(mockReq('PUT', `/api/workshop/cards/${cardDbId}/draft`, {
        baseRevision: 1,
        draft: { ...draft, name: 'Stale client' },
      }, 'tok-alice'), conflictRes)
      const conflict = JSON.parse(conflictRes.body)
      expect(conflictRes.statusCode).toBe(409)
      expect(conflict.current.revision).toBe(2)
      expect(conflict.current.draft.name).toBe('Server wins')
    })

    it('publishes an immutable privacy-safe projection', async () => {
      const createRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_PinnedPublic',
        card_type: 'minor',
        name: 'Pinned Public',
        card_json: {
          id: 'CUSTOM_PinnedPublic',
          name: 'Pinned Public',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: ['published text'],
          _draft: { costInput: '1w' },
        },
      }, 'tok-alice'), createRes)
      const cardDbId = JSON.parse(createRes.body).id

      const adoptRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', `/api/workshop/cards/${cardDbId}/adopt`, {
        baseRevision: 1,
        candidate: {
          id: 'art-public',
          kind: 'art',
          prompt: 'secret prompt',
          resultUrl: '/card-art/published.png',
          model: 'secret-model',
          createdAt: 100,
        },
      }, 'tok-alice'), adoptRes)
      expect(JSON.parse(adoptRes.body).workspace.revision).toBe(2)

      const publishRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', `/api/workshop/cards/${cardDbId}/publish`, {
        baseRevision: 2,
      }, 'tok-alice'), publishRes)
      const versionId = JSON.parse(publishRes.body).versionId
      expect(versionId).toBeTruthy()

      const publicBeforeRes = mockRes()
      await handleWorkshopRoute(mockReq('GET', `/api/workshop/cards/${cardDbId}`), publicBeforeRes)
      const publicBefore = JSON.parse(publicBeforeRes.body)
      expect(publicBefore.card.art_url).toBe('/card-art/published.png')
      expect(publicBefore.card.card_json._draft).toBeUndefined()
      expect(publicBeforeRes.body).not.toContain('secret prompt')
      expect(publicBeforeRes.body).not.toContain('secret-model')

      const workspaceRes = mockRes()
      await handleWorkshopRoute(
        mockReq('GET', `/api/workshop/cards/${cardDbId}/workspace`, null, 'tok-alice'),
        workspaceRes,
      )
      const workspace = JSON.parse(workspaceRes.body).workspace
      const changedDraft = {
        ...workspace.draft,
        name: 'Unpublished change',
        artUrl: '/card-art/unpublished.png',
        cardJson: {
          ...workspace.draft.cardJson,
          name: 'Unpublished change',
          desc: ['unpublished text'],
        },
      }
      await handleWorkshopRoute(mockReq('PUT', `/api/workshop/cards/${cardDbId}/draft`, {
        baseRevision: workspace.revision,
        draft: changedDraft,
      }, 'tok-alice'), mockRes())

      const publicAfterRes = mockRes()
      await handleWorkshopRoute(mockReq('GET', `/api/workshop/cards/${cardDbId}`), publicAfterRes)
      const publicAfter = JSON.parse(publicAfterRes.body)
      expect(publicAfter.card.name).toBe('Pinned Public')
      expect(publicAfter.card.art_url).toBe('/card-art/published.png')
      expect(publicAfterRes.body).not.toContain('Unpublished change')

      const publicListRes = mockRes()
      await handleWorkshopRoute(mockReq('GET', '/api/workshop/cards'), publicListRes)
      expect(publicListRes.body).not.toContain('secret prompt')
      expect(publicListRes.body).not.toContain('Unpublished change')

      const restoreRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', `/api/workshop/cards/${cardDbId}/restore`, {
        baseRevision: 3,
        versionId,
      }, 'tok-alice'), restoreRes)
      expect(JSON.parse(restoreRes.body).workspace.revision).toBe(4)
      expect(db.prepare(`
        SELECT COUNT(*) AS count FROM workshop_card_versions WHERE card_id = ?
      `).get(cardDbId)).toEqual({ count: 1 })

      const sandboxPassRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', `/api/workshop/cards/${cardDbId}/sandbox-pass`, {
        versionId,
        authorConfirmed: true,
        runtimeErrors: [],
      }, 'tok-alice'), sandboxPassRes)
      expect(JSON.parse(sandboxPassRes.body).workspace.sandboxPassVersionId).toBe(versionId)

      const readyRes = mockRes()
      await handleWorkshopRoute(
        mockReq('GET', `/api/workshop/cards/${cardDbId}/workspace`, null, 'tok-alice'),
        readyRes,
      )
      expect(JSON.parse(readyRes.body).readiness.ready).toBe(true)
    })

    it('creates a pinned version when an admin publishes a draft', async () => {
      const createRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_AdminPublished',
        card_type: 'minor',
        name: 'Admin Published',
        card_json: {
          id: 'CUSTOM_AdminPublished',
          name: 'Admin Published',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: [],
        },
      }, 'tok-bob'), createRes)
      const cardDbId = JSON.parse(createRes.body).id
      const previousAdmins = process.env.ADMIN_USERS
      process.env.ADMIN_USERS = 'alice'
      try {
        const statusRes = mockRes()
        await handleWorkshopRoute(mockReq(
          'POST',
          `/api/admin/cards/${cardDbId}/status`,
          { status: 'published' },
          'tok-alice',
        ), statusRes)

        expect(statusRes.statusCode).toBe(200)
        expect(JSON.parse(statusRes.body)).toMatchObject({
          ok: true,
          status: 'published',
          publishedVersionId: expect.any(String),
        })
        expect(db.prepare(`
          SELECT published_version_id FROM workshop_cards WHERE id = ?
        `).get(cardDbId)).toEqual({
          published_version_id: expect.any(String),
        })

        const publicRes = mockRes()
        await handleWorkshopRoute(mockReq('GET', `/api/workshop/cards/${cardDbId}`), publicRes)
        expect(publicRes.statusCode).toBe(200)
      } finally {
        if (previousAdmins === undefined) delete process.env.ADMIN_USERS
        else process.env.ADMIN_USERS = previousAdmins
      }
    })
  })

  describe('POST /api/workshop/cards/:id/like', () => {
    let cardDbId = ''

    beforeAll(async () => {
      cardDbId = await createPublishedCard({
        card_id: 'CUSTOM_LikeCard',
        card_type: 'minor', name: 'Like Card',
        card_json: { id: 'CUSTOM_LikeCard', name: 'Like Card', deck: 'CUSTOM', number: 0, desc: [] },
      }, 'tok-alice')
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
      cardDbId = await createPublishedCard({
        card_id: 'CUSTOM_CommentCard',
        card_type: 'minor', name: 'Comment Card',
        card_json: { id: 'CUSTOM_CommentCard', name: 'Comment Card', deck: 'CUSTOM', number: 0, desc: [] },
      }, 'tok-alice')
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

  describe('sandbox settings', () => {
    let cardDbId = ''

    beforeAll(async () => {
      cardDbId = await createPublishedCard({
        card_id: 'CUSTOM_SandboxCard',
        card_type: 'minor',
        name: 'Sandbox Card',
        card_json: { id: 'CUSTOM_SandboxCard', name: 'Sandbox Card', deck: 'CUSTOM', number: 0, desc: [] },
      }, 'tok-alice')
    })

    it('returns default sandbox settings when none saved', async () => {
      const req = mockReq('GET', '/api/workshop/sandbox', null, 'tok-bob')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      const data = JSON.parse(res.body)
      expect(data.ok).toBe(true)
      expect(data.settings.player_count).toBe(2)
      expect(data.settings.deck_ids).toEqual(['A', 'B', 'C', 'D', 'E'])
    })

    it('replaces sandbox cards and persists settings together', async () => {
      const req = mockReq('POST', '/api/workshop/sandbox', {
        workshop_card_ids: [cardDbId],
        settings: {
          player_count: 6,
          deck_ids: ['B', 'D'],
          enable_through_the_seasons: true,
          enable_farmers_of_the_moor: true,
          allow_incomplete_farmers_of_the_moor_minor_deal: true,
        },
      }, 'tok-bob')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      expect(JSON.parse(res.body).ok).toBe(true)

      const getReq = mockReq('GET', '/api/workshop/sandbox', null, 'tok-bob')
      const getRes = mockRes()
      await handleWorkshopRoute(getReq, getRes)
      const data = JSON.parse(getRes.body)
      expect(data.cards).toHaveLength(1)
      expect(data.cards[0].id).toBe(cardDbId)
      expect(data.settings.player_count).toBe(6)
      expect(data.settings.deck_ids).toEqual(['B', 'D'])
      expect(data.settings.enable_through_the_seasons).toBe(true)
      expect(data.settings.enable_farmers_of_the_moor).toBe(true)
      expect(data.settings.allow_incomplete_farmers_of_the_moor_minor_deal).toBe(true)
    })
  })
})
