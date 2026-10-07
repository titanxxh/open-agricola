import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createTestDatabase } from './_helpers/postgres'
import { nanoid } from 'nanoid'

// Isolated PostgreSQL schema; GitHub is the external test seam.

const db = await createTestDatabase()
afterAll(async () => {
  await db.close()
})

vi.mock('../db.ts', () => ({ getDb: () => db, cleanExpiredSessions: () => {} }))

// ── After mocks are in place, import the modules under test ────────────────

import { handleSubmitReviewRequest, handleRefreshPrStatus } from '../workshop-pr/propose-handler.ts'
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

describe('workshop PR propose — session', () => {
  const origEnabled = workshopPrConfig.enabled
  const origMockMode = workshopPrConfig.mockMode
  const origCorsOrigin = process.env.CORS_ORIGIN

  let userId: string
  let userToken: string
  let cardDbId: string
  let versionId: string

  beforeEach(async () => {
    ;(workshopPrConfig as unknown as { enabled: boolean }).enabled = true
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = true

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

    ;(workshopPrConfig as unknown as { enabled: boolean }).enabled = origEnabled
    ;(workshopPrConfig as unknown as { mockMode: boolean }).mockMode = origMockMode
    if (origCorsOrigin === undefined) delete process.env.CORS_ORIGIN
    else process.env.CORS_ORIGIN = origCorsOrigin

    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  // ── C-24: happy path ─────────────────────────────────────────────────────

  it('rejects before submission when the published version has no matching sandbox pass', async () => {
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
    expect(res.statusCode).toBe(409)
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
    }), res, cardDbId, {getPullRequestSnapshot:async () => ({headRefOid:'moved-head',state:'OPEN',baseRefName:'main',isDraft:false,reviewDecision:null,reviews:[]})})

    expect(JSON.parse(res.body)).toEqual({ ok: true, status: 'open' })
    expect((await db.prepare(
      'SELECT review_status FROM workshop_cards WHERE id = ?',
    ).get(cardDbId))).toEqual({ review_status: 'stale' })
  })

  // ── C-26: rate limit ─────────────────────────────────────────────────────

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
