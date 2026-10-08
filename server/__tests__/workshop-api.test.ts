import { seedResourceCatalog } from './_helpers/objects'
/**
 * Workshop API integration tests.
 * Tests card CRUD, like toggle, and comment operations
 * by calling the handler functions with mock req/res objects.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { EventEmitter } from 'node:events'
import { generateKeyPairSync } from 'node:crypto'
import { createTestDatabase } from './_helpers/postgres'
import {
  approveCurrentDraft,
  checkpointDraft,
  enterReview,
  loadWorkspace,
  publish,
  unpublish,
} from '../workshop-drafts.ts'
import type { WorkshopReviewRuntime } from '../workshop-review/webhook-handler.ts'
import type { WorkshopReviewSnapshot } from '../workshop-review/github-review-provider.ts'

// ── Mock DB ──────────────────────────────────────────────────────────────────

const db = await createTestDatabase()
await seedResourceCatalog(db, ['private.png', 'published.png', 'unpublished.png'])
afterAll(async () => { await db.close() })

vi.mock('../db.ts', () => ({ getDb: () => db, cleanExpiredSessions: () => {} }))

// Seed user and session
const NOW = Date.now()
;(await db.prepare('INSERT INTO users (id, username, display_name, password_hash, created_at, last_login_at) VALUES (?,?,?,?,?,?)').run('u1', 'alice', 'Alice', 'hash', NOW, null))
;(await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('tok-alice', 'u1', NOW + 86400000, NOW))
;(await db.prepare('INSERT INTO users (id, username, display_name, password_hash, created_at, last_login_at) VALUES (?,?,?,?,?,?)').run('u2', 'bob', 'Bob', 'hash', NOW, null))
;(await db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run('tok-bob', 'u2', NOW + 86400000, NOW))

vi.mock('../auth.ts', async () => {
  const actual = await vi.importActual('../auth.ts') as Record<string, unknown>
  return {
    ...actual,
    validateSession: async (token: string) => {
      const row = (await db.prepare('SELECT u.id, u.username, u.display_name FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.expires_at > ?').get(token, Date.now())) as { id: string; username: string; display_name: string } | undefined
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
  const events = new EventEmitter()
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
    setHeader: (k: string, value: string) => { headers[k] = value },
    once: events.once.bind(events),
    off: events.off.bind(events),
    emit: events.emit.bind(events),
  } as unknown as ServerResponse & { statusCode: number; body: string }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Imported lazily after mocks are set up
let handleWorkshopRoute: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>
const reviewProvider = vi.fn(async () => ({
  reviewDecision: 'APPROVED',
  headRefOid: 'approved-head',
  baseRefName: 'main',
  state: 'OPEN',
  isDraft: false,
  reviews: [{
    id: 'approved-review',
    state: 'APPROVED',
    commitOid: 'approved-head',
    authorCanPushToRepository: true,
  }],
}))
const reviewRuntime: WorkshopReviewRuntime = {
  webhookSecret: 'webhook-secret',
  repositoryOwner: 'titanxxh',
  repositoryName: 'open-agricola',
  provider: { getPullRequestSnapshot: reviewProvider },
}
let nextReviewPrNumber = 1

beforeAll(async () => {
  const mod = await import('../workshop.ts')
  handleWorkshopRoute = (req, res) => mod.handleWorkshopRoute(req, res, reviewRuntime)
})

it('serves fresh public reference metadata with the project credential, never the caller credential', async () => {
  vi.stubEnv('WORKSHOP_REFERENCE_GITHUB_TOKEN', 'project-reference-secret')
  const upstream = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ object: { sha: 'a'.repeat(40) }, token: 'must-not-leak' }))
    .mockResolvedValueOnce(Response.json({ object: { sha: 'b'.repeat(40) } }))
  vi.stubGlobal('fetch', upstream)
  try {
    const denied = mockRes()
    await handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main'), denied)
    expect(denied.statusCode).toBe(401)
    expect(upstream).not.toHaveBeenCalled()
    for (const sha of ['a'.repeat(40), 'b'.repeat(40)]) {
      const response = mockRes()
      await handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main', null, 'tok-alice'), response)
      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ object: { sha } })
      expect(response.getHeader('Cache-Control')).toBe('no-store')
    }
    expect(upstream).toHaveBeenCalledTimes(2)
    for (const [url, init] of upstream.mock.calls) {
      expect(url).toBe('https://api.github.com/repos/titanxxh/open-agricola/git/ref/heads/main')
      expect(init).toMatchObject({ method: 'GET', redirect: 'error', cache: 'no-store' })
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer project-reference-secret')
      expect(JSON.stringify(init)).not.toContain('tok-alice')
    }
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals() }
})

it('pins and caches complete tree metadata, rejects arbitrary targets and strips upstream fields', async () => {
  vi.stubEnv('WORKSHOP_REFERENCE_GITHUB_TOKEN', 'project-reference-secret')
  const sha = 'c'.repeat(40)
  const blob = { path: 'docs/CUSTOM_CARD_SANDBOX.md', type: 'blob', sha: 'd'.repeat(40), size: 12 }
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ tree: [{ ...blob, url: 'https://untrusted.example', token: 'do-not-forward' }], truncated: false, secret: 'do-not-forward' }))
  vi.stubGlobal('fetch', upstream)
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = mockRes()
      await handleWorkshopRoute(mockReq('GET', `/api/workshop/references/tree/${sha}`, null, 'tok-alice'), response)
      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.body)).toEqual({ tree: [blob], truncated: false })
    }
    for (const target of ['tree/main', 'tree/../../private', 'https://example.com', 'main?repo=private/repo']) {
      const response = mockRes()
      await handleWorkshopRoute(mockReq('GET', `/api/workshop/references/${target}`, null, 'tok-alice'), response)
      expect(response.statusCode).toBe(400)
    }
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(upstream.mock.calls[0][0]).toBe(`https://api.github.com/repos/titanxxh/open-agricola/git/trees/${sha}?recursive=1`)
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals() }
})

it('pauses reference reads for GitHub rate limits without exposing upstream errors or making repeated calls', async () => {
  vi.stubEnv('WORKSHOP_REFERENCE_GITHUB_TOKEN', 'project-reference-secret')
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response('project-reference-secret upstream body', { status: 429, headers: { 'Retry-After': '120' } }))
  vi.stubGlobal('fetch', upstream)
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = mockRes()
      await handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main', null, 'tok-alice'), response)
      expect(response.statusCode).toBe(429)
      expect(response.getHeader('Retry-After')).toBe('120')
      expect(response.body).not.toMatch(/secret|upstream body/)
    }
    expect(upstream).toHaveBeenCalledTimes(1)
    clock.mockReturnValue(now + 121_000)
    upstream.mockResolvedValueOnce(Response.json({ object: { sha: 'f'.repeat(40) } }))
    const recovered = mockRes()
    await handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main', null, 'tok-alice'), recovered)
    expect(recovered.statusCode).toBe(200)
    expect(upstream).toHaveBeenCalledTimes(2)
  } finally { clock.mockRestore(); vi.unstubAllEnvs(); vi.unstubAllGlobals() }
})

it('bounds simultaneous reference requests across users before contacting GitHub', async () => {
  vi.stubEnv('WORKSHOP_REFERENCE_GITHUB_TOKEN', 'project-reference-secret')
  const gate = Promise.withResolvers<void>()
  const upstream = vi.fn<typeof fetch>().mockImplementation(async () => { await gate.promise; return Response.json({ object: { sha: 'a'.repeat(40) } }) })
  vi.stubGlobal('fetch', upstream)
  const pending = Array.from({ length: 3 }, () => handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main', null, 'tok-alice'), mockRes()))
  try {
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(3))
    const response = mockRes()
    const fourth = handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main', null, 'tok-bob'), response)
    await vi.waitFor(() => expect(response.statusCode).toBe(429))
    expect(response.getHeader('Retry-After')).toBe('1')
    expect(upstream).toHaveBeenCalledTimes(3)
    await fourth
  } finally { gate.resolve(); await Promise.all(pending); vi.unstubAllEnvs(); vi.unstubAllGlobals() }
})

it('rejects incomplete, oversized and malformed reference responses without leaking upstream data', async () => {
  vi.stubEnv('WORKSHOP_REFERENCE_GITHUB_TOKEN', 'project-reference-secret')
  const upstream = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ tree: [], truncated: true }))
    .mockResolvedValueOnce(new Response('project-reference-secret'.repeat(7000)))
    .mockResolvedValueOnce(Response.json({ object: { sha: 'invalid' } }))
    .mockRejectedValueOnce(new Error('project-reference-secret in transport error'))
  vi.stubGlobal('fetch', upstream)
  try {
    for (const target of [`tree/${'9'.repeat(40)}`, 'main', 'main', 'main']) {
      const response = mockRes()
      await handleWorkshopRoute(mockReq('GET', `/api/workshop/references/${target}`, null, 'tok-alice'), response)
      expect(response.statusCode).toBe(503)
      expect(JSON.parse(response.body)).toEqual({ ok: false, error: 'GitHub reference metadata is unavailable.' })
    }
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals() }
})

it('cancels an upstream reference read when the browser disconnects', async () => {
  vi.stubEnv('WORKSHOP_REFERENCE_GITHUB_TOKEN', 'project-reference-secret')
  let aborted = false
  const upstream = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    const signal = init?.signal
    if (!signal) throw new Error('Missing request signal')
    await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')) }, { once: true }))
    return Response.json({})
  })
  vi.stubGlobal('fetch', upstream)
  try {
    const response = mockRes()
    const request = handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main', null, 'tok-alice'), response)
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(1))
    Object.defineProperty(response, 'destroyed', { value: true })
    response.emit('close')
    await request
    expect(aborted).toBe(true)
    expect(response.body).toBe('')
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals() }
})

it('requires a project GitHub identity instead of falling back to anonymous metadata', async () => {
  vi.stubEnv('WORKSHOP_REFERENCE_GITHUB_TOKEN', '')
  vi.stubEnv('WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY', '')
  const upstream = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', upstream)
  try {
    const response = mockRes()
    await handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main', null, 'tok-alice'), response)
    expect(response.statusCode).toBe(503)
    expect(upstream).not.toHaveBeenCalled()
  } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals() }
})

it('honors App token rate limits and cancels token acquisition before reading reference metadata', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  vi.stubEnv('WORKSHOP_REFERENCE_GITHUB_TOKEN', '')
  vi.stubEnv('WORKSHOP_REVIEW_GITHUB_APP_ID', '123')
  vi.stubEnv('WORKSHOP_REVIEW_GITHUB_INSTALLATION_ID', '456')
  vi.stubEnv('WORKSHOP_REVIEW_GITHUB_PRIVATE_KEY', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString())
  vi.stubEnv('GITHUB_UPSTREAM_OWNER', 'titanxxh')
  vi.stubEnv('GITHUB_UPSTREAM_REPO', 'open-agricola')
  const upstream = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('private upstream body', { status: 429, headers: { 'Retry-After': '120' } }))
  vi.stubGlobal('fetch', upstream)
  const now = Date.now()
  const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = mockRes()
      await handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main', null, 'tok-alice'), response)
      expect(response.statusCode).toBe(429)
      expect(response.getHeader('Retry-After')).toBe('120')
      expect(response.body).not.toContain('private upstream body')
    }
    expect(upstream).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(upstream.mock.calls[0][1]?.body))).toEqual({ repositories: ['open-agricola'], permissions: { contents: 'read', pull_requests: 'read' } })
    clock.mockReturnValue(now + 121_000)
    let aborted = false
    upstream.mockImplementationOnce(async (_url, init) => {
      const signal = init?.signal
      if (!signal) throw new Error('Missing App request signal')
      await new Promise<void>((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')) }, { once: true }))
      return Response.json({})
    })
    const disconnected = mockRes()
    const request = handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main', null, 'tok-alice'), disconnected)
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(2))
    Object.defineProperty(disconnected, 'destroyed', { value: true })
    disconnected.emit('close')
    await vi.waitFor(() => expect(aborted).toBe(true))
    await request
    upstream.mockResolvedValueOnce(Response.json({ token: 'project-app-read-secret', expires_at: new Date(now + 3_600_000).toISOString() }))
      .mockResolvedValueOnce(Response.json({ object: { sha: 'a'.repeat(40) } }))
    const recovered = mockRes()
    await handleWorkshopRoute(mockReq('GET', '/api/workshop/references/main', null, 'tok-alice'), recovered)
    expect(recovered.statusCode).toBe(200)
    expect(upstream.mock.calls.slice(0, 3).every(([url]) => url === 'https://api.github.com/app/installations/456/access_tokens')).toBe(true)
    expect(new Headers(upstream.mock.calls[3][1]?.headers).get('Authorization')).toBe('Bearer project-app-read-secret')
    expect(recovered.body).not.toContain('secret')
  } finally { clock.mockRestore(); vi.unstubAllEnvs(); vi.unstubAllGlobals() }
})

const approveForPublish = async (
  cardId: string,
  authorId: string,
  revision: number,
): Promise<Awaited<void>> => {
  ;(await enterReview(db, {
    cardId,
    authorId,
    prUrl: `https://github.com/titanxxh/open-agricola/pull/${nextReviewPrNumber++}`,
    expectedRevision: revision,
    commitSha: 'approved-head',
  }))
  ;(await approveCurrentDraft(db, {
    cardId,
    authorId,
    commitSha: 'approved-head',
    reviewId: 'approved-review',
  }))
}

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
    mockReq('POST', '/api/workshop/cards', {
      ...body,
      card_json: {
        ...body.card_json,
        card_type: body.card_type,
      },
    }, token),
    createRes,
  )
  const cardDbId = JSON.parse(createRes.body).id as string
  const authorId = ((await db.prepare('SELECT user_id FROM sessions WHERE token = ?')
    .get(token)) as { user_id: string }).user_id
  await approveForPublish(cardDbId, authorId, 1)
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
  describe('POST /api/workshop/cards/validate-code', () => {
    it('binds validation, including failures, to the deployed sandbox and exact source', async () => {
      const descriptor = mockRes()
      await handleWorkshopRoute(mockReq('GET', '/api/workshop/sandbox-contract'), descriptor)
      const { contract } = JSON.parse(descriptor.body)
      expect(contract.id).toMatch(/^sandbox-v1:[a-f0-9]{64}$/)
      expect(contract.helpers).toContain('function getCardDefinition(_cardId)')
      expect(contract.limits).toEqual({ executionTimeoutMs: 100, memoryLimitMb: 8 })
      const invalid = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards/validate-code', {
        source: 'import x from "node:fs"', card_id: 'CUSTOM_Test', sandboxContractId: contract.id,
      }, 'tok-alice'), invalid)
      expect(JSON.parse(invalid.body)).toMatchObject({ valid: false, sandboxContractId: contract.id, sourceFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) })
      const changed = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards/validate-code', {
        source: 'const CARD_IMPL = {}', card_id: 'CUSTOM_Test', sandboxContractId: 'old-deployment',
      }, 'tok-alice'), changed)
      expect(changed.statusCode).toBe(409)
      expect(JSON.parse(changed.body)).toMatchObject({ code: 'sandbox_changed', sandboxContractId: contract.id })
    })

    it('validates cost attribution against the submitted card ID', async () => {
      const source = `
const CARD_ID = 'CUSTOM_ValidatedCard'
const CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Validated Card' })
const CARD_IMPL = {
  listeners: [{
    cardIds: [CARD_ID],
    actions: ['construct'],
    phases: ['computeCosts'],
    handler: () => ({
      costs: { wood: -1 },
      costAttribution: [{ sourceCard: CARD_ID, costs: { wood: -1 } }],
    }),
  }],
}
      `
      const res = mockRes()

      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards/validate-code', {
        source,
        card_id: 'CUSTOM_ValidatedCard',
      }, 'tok-alice'), res)

      expect(JSON.parse(res.body)).toMatchObject({ ok: true, valid: true })
    })
  })

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

    it('returns only cards loadable into real rooms for scope=room', async () => {
      const liveId = await createPublishedCard({
        card_id: 'CUSTOM_RoomLiveCard',
        card_type: 'minor',
        name: 'Room Live Card',
        card_json: { id: 'CUSTOM_RoomLiveCard', name: 'Room Live Card', deck: 'CUSTOM', number: 0, desc: [] },
      }, 'tok-alice')
      const builtInId = await createPublishedCard({
        card_id: 'CUSTOM_RoomBuiltInCard',
        card_type: 'minor',
        name: 'Room Built-in Card',
        card_json: { id: 'CUSTOM_RoomBuiltInCard', name: 'Room Built-in Card', deck: 'CUSTOM', number: 0, desc: [] },
      }, 'tok-bob')
      const mergedWindowId = await createPublishedCard({
        card_id: 'CUSTOM_RoomMergedWindowCard',
        card_type: 'occupation',
        name: 'Room Merged Window Card',
        card_json: { id: 'CUSTOM_RoomMergedWindowCard', name: 'Room Merged Window Card', deck: 'CUSTOM', number: 0, desc: [] },
      }, 'tok-alice')
      ;(await db.prepare("UPDATE workshop_cards SET review_status = 'merged', built_in = 1 WHERE id = ?").run(builtInId))
      ;(await db.prepare("UPDATE workshop_cards SET review_status = 'merged' WHERE id = ?").run(mergedWindowId))

      const res = mockRes()
      await handleWorkshopRoute(mockReq('GET', '/api/workshop/cards?scope=room'), res)
      const d = JSON.parse(res.body)
      const ids = d.cards.map((card: { id: string }) => card.id)

      expect(ids).toContain(liveId)
      expect(ids).toContain(mergedWindowId)
      expect(ids).not.toContain(builtInId)
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
      expect(d.cards.some((card: { name: string; review_status: string }) => card.name === 'My Draft Card' && card.review_status === 'unsubmitted')).toBe(true)
      expect(d.cards.some((card: { name: string; live: boolean }) => card.name === 'My Published Card' && card.live === true)).toBe(true)
      expect(d.cards.some((card: { name: string }) => card.name === 'Other Published Card')).toBe(false)
    })
  })

  describe('GET /api/workshop/cards/:id/versions', () => {
    it('returns version history for an owned card instead of the card list payload', async () => {
      const createReq = mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_VersionRouteCard',
        card_type: 'minor',
        name: 'Version Route Card',
        card_json: { id: 'CUSTOM_VersionRouteCard', name: 'Version Route Card', card_type: 'minor', deck: 'CUSTOM', number: 0, desc: ['v1'] },
      }, 'tok-alice')
      const createRes = mockRes()
      await handleWorkshopRoute(createReq, createRes)
      const cardDbId = JSON.parse(createRes.body).id

      await approveForPublish(cardDbId, 'u1', 1)
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

  describe('POST /api/workshop/cards/:id/publish', () => {
    it.each([
      [
        'a changed PR head',
        'CUSTOM_ChangedReviewHead',
        {
          reviewDecision: 'APPROVED',
          headRefOid: 'new-head',
          baseRefName: 'main',
          state: 'OPEN',
          isDraft: false,
          reviews: [{
            id: 'new-review',
            state: 'APPROVED',
            commitOid: 'new-head',
            authorCanPushToRepository: true,
          }],
        },
      ],
      [
        'an approver without push permission',
        'CUSTOM_ReadOnlyApprover',
        {
          reviewDecision: 'APPROVED',
          headRefOid: 'approved-head',
          baseRefName: 'main',
          state: 'OPEN',
          isDraft: false,
          reviews: [{
            id: 'read-only-review',
            state: 'APPROVED',
            commitOid: 'approved-head',
            authorCanPushToRepository: false,
          }],
        },
      ],
      [
        'a PR retargeted away from main',
        'CUSTOM_RetargetedReview',
        {
          reviewDecision: 'APPROVED',
          headRefOid: 'approved-head',
          baseRefName: 'release',
          state: 'OPEN',
          isDraft: false,
          reviews: [{
            id: 'retargeted-review',
            state: 'APPROVED',
            commitOid: 'approved-head',
            authorCanPushToRepository: true,
          }],
        },
      ],
      [
        'a closed PR',
        'CUSTOM_ClosedReviewPr',
        {
          reviewDecision: 'APPROVED',
          headRefOid: 'approved-head',
          baseRefName: 'main',
          state: 'CLOSED',
          isDraft: false,
          reviews: [{
            id: 'closed-review',
            state: 'APPROVED',
            commitOid: 'approved-head',
            authorCanPushToRepository: true,
          }],
        },
      ],
      [
        'a draft PR',
        'CUSTOM_DraftReviewPr',
        {
          reviewDecision: 'APPROVED',
          headRefOid: 'approved-head',
          baseRefName: 'main',
          state: 'OPEN',
          isDraft: true,
          reviews: [{
            id: 'draft-review',
            state: 'APPROVED',
            commitOid: 'approved-head',
            authorCanPushToRepository: true,
          }],
        },
      ],
    ])('rejects %s and makes the approval stale', async (_case, cardId, snapshot) => {
      const createRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards', {
        card_id: cardId,
        card_type: 'minor',
        name: cardId,
        card_json: {
          id: cardId,
          name: cardId,
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: ['reviewed text'],
        },
      }, 'tok-alice'), createRes)
      const cardDbId = JSON.parse(createRes.body).id as string
      await approveForPublish(cardDbId, 'u1', 1)
      reviewProvider.mockResolvedValueOnce(snapshot)
      const publishRes = mockRes()

      await handleWorkshopRoute(mockReq(
        'POST',
        `/api/workshop/cards/${cardDbId}/publish`,
        { baseRevision: 1 },
        'tok-alice',
      ), publishRes)

      expect(publishRes.statusCode).toBe(409)
      expect(JSON.parse(publishRes.body)).toMatchObject({
        ok: false,
        code: 'review_stale',
        current: {
          reviewStatus: 'stale',
          live: false,
        },
      })
      const workspaceRes = mockRes()
      await handleWorkshopRoute(
        mockReq('GET', `/api/workshop/cards/${cardDbId}/workspace`, null, 'tok-alice'),
        workspaceRes,
      )
      expect(JSON.parse(workspaceRes.body).workspace).toMatchObject({
        reviewStatus: 'stale',
        live: false,
      })
    })

    it('does not stale a newer review submitted while publish revalidation is pending', async () => {
      const createRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_ConcurrentReview',
        card_type: 'minor',
        name: 'Concurrent Review',
        card_json: {
          id: 'CUSTOM_ConcurrentReview',
          name: 'Concurrent Review',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: ['reviewed text'],
        },
      }, 'tok-alice'), createRes)
      const cardDbId = JSON.parse(createRes.body).id as string
      await approveForPublish(cardDbId, 'u1', 1)
      let resolveSnapshot!: (snapshot: WorkshopReviewSnapshot) => void
      reviewProvider.mockReturnValueOnce(new Promise(resolve => {
        resolveSnapshot = resolve
      }))
      const callsBefore = reviewProvider.mock.calls.length
      const publishRes = mockRes()
      const publishing = handleWorkshopRoute(mockReq(
        'POST',
        `/api/workshop/cards/${cardDbId}/publish`,
        { baseRevision: 1 },
        'tok-alice',
      ), publishRes)
      await vi.waitFor(() => expect(reviewProvider).toHaveBeenCalledTimes(callsBefore + 1))

      const current = (await loadWorkspace(db, cardDbId, 'u1'))
      const edited = (await checkpointDraft(db, {
        cardId: cardDbId,
        authorId: 'u1',
        baseRevision: 1,
        draft: {
          ...current.draft,
          name: 'Concurrent Review v2',
          cardJson: {
            ...current.draft.cardJson,
            name: 'Concurrent Review v2',
            desc: ['new review text'],
          },
        },
      }))
      ;(await enterReview(db, {
        cardId: cardDbId,
        authorId: 'u1',
        prUrl: ((await db.prepare(`
          SELECT github_pr_url FROM workshop_cards WHERE id = ?
        `).get(cardDbId)) as { github_pr_url: string }).github_pr_url,
        expectedRevision: edited.revision,
        commitSha: 'new-head',
      }))
      resolveSnapshot({
        reviewDecision: 'APPROVED',
        headRefOid: 'superseded-head',
        baseRefName: 'main',
        state: 'OPEN',
        isDraft: false,
        reviews: [{
          id: 'superseded-review',
          state: 'APPROVED',
          commitOid: 'superseded-head',
          authorCanPushToRepository: true,
        }],
      })
      await publishing

      expect(publishRes.statusCode).toBe(409)
      expect(JSON.parse(publishRes.body)).toMatchObject({
        ok: false,
        code: 'review_stale',
        current: {
          revision: 2,
          reviewStatus: 'in_review',
          live: false,
        },
      })
      expect((await loadWorkspace(db, cardDbId, 'u1'))).toMatchObject({
        revision: 2,
        reviewStatus: 'in_review',
        live: false,
      })
    })

    it('does not republish after a newer publish and unpublish complete', async () => {
      const cardDbId = await createPublishedCard({
        card_id: 'CUSTOM_ConcurrentUnpublish',
        card_type: 'minor',
        name: 'Concurrent Unpublish',
        card_json: {
          id: 'CUSTOM_ConcurrentUnpublish',
          name: 'Concurrent Unpublish',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: ['reviewed text'],
        },
      }, 'tok-alice')
      ;(await unpublish(db, { cardId: cardDbId, authorId: 'u1', baseRevision: 1 }))
      let resolveSnapshot!: (snapshot: WorkshopReviewSnapshot) => void
      reviewProvider.mockReturnValueOnce(new Promise(resolve => {
        resolveSnapshot = resolve
      }))
      const callsBefore = reviewProvider.mock.calls.length
      const publishRes = mockRes()
      const publishing = handleWorkshopRoute(mockReq(
        'POST',
        `/api/workshop/cards/${cardDbId}/publish`,
        { baseRevision: 1 },
        'tok-alice',
      ), publishRes)
      await vi.waitFor(() => expect(reviewProvider).toHaveBeenCalledTimes(callsBefore + 1))

      ;(await publish(db, { cardId: cardDbId, authorId: 'u1', baseRevision: 1 }))
      ;(await unpublish(db, { cardId: cardDbId, authorId: 'u1', baseRevision: 1 }))
      resolveSnapshot({
        reviewDecision: 'APPROVED',
        headRefOid: 'approved-head',
        baseRefName: 'main',
        state: 'OPEN',
        isDraft: false,
        reviews: [{
          id: 'approved-review',
          state: 'APPROVED',
          commitOid: 'approved-head',
          authorCanPushToRepository: true,
        }],
      })
      await publishing

      expect(publishRes.statusCode).toBe(409)
      expect(JSON.parse(publishRes.body)).toMatchObject({
        ok: false,
        current: { live: false },
      })
      expect((await loadWorkspace(db, cardDbId, 'u1')).live).toBe(false)
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
                promptFormat: 'subject',
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

    it('rejects an ability candidate that changes the current card identity', async () => {
      const createRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_IdentityLocked',
        card_type: 'minor',
        name: 'Identity Locked',
        card_json: {
          id: 'CUSTOM_IdentityLocked',
          name: 'Identity Locked',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: ['Original effect.'],
        },
      }, 'tok-alice'), createRes)
      const cardDbId = JSON.parse(createRes.body).id

      const adoptRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', `/api/workshop/cards/${cardDbId}/adopt`, {
        baseRevision: 1,
        candidate: {
          id: 'wrong-identity',
          kind: 'ability',
          prompt: 'regenerate the ability',
          sourceCode: `
const CARD_ID = 'CUSTOM_MasterCarpenter'
const CARD_DEF = {
  cardType: 'occupation',
  meta: {
    id: CARD_ID,
    name: 'Master Carpenter',
    deck: 'CUSTOM',
    number: 0,
    desc: ['Different effect.'],
  },
}
const CARD_IMPL = {}
          `.trim(),
          createdAt: 100,
        },
      }, 'tok-alice'), adoptRes)

      expect(adoptRes.statusCode).toBe(400)
      expect(JSON.parse(adoptRes.body)).toMatchObject({
        ok: false,
        error: 'Ability candidate identity does not match current card',
      })

      const workspaceRes = mockRes()
      await handleWorkshopRoute(
        mockReq('GET', `/api/workshop/cards/${cardDbId}/workspace`, null, 'tok-alice'),
        workspaceRes,
      )
      expect(JSON.parse(workspaceRes.body).workspace).toMatchObject({
        revision: 1,
        draft: {
          cardId: 'CUSTOM_IdentityLocked',
          cardType: 'minor',
          name: 'Identity Locked',
        },
      })
    })

    it('adopts factory-style ability card definitions', async () => {
      const createRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', '/api/workshop/cards', {
        card_id: 'CUSTOM_FactoryWorkspace',
        card_type: 'minor',
        name: 'Factory Ability',
        card_json: {
          id: 'CUSTOM_FactoryWorkspace',
          name: 'Factory Ability',
          card_type: 'minor',
          deck: 'CUSTOM',
          number: 0,
          desc: [],
        },
      }, 'tok-alice'), createRes)
      const cardDbId = JSON.parse(createRes.body).id

      const adoptRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', `/api/workshop/cards/${cardDbId}/adopt`, {
        baseRevision: 1,
        candidate: {
          id: 'factory-ability',
          kind: 'ability',
          prompt: 'factory metadata',
          sourceCode: `
const CARD_ID = 'CUSTOM_FactoryWorkspace'
const CARD_DEF = MinorImprovement({
  id: CARD_ID,
  name: 'Factory Ability',
  desc: ['Factory effect.'],
  cost: { wood: 1 },
  prerequisite: { occupation: 2 },
  vp: 1,
})
const CARD_IMPL = {}
          `.trim(),
          createdAt: 100,
        },
      }, 'tok-alice'), adoptRes)

      expect(adoptRes.statusCode).toBe(200)
      expect(JSON.parse(adoptRes.body).workspace.draft).toMatchObject({
        cardId: 'CUSTOM_FactoryWorkspace',
        cardType: 'minor',
        name: 'Factory Ability',
        cardJson: {
          id: 'CUSTOM_FactoryWorkspace',
          name: 'Factory Ability',
          card_type: 'minor',
          desc: ['Factory effect.'],
          cost: { wood: 1 },
          prerequisite: '2 Occupations',
          occupationPrerequisites: { min: 2 },
          vp: 1,
        },
      })
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
          implemented: true,
          _draft: { costInput: '1w' },
        },
        effect_code: `
const CARD_DEF = {
  cardType: 'minor',
  meta: {
    id: 'CUSTOM_PinnedPublic',
    name: 'Pinned Public',
    deck: 'CUSTOM',
    number: 0,
    desc: ['published text'],
  },
}
const CARD_IMPL = {}
        `.trim(),
      }, 'tok-alice'), createRes)
      const cardDbId = JSON.parse(createRes.body).id

      const adoptRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', `/api/workshop/cards/${cardDbId}/adopt`, {
        baseRevision: 1,
        candidate: {
          id: 'art-public',
          kind: 'art',
          prompt: 'legacy full generation template',
          resultUrl: '/card-art/published.png',
          model: 'secret-model',
          createdAt: 100,
        },
        artInputs: {
          subject: 'current draft subject',
        },
      }, 'tok-alice'), adoptRes)
      expect(JSON.parse(adoptRes.body).workspace).toMatchObject({
        revision: 2,
        draft: {
          generation: {
            art: {
              subject: 'current draft subject',
              adopted: {
                prompt: 'current draft subject',
                promptFormat: 'subject',
              },
            },
          },
        },
      })

      await approveForPublish(cardDbId, 'u1', 2)
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
      expect(publicBeforeRes.body).not.toContain('legacy full generation template')
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
      // live cards cannot be edited (#638): the projection stays immutable
      const blockedRes = mockRes()
      await handleWorkshopRoute(mockReq('PUT', `/api/workshop/cards/${cardDbId}/draft`, {
        baseRevision: workspace.revision,
        draft: changedDraft,
      }, 'tok-alice'), blockedRes)
      expect(blockedRes.statusCode).toBe(409)
      expect(JSON.parse(blockedRes.body)).toMatchObject({
        code: 'live_edit_blocked',
        error: expect.stringContaining('unpublish'),
        current: { revision: workspace.revision, live: true },
      })

      const publicListRes = mockRes()
      await handleWorkshopRoute(mockReq('GET', '/api/workshop/cards'), publicListRes)
      expect(publicListRes.body).not.toContain('generation-time subject')
      expect(publicListRes.body).not.toContain('Unpublished change')

      await handleWorkshopRoute(mockReq('POST', '/api/workshop/sandbox', {
        workshop_card_ids: [cardDbId],
      }, 'tok-bob'), mockRes())
      const sandboxRes = mockRes()
      await handleWorkshopRoute(
        mockReq('GET', '/api/workshop/sandbox', null, 'tok-bob'),
        sandboxRes,
      )
      const sandboxCard = JSON.parse(sandboxRes.body).cards[0]
      expect(sandboxCard.name).toBe('Pinned Public')
      expect(sandboxCard.art_url).toBe('/card-art/published.png')
      expect(sandboxRes.body).not.toContain('Unpublished change')

      // taking the card offline unlocks editing; the fork voids the approval
      await handleWorkshopRoute(mockReq('POST', `/api/workshop/cards/${cardDbId}/unpublish`, {
        baseRevision: workspace.revision,
      }, 'tok-alice'), mockRes())
      await handleWorkshopRoute(mockReq('PUT', `/api/workshop/cards/${cardDbId}/draft`, {
        baseRevision: workspace.revision,
        draft: changedDraft,
      }, 'tok-alice'), mockRes())
      const publicAfterRes = mockRes()
      await handleWorkshopRoute(mockReq('GET', `/api/workshop/cards/${cardDbId}`), publicAfterRes)
      expect(publicAfterRes.statusCode).toBe(404)

      const restoreRes = mockRes()
      await handleWorkshopRoute(mockReq('POST', `/api/workshop/cards/${cardDbId}/restore`, {
        baseRevision: 3,
        versionId,
      }, 'tok-alice'), restoreRes)
      expect(JSON.parse(restoreRes.body).workspace.revision).toBe(4)
      expect((await db.prepare(`
        SELECT COUNT(*) AS count FROM workshop_card_versions WHERE card_id = ?
      `).get(cardDbId))).toEqual({ count: 1 })

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
      expect(data.settings.enable_snake_opening).toBe(false)
    })

    it('persists and reads back enable_snake_opening in sandbox settings', async () => {
      const req = mockReq('POST', '/api/workshop/sandbox', {
        workshop_card_ids: [cardDbId],
        settings: {
          player_count: 3,
          deck_ids: ['A'],
          enable_snake_opening: true,
        },
      }, 'tok-bob')
      const res = mockRes()
      await handleWorkshopRoute(req, res)
      const saved = JSON.parse(res.body)
      expect(saved.ok).toBe(true)
      expect(saved.settings.enable_snake_opening).toBe(true)

      const getReq = mockReq('GET', '/api/workshop/sandbox', null, 'tok-bob')
      const getRes = mockRes()
      await handleWorkshopRoute(getReq, getRes)
      const data = JSON.parse(getRes.body)
      expect(data.settings.enable_snake_opening).toBe(true)
      expect(data.settings.enable_farmers_of_the_moor).toBe(false)

      const offReq = mockReq('POST', '/api/workshop/sandbox', {
        workshop_card_ids: [cardDbId],
        settings: { player_count: 3, deck_ids: ['A'], enable_snake_opening: 'true' },
      }, 'tok-bob')
      const offRes = mockRes()
      await handleWorkshopRoute(offReq, offRes)
      expect(JSON.parse(offRes.body).settings.enable_snake_opening).toBe(false)
    })
  })
})
