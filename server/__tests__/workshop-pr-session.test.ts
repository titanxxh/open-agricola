/**
 * Workshop -> GitHub PR integration: session-style tests.
 *
 * These tests exercise the full `/api/workshop/cards/:id/propose` flow end to
 * end through the real propose-handler / github-client / code-gen composition,
 * with the GitHub API stubbed via `vi.stubGlobal('fetch', ...)`. The database
 * is an in-memory SQLite instance.
 *
 * Covers:
 *   - happy path: first-time propose creates PR, updates DB, audit=success
 *   - upsert: second propose reuses the existing open PR (no new openPr)
 *   - rate limit: second propose within 10 minutes returns 429
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'

// ── Mock DB (in-memory) ─────────────────────────────────────────────────────

const db = new Database(':memory:')
db.pragma('foreign_keys = ON')
db.exec(`
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_login_at INTEGER
  );
  CREATE TABLE sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE workshop_cards (
    id TEXT PRIMARY KEY,
    author_id TEXT NOT NULL REFERENCES users(id),
    card_id TEXT NOT NULL,
    card_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    card_json TEXT NOT NULL,
    code_manifest TEXT,
    art_url TEXT,
    art_prompt TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    featured INTEGER NOT NULL DEFAULT 0,
    github_pr_url TEXT,
    github_pr_status TEXT,
    github_pr_last_synced_at INTEGER,
    draft_revision INTEGER NOT NULL DEFAULT 1,
    draft_generation_json TEXT NOT NULL DEFAULT '{}',
    published_version_id TEXT,
    sandbox_pass_version_id TEXT,
    sandbox_passed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE workshop_card_versions (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES workshop_cards(id) ON DELETE CASCADE,
    card_json TEXT NOT NULL,
    code_manifest TEXT,
    art_url TEXT,
    version_number INTEGER NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    content_hash TEXT,
    provenance_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE github_propose_rate_limit (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    last_propose_at INTEGER NOT NULL
  );
  CREATE TABLE github_propose_audit (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    workshop_card_id TEXT NOT NULL,
    action TEXT NOT NULL,
    pr_url TEXT,
    error_code TEXT,
    error_message TEXT,
    created_at INTEGER NOT NULL
  );
`)

vi.mock('../db.ts', () => ({ getDb: () => db, cleanExpiredSessions: () => {} }))

// ── After mocks are in place, import the modules under test ────────────────

import { handleProposeRequest, handleRefreshPrStatus } from '../workshop-pr/propose-handler.ts'
import { handleOAuthCallback } from '../workshop-pr/oauth-handler.ts'
import { tokenCache } from '../workshop-pr/token-cache.ts'
import { workshopPrConfig } from '../workshop-pr/config.ts'

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

// ── GitHub API stub factory ────────────────────────────────────────────────

type StubOpts = {
  githubLogin: string
  /** If given, findOpenPr returns this PR; openPr call should NOT happen. */
  existingPr?: { number: number; url: string } | null
  /** Used when openPr is invoked. */
  openedPr?: { number: number; url: string }
}

type StubCounts = {
  openPrCalls: number
  findPrCalls: number
  blobCalls: number
  commitCalls: number
  treeCalls: number
}

function createGitHubApiStub(opts: StubOpts): {
  fn: (url: string, init?: RequestInit) => Promise<Response>
  counts: StubCounts
} {
  const { githubLogin, existingPr = null, openedPr } = opts
  const upstream = `${workshopPrConfig.upstreamOwner}/${workshopPrConfig.upstreamRepo}`
  const counts: StubCounts = {
    openPrCalls: 0,
    findPrCalls: 0,
    blobCalls: 0,
    commitCalls: 0,
    treeCalls: 0,
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
      return Promise.resolve(
        new Response(
          JSON.stringify({ full_name: `${githubLogin}/${workshopPrConfig.upstreamRepo}` }),
          { status: 200 },
        ),
      )
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

    // Upstream main ref
    if (url.includes(`/repos/${upstream}/git/ref/heads/main`)) {
      return Promise.resolve(
        new Response(JSON.stringify({ object: { sha: 'upstream_sha' } }), { status: 200 }),
      )
    }

    // Blob create
    if (url.includes('/git/blobs') && method === 'POST') {
      counts.blobCalls++
      return Promise.resolve(
        new Response(
          JSON.stringify({ sha: `blob_${Math.random().toString(36).slice(2, 8)}` }),
          { status: 201 },
        ),
      )
    }

    // Tree create
    if (url.includes('/git/trees') && method === 'POST') {
      counts.treeCalls++
      return Promise.resolve(
        new Response(JSON.stringify({ sha: 'tree_sha' }), { status: 201 }),
      )
    }

    // Commit create
    if (url.includes('/git/commits') && method === 'POST') {
      counts.commitCalls++
      return Promise.resolve(
        new Response(
          JSON.stringify({ sha: `commit_${Math.random().toString(36).slice(2, 8)}` }),
          { status: 201 },
        ),
      )
    }

    // Branch ref check (GET /git/ref/heads/workshop/*) — 404 first time so we
    // go through create; if called again the update path (PATCH) will be hit.
    if (url.includes('/git/ref/heads/workshop/') && method === 'GET') {
      return Promise.resolve(new Response('', { status: 404 }))
    }

    // Create ref
    if (url.endsWith('/git/refs') && method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({}), { status: 201 }))
    }

    // Update ref (PATCH /git/refs/heads/workshop/*)
    if (url.includes('/git/refs/heads/workshop/') && method === 'PATCH') {
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    }

    // Find open PR
    if (url.includes('/pulls?head=') && method === 'GET') {
      counts.findPrCalls++
      const list = existingPr ? [existingPr] : []
      return Promise.resolve(
        new Response(
          JSON.stringify(
            list.map((p) => ({ number: p.number, html_url: p.url })),
          ),
          { status: 200 },
        ),
      )
    }

    // Comment on existing PR (issues/:n/comments)
    if (url.match(/\/issues\/\d+\/comments$/) && method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({}), { status: 201 }))
    }

    // Create PR
    if (url.match(/\/repos\/[^/]+\/[^/]+\/pulls$/) && method === 'POST') {
      counts.openPrCalls++
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

  beforeEach(() => {
    ;(workshopPrConfig as unknown as { clientId: string }).clientId = 'test_cid'
    ;(workshopPrConfig as unknown as { clientSecret: string }).clientSecret = 'test_secret'
    ;(workshopPrConfig as unknown as { enabled: boolean }).enabled = true
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = false

    const now = Date.now()
    userId = nanoid()
    userToken = nanoid()
    db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(userId, `user_${userId.slice(0, 8)}`, 'Test User', 'x', now)
    db.prepare(
      `INSERT INTO sessions (token, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(userToken, userId, now + 3_600_000, now)

    cardDbId = nanoid()
    const cardJson = JSON.stringify({
      id: 'CUSTOM_TestCard',
      name: 'Test Card',
      card_type: 'minor',
      deck: 'CUSTOM',
      number: 0,
      desc: [],
      locales: {
        zh: {
          name: '测试卡',
          desc: ['测试说明'],
        },
      },
      _code: `const CARD_DEF = new MinorImprovement({ id: 'CUSTOM_TestCard', deck: 'community', number: 0, name: 'Test Card', desc: [], cost: {}, vp: 0 })\nconst CARD_IMPL = {}`,
      _compiled: '"use strict";',
    })
    db.prepare(
      `INSERT INTO workshop_cards
         (id, author_id, card_id, card_type, name, description, card_json,
          code_manifest, art_url, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      cardDbId,
      userId,
      'CUSTOM_TestCard',
      'minor',
      'Test Card',
      'A test card',
      cardJson,
      '{}',
      null,
      'published',
      now,
      now,
    )
    versionId = nanoid()
    db.prepare(`
      INSERT INTO workshop_card_versions (
        id, card_id, card_json, code_manifest, art_url, version_number,
        created_by, created_at, content_hash, provenance_json
      ) VALUES (?, ?, ?, '{}', NULL, 1, ?, ?, NULL, '{}')
    `).run(versionId, cardDbId, cardJson, userId, now)
    db.prepare(`
      UPDATE workshop_cards
      SET published_version_id = ?, sandbox_pass_version_id = ?, sandbox_passed_at = ?
      WHERE id = ?
    `).run(versionId, versionId, now, cardDbId)

    db.prepare(`DELETE FROM github_propose_rate_limit WHERE user_id = ?`).run(userId)
    db.prepare(`DELETE FROM github_propose_audit WHERE user_id = ?`).run(userId)
  })

  afterEach(() => {
    db.prepare(`DELETE FROM github_propose_audit WHERE user_id = ?`).run(userId)
    db.prepare(`DELETE FROM github_propose_rate_limit WHERE user_id = ?`).run(userId)
    db.prepare(`DELETE FROM workshop_cards WHERE id = ?`).run(cardDbId)
    db.prepare(`DELETE FROM sessions WHERE token = ?`).run(userToken)
    db.prepare(`DELETE FROM users WHERE id = ?`).run(userId)

    ;(workshopPrConfig as unknown as { clientId: string }).clientId = origClientId
    ;(workshopPrConfig as unknown as { clientSecret: string }).clientSecret = origSecret
    ;(workshopPrConfig as unknown as { enabled: boolean }).enabled = origEnabled
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = origMockMode
    if (origCorsOrigin === undefined) delete process.env.CORS_ORIGIN
    else process.env.CORS_ORIGIN = origCorsOrigin

    vi.unstubAllGlobals()
  })

  // ── C-24: happy path ─────────────────────────────────────────────────────

  it('rejects before OAuth when the published version has no matching sandbox pass', async () => {
    db.prepare(`
      UPDATE workshop_cards SET sandbox_pass_version_id = NULL, sandbox_passed_at = NULL
      WHERE id = ?
    `).run(cardDbId)
    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/propose`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res = fakeRes()

    await handleProposeRequest(req, res, cardDbId)

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body)).toMatchObject({
      ok: false,
      code: 'handoff_not_ready',
      readiness: {
        ready: false,
        publishedVersionMatchesDraft: true,
        sandboxPassedForPublishedVersion: false,
      },
    })
  })

  it('returns a deterministic PR result without OAuth in mock mode', async () => {
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = true
    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/propose`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res = fakeRes()

    await handleProposeRequest(req, res, cardDbId)

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      ok: true,
      prUrl: '/mock-workshop-pr/1',
      prNumber: 1,
    })
    expect(db.prepare(`
      SELECT github_pr_url, github_pr_status
      FROM workshop_cards WHERE id = ?
    `).get(cardDbId)).toEqual({
      github_pr_url: '/mock-workshop-pr/1',
      github_pr_status: 'open',
    })
  })

  it('rejects proposals without complete Chinese localization before mock handoff', async () => {
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = true
    const current = db.prepare(
      'SELECT card_json FROM workshop_cards WHERE id = ?',
    ).get(cardDbId) as { card_json: string }
    const cardJson = JSON.parse(current.card_json) as Record<string, unknown>
    delete cardJson.locales
    const serialised = JSON.stringify(cardJson)
    db.prepare('UPDATE workshop_cards SET card_json = ? WHERE id = ?')
      .run(serialised, cardDbId)
    db.prepare('UPDATE workshop_card_versions SET card_json = ? WHERE id = ?')
      .run(serialised, versionId)

    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/propose`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res = fakeRes()

    await handleProposeRequest(req, res, cardDbId)

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
      url: `/api/workshop/cards/${cardDbId}/propose`,
      authHeader: `Bearer ${userToken}`,
      mockResult,
      body: JSON.stringify({}),
    })
    const res = fakeRes()

    await handleProposeRequest(req, res, cardDbId)

    expect(res.statusCode).toBe(status)
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code })
    expect(db.prepare(
      'SELECT github_pr_url FROM workshop_cards WHERE id = ?',
    ).get(cardDbId)).toEqual({ github_pr_url: null })
  })

  it('happy path: first-time propose creates PR, updates DB, audit=success', async () => {
    process.env.CORS_ORIGIN = 'https://frontend.example'
    // Phase 1 — no handshakeId yet → 200 { needsAuth: true, handshakeId }
    const req1 = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/propose`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res1 = fakeRes()
    await handleProposeRequest(req1, res1, cardDbId)
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
    expect(tokenCache.get(j1.handshakeId)).toEqual({
      token: 'ghp_mock',
      userId,
    })

    // Phase 2 — full GitHub API stubbed.
    vi.unstubAllGlobals()
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
      url: `/api/workshop/cards/${cardDbId}/propose`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: j1.handshakeId }),
    })
    const res2 = fakeRes()
    await handleProposeRequest(req2, res2, cardDbId)
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
    const row = db
      .prepare(
        `SELECT github_pr_url, github_pr_status FROM workshop_cards WHERE id = ?`,
      )
      .get(cardDbId) as { github_pr_url: string; github_pr_status: string }
    expect(row.github_pr_url).toContain('/pull/42')
    expect(row.github_pr_status).toBe('open')

    // Audit log: start + success.
    const audits = db
      .prepare(
        `SELECT action FROM github_propose_audit
         WHERE workshop_card_id = ? ORDER BY created_at ASC, rowid ASC`,
      )
      .all(cardDbId) as Array<{ action: string }>
    expect(audits.map((a) => a.action)).toEqual(['start', 'success'])

    // Rate-limit row inserted.
    const rate = db
      .prepare(
        `SELECT last_propose_at FROM github_propose_rate_limit WHERE user_id = ?`,
      )
      .get(userId) as { last_propose_at: number } | undefined
    expect(rate?.last_propose_at).toBeGreaterThan(0)
  })

  // ── C-25: upsert path ────────────────────────────────────────────────────

  it('upsert: second propose of same card reuses existing open PR (no new openPr)', async () => {
    // Pretend this card already has an open PR from a previous propose.
    db.prepare(
      `UPDATE workshop_cards
       SET github_pr_url = ?, github_pr_status = 'open'
       WHERE id = ?`,
    ).run('https://github.com/titanxxh/open-agricola/pull/99', cardDbId)
    db.prepare(`DELETE FROM github_propose_rate_limit WHERE user_id = ?`).run(userId)

    // Bind a token directly — skip the OAuth round-trip.
    const hs = tokenCache.allocateHandshakeId(userId)
    tokenCache.bind(hs, 'ghp_mock')

    const { fn: gh, counts } = createGitHubApiStub({
      githubLogin: 'workshopuser',
      existingPr: {
        number: 99,
        url: 'https://github.com/titanxxh/open-agricola/pull/99',
      },
    })
    vi.stubGlobal('fetch', gh)

    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/propose`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({ handshakeId: hs }),
    })
    const res = fakeRes()
    await handleProposeRequest(req, res, cardDbId)
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

    // github_pr_url sticks to pull/99.
    const row = db
      .prepare(`SELECT github_pr_url FROM workshop_cards WHERE id = ?`)
      .get(cardDbId) as { github_pr_url: string }
    expect(row.github_pr_url).toContain('/pull/99')

    const audits = db
      .prepare(
        `SELECT action FROM github_propose_audit
         WHERE workshop_card_id = ? ORDER BY created_at ASC, rowid ASC`,
      )
      .all(cardDbId) as Array<{ action: string }>
    expect(audits.map((a) => a.action)).toEqual(['start', 'success'])
  })

  // ── C-26: rate limit ─────────────────────────────────────────────────────

  it('rate limit: second propose within 10 minutes returns 429', async () => {
    const now = Date.now()
    db.prepare(
      `INSERT OR REPLACE INTO github_propose_rate_limit (user_id, last_propose_at)
       VALUES (?, ?)`,
    ).run(userId, now)

    const req = fakeReq({
      method: 'POST',
      url: `/api/workshop/cards/${cardDbId}/propose`,
      authHeader: `Bearer ${userToken}`,
      body: JSON.stringify({}),
    })
    const res = fakeRes()
    await handleProposeRequest(req, res, cardDbId)
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
