/**
 * Workshop -> GitHub PR integration: session-style tests.
 *
 * These tests exercise the full `/api/workshop/cards/:id/submit-review` flow end to
 * end through the real propose-handler / github-client / code-gen composition,
 * with the GitHub API stubbed via `vi.stubGlobal('fetch', ...)`. The database
 * uses an isolated PostgreSQL schema.
 *
 * Covers:
 *   - happy path: first-time propose creates PR, updates DB, audit=success
 *   - upsert: second propose reuses the existing open PR (no new openPr)
 *   - rate limit: second propose within 10 minutes returns 429
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { Socket } from 'node:net'
import { createTestDatabase } from './_helpers/postgres'
import { nanoid } from 'nanoid'

// ── Mock DB (in-memory) ─────────────────────────────────────────────────────

const originalWorkshopKey = process.env.WORKSHOP_TOKEN_ENCRYPTION_KEY
const db = await createTestDatabase()
afterAll(async () => {
  await db.close()
  if (originalWorkshopKey === undefined) delete process.env.WORKSHOP_TOKEN_ENCRYPTION_KEY
  else process.env.WORKSHOP_TOKEN_ENCRYPTION_KEY = originalWorkshopKey
})

vi.mock('../db.ts', () => ({ getDb: () => db, cleanExpiredSessions: () => {} }))

// ── After mocks are in place, import the modules under test ────────────────

import { handleSubmitReviewRequest, handleRefreshPrStatus } from '../workshop-pr/propose-handler.ts'
import { handleOAuthCallback } from '../workshop-pr/oauth-handler.ts'
import { tokenCache } from '../workshop-pr/token-cache.ts'
import { workshopPrConfig } from '../workshop-pr/config.ts'
import { enterReview } from '../workshop-drafts.ts'

// ── HTTP mock helpers ──────────────────────────────────────────────────────

function fakeReq(opts: {
  method: string
  url: string
  authHeader?: string
  mockResult?: string
  body?: string
}): IncomingMessage {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.method = opts.method
  req.url = opts.url
  req.headers = { host: 'localhost:5175' }
  if (opts.authHeader) req.headers.authorization = opts.authHeader
  if (opts.mockResult) req.headers['x-workshop-pr-mock-result'] = opts.mockResult
  if (opts.body) {
    process.nextTick(() => {
      req.push(opts.body!)
      req.push(null)
    })
  } else {
    process.nextTick(() => req.push(null))
  }
  return req
}

type FakeRes = ServerResponse & {
  body: string
  statusCode: number
  headers: Record<string, string | number>
}

function fakeRes(): FakeRes {
  let statusCode = 0
  let body = ''
  const headers: Record<string, string | number> = {}
  return {
    writeHead(code: number, h?: Record<string, string | number>) {
      statusCode = code
      Object.assign(headers, h ?? {})
    },
    end(chunk?: string) {
      body = chunk ?? ''
    },
    get statusCode() {
      return statusCode
    },
    get body() {
      return body
    },
    get headers() {
      return headers
    },
  } as unknown as FakeRes
}

// ── Minimal fake "upstream" register-all.ts / community_cards.md the
//    code-gen patchers must recognise as valid. ────────────────────────────

const FAKE_REGISTER_ALL = `// GENERATED
import './catalog'

import { A001_impl } from './A/A1'

export const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {
  'A1': A001_impl,
}

export type AllCardImpls = typeof ALL_CARD_IMPLS
`

const FAKE_COMMUNITY_MD = `# Community cards

<!-- community-card-entries:begin -->
| ID | Name | Type | Author | PR |
<!-- community-card-entries:end -->
`

const FAKE_CATALOG_GENERATED = `// generated
export const catalogCardDefinitions = [
  {
    "id": "C099_Source",
    "name": "Source",
    "deck": "C",
    "number": 99,
    "desc": [],
    "kind": "minor"
  },
]
`

const legacySmokeSource = (cardId: string): string => `import { describe, it, expect } from 'vitest'
import { ${cardId}, ${cardId}_impl } from '../${cardId}'

describe('${cardId} — community card smoke test', () => {
  it('exports a valid definition', () => {
    expect(${cardId}).toBeDefined()
    expect(${cardId}.id).toBe('${cardId}')
    expect(${cardId}.name).toBeTruthy()
    expect(${cardId}.deck).toBe('community')
  })

  it('exports a CardImpl', () => {
    expect(${cardId}_impl).toBeDefined()
    const hasBehavior =
      !!${cardId}_impl.effect ||
      (${cardId}_impl.listeners?.length ?? 0) > 0 ||
      (${cardId}_impl.modifiers?.length ?? 0) > 0 ||
      (${cardId}.vp ?? 0) > 0
    expect(hasBehavior).toBe(true)
  })
})
`

const addedFilePatch = (content: string): string => {
  const lines = content.trimEnd().split('\n')
  return `@@ -0,0 +1,${lines.length} @@\n${lines.map(line => `+${line}`).join('\n')}`
}

const gitBlobSha = (content: string): string => createHash('sha1')
  .update(`blob ${Buffer.byteLength(content)}\0`)
  .update(content)
  .digest('hex')

// ── GitHub API stub factory ────────────────────────────────────────────────

type StubPr = {
  number: number
  url: string
  baseRefName?: string
  isDraft?: boolean
  state?: 'open' | 'closed'
}

type StubOpts = {
  githubLogin: string
  /** If given and open, findOpenPr returns this PR; openPr call should NOT happen. */
  existingPr?: StubPr | null
  existingPrFiles?: Array<{
    filename: string
    previous_filename?: string
    status: string
    sha: string
    mode?: '100644' | '100755'
    patch?: string
  }>
  upstreamFiles?: Record<string, string>
  /** Used when openPr is invoked. */
  openedPr?: { number: number; url: string }
  openPrStatus?: number
  /** When set, the fork lookup 404s and the fork creation POST fails with this status. */
  forkCreateStatus?: number
}

type StubCounts = {
  openPrCalls: number
  closePrCalls: number
  reopenPrCalls: number
  findPrCalls: number
  blobCalls: number
  commitCalls: number
  treeCalls: number
  treeEntries: Array<Array<{ path: string; sha: string | null; mode: string }>>
  blobContents: Map<string, string>
  mutations: string[]
}

function createGitHubApiStub(opts: StubOpts): {
  fn: (url: string, init?: RequestInit) => Promise<Response>
  counts: StubCounts
} {
  const {
    githubLogin,
    existingPr = null,
    existingPrFiles = [],
    upstreamFiles = {},
    openedPr,
    openPrStatus,
    forkCreateStatus,
  } = opts
  const upstream = `${workshopPrConfig.upstreamOwner}/${workshopPrConfig.upstreamRepo}`
  const counts: StubCounts = {
    openPrCalls: 0,
    closePrCalls: 0,
    reopenPrCalls: 0,
    findPrCalls: 0,
    blobCalls: 0,
    commitCalls: 0,
    treeCalls: 0,
    treeEntries: [],
    blobContents: new Map(),
    mutations: [],
  }

  const fn = (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? 'GET'

    // /user
    if (url.endsWith('/user')) {
      return Promise.resolve(
        new Response(JSON.stringify({ login: githubLogin }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    }

    // Fork check: GET /repos/{login}/{repo} (no /git, no /contents, no /pulls)
    if (
      method === 'GET' &&
      url.match(new RegExp(`/repos/${githubLogin}/[^/]+$`)) &&
      !url.includes('/git/') &&
      !url.includes('/contents/') &&
      !url.includes('/pulls')
    ) {
      if (forkCreateStatus) return Promise.resolve(new Response('{}', { status: 404 }))
      return Promise.resolve(
        new Response(
          JSON.stringify({ full_name: `${githubLogin}/${workshopPrConfig.upstreamRepo}` }),
          { status: 200 },
        ),
      )
    }

    // Fork creation: POST /repos/{upstream}/forks
    if (method === 'POST' && url.endsWith(`/repos/${upstream}/forks`)) {
      return Promise.resolve(new Response('{}', { status: forkCreateStatus ?? 202 }))
    }

    // Upstream contents (generated catalogs, community_cards.md)
    if (url.includes('/contents/shared/cards/register-all.ts')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: Buffer.from(FAKE_REGISTER_ALL).toString('base64'),
            encoding: 'base64',
          }),
          { status: 200 },
        ),
      )
    }
    if (url.includes('/contents/shared/cards/catalog.generated.ts')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: Buffer.from(FAKE_CATALOG_GENERATED).toString('base64'),
            encoding: 'base64',
          }),
          { status: 200 },
        ),
      )
    }
    if (url.includes('/contents/docs/community_cards.md')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            content: Buffer.from(FAKE_COMMUNITY_MD).toString('base64'),
            encoding: 'base64',
          }),
          { status: 200 },
        ),
      )
    }
    const upstreamFilePath = Object.keys(upstreamFiles).find((path) => (
      url.includes(`/contents/${path}?`)
    ))
    if (upstreamFilePath) {
      return Promise.resolve(new Response(JSON.stringify({
        content: Buffer.from(upstreamFiles[upstreamFilePath]!).toString('base64'),
        encoding: 'base64',
      }), { status: 200 }))
    }

    // Upstream main ref
    if (url.includes(`/repos/${upstream}/git/ref/heads/main`)) {
      return Promise.resolve(
        new Response(JSON.stringify({ object: { sha: 'upstream_sha' } }), { status: 200 }),
      )
    }

    // Blob create
    if (url.includes('/git/blobs') && method === 'POST') {
      counts.blobCalls++
      const payload = JSON.parse(String(init?.body)) as { content: string; encoding: string }
      const sha = `blob_${counts.blobCalls}`
      counts.blobContents.set(
        sha,
        payload.encoding === 'base64'
          ? Buffer.from(payload.content, 'base64').toString('utf-8')
          : payload.content,
      )
      return Promise.resolve(
        new Response(JSON.stringify({ sha }), { status: 201 }),
      )
    }

    // Tree create
    if (url.includes('/git/trees') && method === 'POST') {
      counts.treeCalls++
      counts.treeEntries.push((JSON.parse(String(init?.body)) as {
        tree: Array<{ path: string; sha: string | null; mode: string }>
      }).tree)
      return Promise.resolve(
        new Response(JSON.stringify({ sha: 'tree_sha' }), { status: 201 }),
      )
    }

    // Commit create
    if (url.includes('/git/commits') && method === 'POST') {
      counts.commitCalls++
      return Promise.resolve(
        new Response(
          JSON.stringify({ sha: `commit_${counts.commitCalls}` }),
          { status: 201 },
        ),
      )
    }

    if (url.includes('/git/ref/heads/workshop/') && method === 'GET') {
      if (existingPr) {
        return Promise.resolve(new Response(JSON.stringify({
          object: { sha: 'existing_pr_head' },
        }), { status: 200 }))
      }
      return Promise.resolve(new Response('', { status: 404 }))
    }

    // Create ref
    if (url.endsWith('/git/refs') && method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({}), { status: 201 }))
    }

    // Update ref (PATCH /git/refs/heads/workshop/*)
    if (url.includes('/git/refs/heads/workshop/') && method === 'PATCH') {
      counts.mutations.push(`branch:${JSON.parse(String(init?.body)).sha}`)
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    }

    // Find matching PR
    if (url.includes('/pulls?head=') && method === 'GET') {
      counts.findPrCalls++
      const requestedState = new URL(url).searchParams.get('state') ?? 'open'
      const list = [existingPr].filter((pr): pr is StubPr => (
        !!pr && (requestedState === 'all' || requestedState === (pr.state ?? 'open'))
      ))
      return Promise.resolve(
        new Response(
          JSON.stringify(
            list.map((p) => ({
              number: p.number,
              html_url: p.url,
              base: { ref: p.baseRefName ?? 'main' },
              draft: p.isDraft ?? false,
              state: p.state ?? 'open',
              merged_at: null,
            })),
          ),
          { status: 200 },
        ),
      )
    }

    if (url.match(/\/pulls\/\d+\/files/) && method === 'GET') {
      return Promise.resolve(new Response(JSON.stringify(existingPrFiles), { status: 200 }))
    }

    if (url.match(/\/pulls\/\d+$/) && method === 'GET') {
      return Promise.resolve(new Response(JSON.stringify({ head: { sha: 'existing_pr_head' } }), {
        status: 200,
      }))
    }

    if (url.includes('/git/trees/existing_pr_head') && method === 'GET') {
      return Promise.resolve(new Response(JSON.stringify({
        truncated: false,
        tree: existingPrFiles
          .filter(file => file.status !== 'removed')
          .map(file => ({
            path: file.filename,
            mode: file.mode ?? '100644',
            type: 'blob',
          })),
      }), { status: 200 }))
    }

    if (url.match(/\/pulls\/\d+$/) && method === 'PATCH') {
      const state = JSON.parse(String(init?.body ?? '{}')).state
      if (state === 'open') counts.reopenPrCalls++
      if (state === 'closed') counts.closePrCalls++
      counts.mutations.push(state)
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    }

    // Comment on existing PR (issues/:n/comments)
    if (url.match(/\/issues\/\d+\/comments$/) && method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({}), { status: 201 }))
    }

    // Create PR
    if (url.match(/\/repos\/[^/]+\/[^/]+\/pulls$/) && method === 'POST') {
      counts.openPrCalls++
      if (openPrStatus) return Promise.resolve(new Response('', { status: openPrStatus }))
      const pr = openedPr ?? { number: 1, url: 'https://github.com/x/y/pull/1' }
      return Promise.resolve(
        new Response(
          JSON.stringify({ number: pr.number, html_url: pr.url }),
          { status: 201 },
        ),
      )
    }

    return Promise.resolve(
      new Response(`not mocked: ${method} ${url}`, { status: 404 }),
    )
  }

  return { fn, counts }
}

const reviewRequiredProvider = (headRefOid = 'commit_2') => ({
  getPullRequestSnapshot: vi.fn().mockResolvedValue({
    reviewDecision: null,
    headRefOid,
    baseRefName: 'main',
    state: 'OPEN',
    isDraft: false,
    reviews: [],
  }),
})

// ── Test scaffolding ───────────────────────────────────────────────────────

describe('workshop PR propose — session', () => {
  const origClientId = workshopPrConfig.clientId
  const origSecret = workshopPrConfig.clientSecret
  const origEnabled = workshopPrConfig.enabled
  const origMockMode = workshopPrConfig.mockMode
  const origCorsOrigin = process.env.CORS_ORIGIN

  let userId: string
  let userToken: string
  let cardDbId: string
  let versionId: string

  beforeEach(async () => {
    process.env.WORKSHOP_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64')
    ;(workshopPrConfig as unknown as { clientId: string }).clientId = 'test_cid'
    ;(workshopPrConfig as unknown as { clientSecret: string }).clientSecret = 'test_secret'
    ;(workshopPrConfig as unknown as { enabled: boolean }).enabled = true
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = false

    const now = Date.now()
    userId = nanoid()
    userToken = nanoid()
    ;(await db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(userId, `user_${userId.slice(0, 8)}`, 'Test User', 'x', now))
    ;(await db.prepare(
      `INSERT INTO sessions (token, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(userToken, userId, now + 3_600_000, now))

    cardDbId = nanoid()
    const sourceCode = `const CARD_DEF = { cardType: 'minor', meta: { id: 'CUSTOM_TestCard', deck: 'CUSTOM', number: 0, name: 'Test Card', desc: [], cost: {}, vp: 0 } }\nconst CARD_IMPL = {}`
    const codeManifest = JSON.stringify({
      effectHooks: [],
      listeners: [],
      cardDefinition: {
        cardType: 'minor',
        meta: {
          id: 'CUSTOM_TestCard',
          deck: 'CUSTOM',
          number: 0,
          name: 'Test Card',
          desc: [],
          cost: {},
          vp: 0,
        },
      },
    })
    const cardJson = JSON.stringify({
      id: 'CUSTOM_TestCard',
      name: 'Test Card',
      card_type: 'minor',
      deck: 'CUSTOM',
      number: 0,
      desc: [],
      cost: {},
      vp: 0,
      implemented: true,
      locales: {
        zh: {
          name: '测试卡',
          desc: ['测试说明'],
        },
      },
      _code: sourceCode,
      _compiled: '"use strict";',
    })
    ;(await db.prepare(
      `INSERT INTO workshop_cards
         (id, author_id, card_id, card_type, name, description, card_json,
          code_manifest, art_url, review_status, live, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unsubmitted', 0, ?, ?)`,
    ).run(
      cardDbId,
      userId,
      'CUSTOM_TestCard',
      'minor',
      'Test Card',
      'A test card',
      cardJson,
      codeManifest,
      null,
      now,
      now,
    ))
    versionId = nanoid()
    ;(await db.prepare(`
      INSERT INTO workshop_card_versions (
        id, card_id, card_json, code_manifest, art_url, version_number,
        created_by, created_at, content_hash, provenance_json
      ) VALUES (?, ?, ?, ?, NULL, 1, ?, ?, NULL, '{}')
    `).run(versionId, cardDbId, cardJson, codeManifest, userId, now))
    ;(await db.prepare(`
      UPDATE workshop_cards
      SET sandbox_pass_version_id = ?, sandbox_passed_at = ?
      WHERE id = ?
    `).run(versionId, now, cardDbId))

    ;(await db.prepare(`DELETE FROM github_propose_rate_limit WHERE user_id = ?`).run(userId))
    ;(await db.prepare(`DELETE FROM github_propose_audit WHERE user_id = ?`).run(userId))
  })

  afterEach(async () => {
    ;(await db.prepare(`DELETE FROM github_propose_audit WHERE user_id = ?`).run(userId))
    ;(await db.prepare(`DELETE FROM github_propose_rate_limit WHERE user_id = ?`).run(userId))
    ;(await db.prepare(`DELETE FROM workshop_cards WHERE id = ?`).run(cardDbId))
    ;(await db.prepare(`DELETE FROM sessions WHERE token = ?`).run(userToken))
    ;(await db.prepare(`DELETE FROM users WHERE id = ?`).run(userId))

    ;(workshopPrConfig as unknown as { clientId: string }).clientId = origClientId
    ;(workshopPrConfig as unknown as { clientSecret: string }).clientSecret = origSecret
    ;(workshopPrConfig as unknown as { enabled: boolean }).enabled = origEnabled
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = origMockMode
    if (origCorsOrigin === undefined) delete process.env.CORS_ORIGIN
    else process.env.CORS_ORIGIN = origCorsOrigin

    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  // ── C-24: happy path ─────────────────────────────────────────────────────

  it('rejects before OAuth when the published version has no matching sandbox pass', async () => {
    ;(await db.prepare(`
      UPDATE workshop_cards SET sandbox_pass_version_id = NULL, sandbox_passed_at = NULL
      WHERE id = ?
    `).run(cardDbId))
    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res = fakeRes()

    await handleSubmitReviewRequest(req, res, cardDbId)

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({
      ok: false,
      code: 'handoff_not_ready',
      readiness: {
        ready: false,
        sandboxPassedForDraft: false,
      },
    })
  })

  it('returns a deterministic PR result without OAuth in mock mode', async () => {
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = true
    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res = fakeRes()

    await handleSubmitReviewRequest(req, res, cardDbId)

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      ok: true,
      prUrl: '/mock-workshop-pr/1',
      prNumber: 1,
    })
    expect((await db.prepare(`
      SELECT github_pr_url, github_pr_status, review_status, live
      FROM workshop_cards WHERE id = ?
    `).get(cardDbId))).toEqual({
      github_pr_url: '/mock-workshop-pr/1',
      github_pr_status: 'open',
      review_status: 'in_review',
      live: 0,
    })
  })

  it('rejects submission for approved and merged cards until the draft is edited', async () => {
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = true
    ;(await db.prepare(`UPDATE workshop_cards SET review_status = 'approved' WHERE id = ?`).run(cardDbId))
    const res = fakeRes()
    await handleSubmitReviewRequest(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    }), res, cardDbId)
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: 'already_reviewed' })
  })

  it('rejects submission when the card id is reserved by an approved card', async () => {
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = true
    const now = Date.now()
    ;(await db.prepare(`
      INSERT INTO workshop_cards
        (id, author_id, card_id, card_type, name, description, card_json,
         review_status, live, created_at, updated_at)
      VALUES ('rival-card', ?, 'CUSTOM_TestCard', 'minor', 'Rival', '', '{"id":"CUSTOM_TestCard"}',
              'approved', 0, ?, ?)
    `).run(userId, now, now))
    try {
      const res = fakeRes()
      await handleSubmitReviewRequest(fakeReq({
        method: 'POST',
        url: `/api/workshop/cards/${cardDbId}/submit-review`,
        authHeader: `Bearer ${userToken}`,
        body: JSON.stringify({}),
      }), res, cardDbId)
      expect(res.statusCode).toBe(409)
      expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: 'card_id_taken' })
    } finally {
      ;(await db.prepare(`DELETE FROM workshop_cards WHERE id = 'rival-card'`).run())
    }
  })

  it('rejects proposals without complete Chinese localization before mock handoff', async () => {
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = true
    const current = (await db.prepare(
      'SELECT card_json FROM workshop_cards WHERE id = ?',
    ).get(cardDbId)) as { card_json: string }
    const cardJson = JSON.parse(current.card_json) as Record<string, unknown>
    delete cardJson.locales
    const serialised = JSON.stringify(cardJson)
    ;(await db.prepare('UPDATE workshop_cards SET card_json = ? WHERE id = ?')
      .run(serialised, cardDbId))
    ;(await db.prepare('UPDATE workshop_card_versions SET card_json = ? WHERE id = ?')
      .run(serialised, versionId))

    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res = fakeRes()

    await handleSubmitReviewRequest(req, res, cardDbId)

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({
      ok: false,
      code: 'localization_not_ready',
    })
  })

  it.each([
    ['rate-limited', 429, 'rate_limited'],
    ['remote-error', 503, 'github_unavailable'],
  ])('returns deterministic %s failures in mock mode', async (mockResult, status, code) => {
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = true
    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      mockResult,
      body: JSON.stringify({}),
    })
    const res = fakeRes()

    await handleSubmitReviewRequest(req, res, cardDbId)

    expect(res.statusCode).toBe(status)
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code })
    expect((await db.prepare(
      'SELECT github_pr_url FROM workshop_cards WHERE id = ?',
    ).get(cardDbId))).toEqual({ github_pr_url: null })
  })

  it('happy path: first-time propose creates PR and reconciles an early approval', async () => {
    process.env.CORS_ORIGIN = 'https://frontend.example'
    // Phase 1 — no handshakeId yet → 200 { needsAuth: true, handshakeId }
    const req1 = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res1 = fakeRes()
    await handleSubmitReviewRequest(req1, res1, cardDbId, reviewRequiredProvider())
    expect(res1.statusCode).toBe(200)
    expect(res1.headers['Access-Control-Allow-Origin']).toBe('https://frontend.example')
    expect(res1.headers['Access-Control-Allow-Credentials']).toBe('true')
    const j1 = JSON.parse(res1.body) as {
      ok: false
      needsAuth: true
      authUrl: string
      handshakeId: string
    }
    expect(j1.needsAuth).toBe(true)
    expect(j1.handshakeId).toBeTruthy()
    expect(j1.authUrl).toContain('/api/workshop/github/oauth/start')

    // Simulate OAuth callback: stub the token-exchange fetch, then invoke the
    // callback handler to bind the token to the handshake id.
    vi.stubGlobal('fetch', (url: string) => {
      if (typeof url === 'string' && url.includes('github.com/login/oauth/access_token')) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'ghp_mock' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
      }
      return Promise.resolve(new Response('', { status: 404 }))
    })
    const cbUrl = `/api/workshop/github/oauth/callback?code=abc&state=${encodeURIComponent(j1.handshakeId)}`
    const reqCb = fakeReq({ method: 'GET', url: cbUrl })
    const resCb = fakeRes()
    await handleOAuthCallback(reqCb, resCb, new URL(`http://host${cbUrl}`))
    expect((await tokenCache.get(j1.handshakeId))).toEqual({
      token: 'ghp_mock',
      userId,
    })

    // Phase 2 — full GitHub API stubbed.
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    const { fn: gh, counts } = createGitHubApiStub({
      githubLogin: 'workshopuser',
      openedPr: {
        number: 42,
        url: 'https://github.com/titanxxh/open-agricola/pull/42',
      },
    })
    vi.stubGlobal('fetch', gh)

    const req2 = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: j1.handshakeId }),
    })
    const res2 = fakeRes()
    const reviewProvider = {
      getPullRequestSnapshot: vi.fn().mockResolvedValue({
        reviewDecision: 'APPROVED',
        headRefOid: 'commit_2',
        baseRefName: 'main',
        state: 'OPEN',
        isDraft: false,
        reviews: [{
          id: 'early-review',
          state: 'APPROVED',
          commitOid: 'commit_2',
          authorCanPushToRepository: true,
        }],
      }),
    }
    await handleSubmitReviewRequest(
      req2,
      res2,
      cardDbId,
      reviewProvider,
    )
    expect(res2.statusCode).toBe(200)
    const j2 = JSON.parse(res2.body) as {
      ok: boolean
      prUrl: string
      prNumber: number
      code?: string
      message?: string
    }
    expect(j2).toMatchObject({
      ok: true,
      prUrl: expect.stringContaining('/pull/42'),
      prNumber: 42,
    })

    // openPr should have been called exactly once (first-time PR).
    expect(counts.openPrCalls).toBe(1)
    // Two commits (V1 + V2) → two commit calls.
    expect(counts.commitCalls).toBe(2)

    // DB state: PR URL + status set.
    const row = (await db
      .prepare(
        `SELECT github_pr_url, github_pr_status, review_status
         FROM workshop_cards WHERE id = ?`,
      )
      .get(cardDbId)) as {
        github_pr_url: string
        github_pr_status: string
        review_status: string
      }
    expect(row.github_pr_url).toContain('/pull/42')
    expect(row.github_pr_status).toBe('open')
    expect(row.review_status).toBe('approved')
    expect(reviewProvider.getPullRequestSnapshot).toHaveBeenCalledWith(42)

    // Audit log: start + success.
    const audits = (await db
      .prepare(
        `SELECT action FROM github_propose_audit
         WHERE workshop_card_id = ? ORDER BY created_at ASC, action ASC`,
      )
      .all(cardDbId)) as Array<{ action: string }>
    expect(audits.map((a) => a.action)).toEqual(['start', 'success'])

    // Rate-limit row inserted.
    const rate = (await db
      .prepare(
        `SELECT last_propose_at FROM github_propose_rate_limit WHERE user_id = ?`,
      )
      .get(userId)) as { last_propose_at: number } | undefined
    expect(rate?.last_propose_at).toBeGreaterThan(0)
  })

  it('rejects a real submission when the review runtime is unavailable', async () => {
    const res = fakeRes()
    await handleSubmitReviewRequest(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    }), res, cardDbId)

    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body)).toMatchObject({
      ok: false,
      code: 'github_review_unavailable',
    })
  })

  it('keeps the PR submission successful when post-bind reconciliation fails', async () => {
    const hs = (await tokenCache.allocateHandshakeId(userId))
    ;(await tokenCache.bind(hs, 'ghp_mock'))
    const { fn: gh } = createGitHubApiStub({
      githubLogin: 'workshopuser',
      openedPr: {
        number: 42,
        url: 'https://github.com/titanxxh/open-agricola/pull/42',
      },
    })
    vi.stubGlobal('fetch', gh)
    const res = fakeRes()

    await handleSubmitReviewRequest(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: hs }),
    }), res, cardDbId, {
      getPullRequestSnapshot: vi.fn().mockRejectedValue(new Error('temporary failure')),
    })

    expect(JSON.parse(res.body)).toMatchObject({
      ok: true,
      prNumber: 42,
      reconciliationPending: true,
    })
    expect((await db.prepare(
      'SELECT review_status FROM workshop_cards WHERE id = ?',
    ).get(cardDbId))).toEqual({ review_status: 'in_review' })
    expect((await db.prepare(
      `SELECT action FROM github_propose_audit
       WHERE workshop_card_id = ? ORDER BY created_at, action ASC`,
    ).all(cardDbId))).toEqual([{ action: 'start' }, { action: 'success' }])
  })

  // ── C-25: upsert path ────────────────────────────────────────────────────

  it.each([
    [
      'manual behavior test',
      "@@ -0,0 +1 @@\n+it('reduces the room cost through GameSession')",
      true,
      'existing-test-sha',
    ],
    [
      'legacy smoke extended with test()',
      addedFilePatch(legacySmokeSource('CUSTOM_TestCard').replace(
        '\n})\n',
        "\n  test('reduces the room cost through GameSession', () => {})\n})\n",
      )),
      true,
      'extended-test-sha',
    ],
    [
      'legacy smoke with behavior inside an original test',
      addedFilePatch(legacySmokeSource('CUSTOM_TestCard').replace(
        'expect(CUSTOM_TestCard_impl).toBeDefined()',
        'expect(CUSTOM_TestCard_impl.listeners).toHaveLength(1)',
      )),
      true,
      gitBlobSha(legacySmokeSource('CUSTOM_TestCard').replace(
        'expect(CUSTOM_TestCard_impl).toBeDefined()',
        'expect(CUSTOM_TestCard_impl.listeners).toHaveLength(1)',
      )),
    ],
    [
      'legacy generated smoke test',
      addedFilePatch(legacySmokeSource('CUSTOM_TestCard')),
      false,
      gitBlobSha(legacySmokeSource('CUSTOM_TestCard')),
    ],
  ])('upsert: reuses the existing PR and handles its %s', async (
    _case,
    patch,
    shouldPreserveTest,
    testSha,
  ) => {
    // Pretend this card already has an open PR from a previous propose.
    ;(await db.prepare(
      `UPDATE workshop_cards
       SET github_pr_url = ?, github_pr_status = 'open'
       WHERE id = ?`,
    ).run('https://github.com/titanxxh/open-agricola/pull/99', cardDbId))
    ;(await db.prepare(`DELETE FROM github_propose_rate_limit WHERE user_id = ?`).run(userId))

    // Bind a token directly — skip the OAuth round-trip.
    const hs = (await tokenCache.allocateHandshakeId(userId))
    ;(await tokenCache.bind(hs, 'ghp_mock'))

    const { fn: gh, counts } = createGitHubApiStub({
      githubLogin: 'workshopuser',
      existingPr: {
        number: 99,
        url: 'https://github.com/titanxxh/open-agricola/pull/99',
      },
      existingPrFiles: [
        {
          filename: 'shared/cards/community/__tests__/CUSTOM_TestCard.test.ts',
          status: 'added',
          sha: testSha,
          patch,
        },
        {
          filename: 'public/card-art/community/CUSTOM_TestCard.webp',
          status: 'added',
          sha: 'obsolete-art-sha',
        },
        {
          filename: 'public/card-art/community/CUSTOM_TestCard.license.txt',
          status: 'added',
          sha: 'art-license-sha',
        },
      ],
    })
    vi.stubGlobal('fetch', gh)

    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: hs }),
    })
    const res = fakeRes()
    await handleSubmitReviewRequest(req, res, cardDbId, reviewRequiredProvider())
    expect(res.statusCode).toBe(200)
    const j = JSON.parse(res.body) as {
      ok: boolean
      prUrl: string
      prNumber: number
      code?: string
      message?: string
    }
    expect(j).toMatchObject({ ok: true, prNumber: 99 })
    expect(j.prUrl).toContain('/pull/99')

    // No new PR opened.
    expect(counts.openPrCalls).toBe(0)
    // Commits still happen (V1 + V2).
    expect(counts.commitCalls).toBe(2)
    expect(counts.treeEntries).toHaveLength(2)
    expect(counts.treeEntries.every(entries => entries.some(entry => (
      entry.path === 'shared/cards/community/__tests__/CUSTOM_TestCard.test.ts'
    )))).toBe(shouldPreserveTest)
    expect(counts.treeEntries.every(entries => !entries.some(entry => (
      entry.path === 'public/card-art/community/CUSTOM_TestCard.webp'
    )))).toBe(true)
    expect(counts.treeEntries.every(entries => entries.some(entry => (
      entry.path === 'public/card-art/community/CUSTOM_TestCard.license.txt'
    )))).toBe(true)

    // github_pr_url sticks to pull/99.
    const row = (await db
      .prepare(`SELECT github_pr_url FROM workshop_cards WHERE id = ?`)
      .get(cardDbId)) as { github_pr_url: string }
    expect(row.github_pr_url).toContain('/pull/99')

    const audits = (await db
      .prepare(
        `SELECT action FROM github_propose_audit
         WHERE workshop_card_id = ? ORDER BY created_at ASC, action ASC`,
      )
      .all(cardDbId)) as Array<{ action: string }>
    expect(audits.map((a) => a.action)).toEqual(['start', 'success'])
  })

  it('creates a new PR instead of reopening a closed one', async () => {
    ;(await db.prepare(
      `UPDATE workshop_cards
       SET github_pr_url = ?, github_pr_status = 'closed'
       WHERE id = ?`,
    ).run('https://github.com/titanxxh/open-agricola/pull/99', cardDbId))
    const hs = (await tokenCache.allocateHandshakeId(userId))
    ;(await tokenCache.bind(hs, 'ghp_mock'))
    const { fn: gh, counts } = createGitHubApiStub({
      githubLogin: 'workshopuser',
      existingPr: {
        number: 99,
        url: 'https://github.com/titanxxh/open-agricola/pull/99',
        state: 'closed',
      },
      openedPr: {
        number: 100,
        url: 'https://github.com/titanxxh/open-agricola/pull/100',
      },
    })
    vi.stubGlobal('fetch', gh)
    const res = fakeRes()

    await handleSubmitReviewRequest(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: hs }),
    }), res, cardDbId, reviewRequiredProvider())

    expect(JSON.parse(res.body)).toMatchObject({ ok: true, prNumber: 100 })
    expect(counts.closePrCalls).toBe(0)
    expect(counts.reopenPrCalls).toBe(0)
    expect(counts.openPrCalls).toBe(1)
  })

  it.each([
    ['draft', { isDraft: true }],
    ['non-main', { baseRefName: 'release' }],
  ])('replaces an existing %s PR before rebinding', async (_case, existingPrState) => {
    const hs = (await tokenCache.allocateHandshakeId(userId))
    ;(await tokenCache.bind(hs, 'ghp_mock'))
    const { fn: gh, counts } = createGitHubApiStub({
      githubLogin: 'workshopuser',
      existingPr: {
        number: 99,
        url: 'https://github.com/titanxxh/open-agricola/pull/99',
        ...existingPrState,
      },
      existingPrFiles: [{
        filename: 'server/__tests__/CUSTOM_TestCard-session.test.ts',
        status: 'added',
        sha: 'manual-test-sha',
        patch: "@@ -0,0 +1 @@\n+test('real behavior', () => {})",
      }],
      openedPr: {
        number: 100,
        url: 'https://github.com/titanxxh/open-agricola/pull/100',
      },
    })
    vi.stubGlobal('fetch', gh)
    const res = fakeRes()

    await handleSubmitReviewRequest(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: hs }),
    }), res, cardDbId, reviewRequiredProvider())

    expect(JSON.parse(res.body)).toMatchObject({ ok: true, prNumber: 100 })
    expect(counts.closePrCalls).toBe(1)
    expect(counts.openPrCalls).toBe(1)
    expect(counts.treeEntries.every(entries => entries.some(entry => (
      entry.path === 'server/__tests__/CUSTOM_TestCard-session.test.ts'
    )))).toBe(true)
  })

  it('reports the GitHub HTTP status when the fork cannot be created', async () => {
    const hs = (await tokenCache.allocateHandshakeId(userId))
    ;(await tokenCache.bind(hs, 'ghp_mock'))
    const { fn: gh } = createGitHubApiStub({
      githubLogin: 'workshopuser',
      forkCreateStatus: 404,
    })
    vi.stubGlobal('fetch', gh)
    const res = fakeRes()

    await handleSubmitReviewRequest(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: hs }),
    }), res, cardDbId, reviewRequiredProvider())

    // Without the status the client cannot tell "repo is invisible to this
    // account" (404) from "GitHub refused the fork" (403).
    expect(JSON.parse(res.body)).toMatchObject({
      ok: false,
      code: 'fork_create_failed',
      status: 404,
    })
    const audit = (await db.prepare(
      `SELECT error_message FROM github_propose_audit
       WHERE workshop_card_id = ? AND action = 'fail'
       ORDER BY created_at DESC LIMIT 1`,
    ).get(cardDbId)) as { error_message: string }
    expect(audit.error_message).toContain('HTTP 404')
  })

  it('restores and reopens a non-main source PR when opening its replacement fails', async () => {
    const hs = (await tokenCache.allocateHandshakeId(userId))
    ;(await tokenCache.bind(hs, 'ghp_mock'))
    const { fn: gh, counts } = createGitHubApiStub({
      githubLogin: 'workshopuser',
      existingPr: {
        number: 99,
        url: 'https://github.com/titanxxh/open-agricola/pull/99',
        baseRefName: 'release',
      },
      existingPrFiles: [{
        filename: 'server/__tests__/CUSTOM_TestCard-session.test.ts',
        status: 'added',
        sha: 'manual-test-sha',
        patch: "@@ -0,0 +1 @@\n+test('real behavior', () => {})",
      }],
      openPrStatus: 503,
    })
    vi.stubGlobal('fetch', gh)
    const res = fakeRes()

    await handleSubmitReviewRequest(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: hs }),
    }), res, cardDbId, reviewRequiredProvider())

    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: 'pr_create_failed' })
    expect(counts.closePrCalls).toBe(1)
    expect(counts.reopenPrCalls).toBe(1)
    expect(counts.mutations).toEqual([
      'branch:commit_1',
      'closed',
      'branch:existing_pr_head',
      'open',
    ])
  })

  it('replays preserved test edits onto the current main file', async () => {
    const hs = (await tokenCache.allocateHandshakeId(userId))
    ;(await tokenCache.bind(hs, 'ghp_mock'))
    const testPath = 'server/__tests__/CUSTOM_TestCard-session.test.ts'
    const { fn: gh, counts } = createGitHubApiStub({
      githubLogin: 'workshopuser',
      existingPr: {
        number: 99,
        url: 'https://github.com/titanxxh/open-agricola/pull/99',
      },
      existingPrFiles: [{
        filename: testPath,
        status: 'modified',
        sha: 'old-pr-blob',
        patch: "@@ -1,3 +1,4 @@\n import { it } from 'vitest'\n \n it('existing', () => {})\n+it('manual behavior', () => {})",
      }],
      upstreamFiles: {
        [testPath]: "import { it } from 'vitest'\n\nit('existing', () => {})\n\nconst upstreamAddition = true\n",
      },
    })
    vi.stubGlobal('fetch', gh)
    const res = fakeRes()

    await handleSubmitReviewRequest(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: hs }),
    }), res, cardDbId, reviewRequiredProvider())

    expect(res.statusCode).toBe(200)
    const preservedBlobs = [...counts.blobContents.values()].filter(content => (
      content.includes("it('manual behavior'")
    ))
    expect(preservedBlobs).toHaveLength(2)
    expect(preservedBlobs.every(content => content.includes('const upstreamAddition = true'))).toBe(true)
  })

  it('keeps a replacement PR open when its preserved patch cannot be rebased', async () => {
    const hs = (await tokenCache.allocateHandshakeId(userId))
    ;(await tokenCache.bind(hs, 'ghp_mock'))
    const { fn: gh, counts } = createGitHubApiStub({
      githubLogin: 'workshopuser',
      existingPr: {
        number: 99,
        url: 'https://github.com/titanxxh/open-agricola/pull/99',
        isDraft: true,
      },
      existingPrFiles: [{
        filename: 'server/__tests__/CUSTOM_TestCard-session.test.ts',
        status: 'modified',
        sha: 'manual-test-sha',
      }],
    })
    vi.stubGlobal('fetch', gh)
    const res = fakeRes()

    await handleSubmitReviewRequest(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: hs }),
    }), res, cardDbId, reviewRequiredProvider())

    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: 'pr_patch_unavailable' })
    expect(counts.closePrCalls).toBe(0)
    expect(counts.openPrCalls).toBe(0)
  })

  it('reconciles a missed approval through the existing refresh endpoint', async () => {
    const prUrl = 'https://github.com/titanxxh/open-agricola/pull/42'
    ;(await enterReview(db, {
      cardId: cardDbId,
      authorId: userId,
      prUrl,
      expectedRevision: 1,
      commitSha: 'review-head',
    }))
    ;(await db.prepare(
      'UPDATE workshop_cards SET github_pr_last_synced_at = NULL WHERE id = ?',
    ).run(cardDbId))
    const res = fakeRes()

    await handleRefreshPrStatus(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/refresh-pr-status`,
      authHeader: `Bearer ${userToken}`,
    }), res, cardDbId, {
      getPullRequestSnapshot: vi.fn().mockResolvedValue({
        reviewDecision: 'APPROVED',
        headRefOid: 'review-head',
        baseRefName: 'main',
        state: 'OPEN',
        isDraft: false,
        reviews: [{
          id: 'missed-approval',
          state: 'APPROVED',
          commitOid: 'review-head',
          authorCanPushToRepository: true,
        }],
      }),
    })

    expect(JSON.parse(res.body)).toEqual({ ok: true, status: 'open' })
    expect((await db.prepare(
      'SELECT review_status FROM workshop_cards WHERE id = ?',
    ).get(cardDbId))).toEqual({ review_status: 'approved' })
  })

  it('invalidates an approved card when no authorized head approval remains', async () => {
    const prUrl = 'https://github.com/titanxxh/open-agricola/pull/42'
    ;(await enterReview(db, {
      cardId: cardDbId,
      authorId: userId,
      prUrl,
      expectedRevision: 1,
      commitSha: 'review-head',
    }))
    ;(await db.prepare(`
      UPDATE workshop_cards
      SET review_status = 'approved',
          live = 1,
          approved_commit_sha = 'review-head',
          approved_version_id = review_version_id,
          github_pr_last_synced_at = NULL
      WHERE id = ?
    `).run(cardDbId))
    const res = fakeRes()

    await handleRefreshPrStatus(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/refresh-pr-status`,
      authHeader: `Bearer ${userToken}`,
    }), res, cardDbId, {
      getPullRequestSnapshot: vi.fn().mockResolvedValue({
        reviewDecision: null,
        headRefOid: 'review-head',
        baseRefName: 'main',
        state: 'OPEN',
        isDraft: false,
        reviews: [{
          id: 'revoked-approval',
          state: 'APPROVED',
          commitOid: 'review-head',
          authorCanPushToRepository: false,
        }],
      }),
    })

    expect(JSON.parse(res.body)).toEqual({ ok: true, status: 'open' })
    expect((await db.prepare(
      'SELECT review_status, live FROM workshop_cards WHERE id = ?',
    ).get(cardDbId))).toEqual({ review_status: 'stale', live: 0 })
  })

  it('graduates a merged approved snapshot through the refresh endpoint', async () => {
    // Both the approval and merge webhooks were missed: refresh sees an
    // approved MERGED snapshot. The head is frozen after merge, so the #629
    // SHA binding stays verifiable and the card graduates in one pass.
    const prUrl = 'https://github.com/titanxxh/open-agricola/pull/42'
    ;(await enterReview(db, {
      cardId: cardDbId,
      authorId: userId,
      prUrl,
      expectedRevision: 1,
      commitSha: 'review-head',
    }))
    ;(await db.prepare(
      'UPDATE workshop_cards SET github_pr_last_synced_at = NULL WHERE id = ?',
    ).run(cardDbId))
    const res = fakeRes()

    await handleRefreshPrStatus(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/refresh-pr-status`,
      authHeader: `Bearer ${userToken}`,
    }), res, cardDbId, {
      getPullRequestSnapshot: vi.fn().mockResolvedValue({
        reviewDecision: 'APPROVED',
        headRefOid: 'review-head',
        baseRefName: 'main',
        state: 'MERGED',
        isDraft: false,
        reviews: [{
          id: 'missed-approval',
          state: 'APPROVED',
          commitOid: 'review-head',
          authorCanPushToRepository: true,
        }],
      }),
    })

    expect(JSON.parse(res.body)).toEqual({ ok: true, status: 'merged' })
    expect((await db.prepare(
      'SELECT review_status, github_pr_status FROM workshop_cards WHERE id = ?',
    ).get(cardDbId))).toEqual({ review_status: 'merged', github_pr_status: 'merged' })
  })

  it('demotes a card whose PR merged outside main through the refresh endpoint', async () => {
    const prUrl = 'https://github.com/titanxxh/open-agricola/pull/42'
    ;(await enterReview(db, {
      cardId: cardDbId,
      authorId: userId,
      prUrl,
      expectedRevision: 1,
      commitSha: 'review-head',
    }))
    ;(await db.prepare(
      'UPDATE workshop_cards SET github_pr_last_synced_at = NULL WHERE id = ?',
    ).run(cardDbId))
    const res = fakeRes()

    await handleRefreshPrStatus(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/refresh-pr-status`,
      authHeader: `Bearer ${userToken}`,
    }), res, cardDbId, {
      getPullRequestSnapshot: vi.fn().mockResolvedValue({
        reviewDecision: 'APPROVED',
        headRefOid: 'review-head',
        baseRefName: 'release',
        state: 'MERGED',
        isDraft: false,
        reviews: [{
          id: 'retargeted-approval',
          state: 'APPROVED',
          commitOid: 'review-head',
          authorCanPushToRepository: true,
        }],
      }),
    })

    // merged outside main is no graduation: the card demotes and the status
    // reads 'closed' so no false pending-merge fact is persisted
    expect(JSON.parse(res.body)).toEqual({ ok: true, status: 'closed' })
    expect((await db.prepare(
      'SELECT review_status, github_pr_status FROM workshop_cards WHERE id = ?',
    ).get(cardDbId))).toEqual({ review_status: 'stale', github_pr_status: 'closed' })
  })

  it('invalidates a moved review head through the existing refresh endpoint', async () => {
    const prUrl = 'https://github.com/titanxxh/open-agricola/pull/42'
    ;(await enterReview(db, {
      cardId: cardDbId,
      authorId: userId,
      prUrl,
      expectedRevision: 1,
      commitSha: 'review-head',
    }))
    ;(await db.prepare(
      'UPDATE workshop_cards SET github_pr_last_synced_at = NULL WHERE id = ?',
    ).run(cardDbId))
    const res = fakeRes()

    await handleRefreshPrStatus(fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/refresh-pr-status`,
      authHeader: `Bearer ${userToken}`,
    }), res, cardDbId, reviewRequiredProvider('moved-head'))

    expect(JSON.parse(res.body)).toEqual({ ok: true, status: 'open' })
    expect((await db.prepare(
      'SELECT review_status FROM workshop_cards WHERE id = ?',
    ).get(cardDbId))).toEqual({ review_status: 'stale' })
  })

  // ── C-26: rate limit ─────────────────────────────────────────────────────

  it('rate limit: second propose within 10 minutes returns 429', async () => {
    const now = Date.now()
    ;(await db.prepare(
      `INSERT INTO github_propose_rate_limit (user_id, last_propose_at)
       VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET last_propose_at = excluded.last_propose_at`,
    ).run(userId, now))

    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/submit-review`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res = fakeRes()
    await handleSubmitReviewRequest(req, res, cardDbId, reviewRequiredProvider())
    expect(res.statusCode).toBe(429)
    const j = JSON.parse(res.body) as {
      ok: boolean
      code: string
      retryAfter: number
    }
    expect(j.code).toBe('rate_limited')
    expect(j.retryAfter).toBeGreaterThan(0)
    expect(j.retryAfter).toBeLessThanOrEqual(600) // 10 minutes
  })

  it('refresh status responses use credentialed CORS headers', async () => {
    process.env.CORS_ORIGIN = 'https://frontend.example'
    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/refresh-pr-status`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res = fakeRes()
    await handleRefreshPrStatus(req, res, cardDbId)

    expect(res.statusCode).toBe(404)
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://frontend.example')
    expect(res.headers['Access-Control-Allow-Credentials']).toBe('true')
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, error: 'no PR' })
  })
})
