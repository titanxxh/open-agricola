import Database from 'better-sqlite3'
import { createHmac } from 'node:crypto'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleWorkshopReviewWebhook,
  type WorkshopReviewRuntime,
} from '../workshop-review/webhook-handler.ts'
import { enterReview, loadWorkspace } from '../workshop-drafts.ts'

let db: Database.Database

const runtime = (): WorkshopReviewRuntime => ({
  webhookSecret: 'webhook-secret',
  repositoryOwner: 'titanxxh',
  repositoryName: 'open-agricola',
  provider: {
    getPullRequestSnapshot: vi.fn(),
  },
})

const mockReq = (
  body: Buffer,
  headers: Record<string, string>,
): IncomingMessage => {
  const req = Readable.from([body]) as IncomingMessage
  req.method = 'POST'
  req.url = '/api/github/webhook'
  req.headers = headers
  return req
}

const mockRes = (): ServerResponse & { statusCode: number; body: string } => {
  let statusCode = 200
  let body = ''
  return {
    get statusCode() { return statusCode },
    set statusCode(value) { statusCode = value },
    get body() { return body },
    writeHead(code: number) { statusCode = code; return this },
    end(data?: string) { body = data ?? ''; return this },
  } as unknown as ServerResponse & { statusCode: number; body: string }
}

beforeEach(() => {
  db = new Database(':memory:')
  db.exec(`
    CREATE TABLE workshop_cards (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      card_type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      card_json TEXT NOT NULL,
      code_manifest TEXT,
      art_url TEXT,
      review_status TEXT NOT NULL DEFAULT 'unsubmitted',
      live INTEGER NOT NULL DEFAULT 0,
      github_pr_url TEXT,
      github_pr_status TEXT,
      github_pr_last_synced_at INTEGER,
      review_commit_sha TEXT,
      review_version_id TEXT,
      draft_revision INTEGER NOT NULL DEFAULT 1,
      draft_generation_json TEXT NOT NULL DEFAULT '{}',
      approved_commit_sha TEXT,
      approved_review_id TEXT,
      approved_at INTEGER,
      approved_version_id TEXT,
      built_in INTEGER NOT NULL DEFAULT 0,
      sandbox_pass_version_id TEXT,
      sandbox_passed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE workshop_card_versions (
      id TEXT PRIMARY KEY,
      card_id TEXT NOT NULL,
      card_json TEXT NOT NULL,
      code_manifest TEXT,
      art_url TEXT,
      version_number INTEGER NOT NULL,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      content_hash TEXT,
      provenance_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE github_webhook_events (
      delivery_id TEXT PRIMARY KEY,
      event_name TEXT NOT NULL,
      received_at INTEGER NOT NULL
    );
  `)
})

afterEach(() => {
  db.close()
})

describe('workshop review webhook', () => {
  it('rejects an invalid signature before accepting the delivery', async () => {
    const body = Buffer.from(JSON.stringify({ action: 'synchronize' }))
    const res = mockRes()

    const handled = await handleWorkshopReviewWebhook(
      mockReq(body, {
        'x-github-delivery': 'delivery-1',
        'x-github-event': 'pull_request',
        'x-hub-signature-256': 'sha256=00',
      }),
      res,
      db,
      runtime(),
    )

    expect(handled).toBe(true)
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body)).toEqual({
      ok: false,
      code: 'invalid_webhook_signature',
    })
  })

  it('invalidates a synchronized live card once per delivery', async () => {
    const now = Date.now()
    db.prepare(`
      INSERT INTO workshop_cards (
        id, author_id, card_id, card_type, name, card_json,
        review_status, live, github_pr_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'approved', 1, ?, ?, ?)
    `).run(
      'card-1',
      'author',
      'CUSTOM_FieldKeeper',
      'occupation',
      'Field Keeper',
      '{}',
      'https://github.com/titanxxh/open-agricola/pull/42',
      now,
      now,
    )
    const body = Buffer.from(JSON.stringify({
      action: 'synchronize',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 42,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/42',
      },
    }))
    const signature = `sha256=${createHmac('sha256', 'webhook-secret')
      .update(body)
      .digest('hex')}`
    const headers = {
      'x-github-delivery': 'delivery-2',
      'x-github-event': 'pull_request',
      'x-hub-signature-256': signature,
    }
    const firstRes = mockRes()
    const reviewRuntime = runtime()

    await handleWorkshopReviewWebhook(mockReq(body, headers), firstRes, db, reviewRuntime)

    expect(firstRes.statusCode).toBe(200)
    expect(JSON.parse(firstRes.body)).toEqual({ ok: true, invalidated: 1 })
    expect(loadWorkspace(db, 'card-1', 'author')).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })

    db.prepare(`
      UPDATE workshop_cards SET review_status = 'approved', live = 1 WHERE id = 'card-1'
    `).run()
    const duplicateRes = mockRes()

    await handleWorkshopReviewWebhook(mockReq(body, headers), duplicateRes, db, reviewRuntime)

    expect(JSON.parse(duplicateRes.body)).toEqual({ ok: true, duplicate: true })
    expect(loadWorkspace(db, 'card-1', 'author')).toMatchObject({
      reviewStatus: 'approved',
      live: true,
    })
    expect(reviewRuntime.provider.getPullRequestSnapshot).not.toHaveBeenCalled()
  })

  it('invalidates a card when its approval is dismissed', async () => {
    const now = Date.now()
    db.prepare(`
      INSERT INTO workshop_cards (
        id, author_id, card_id, card_type, name, card_json,
        review_status, live, github_pr_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'approved', 1, ?, ?, ?)
    `).run(
      'card-2',
      'author',
      'CUSTOM_BarnKeeper',
      'occupation',
      'Barn Keeper',
      '{}',
      'https://github.com/titanxxh/open-agricola/pull/43',
      now,
      now,
    )
    const body = Buffer.from(JSON.stringify({
      action: 'dismissed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 43,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/43',
      },
    }))
    const res = mockRes()

    await handleWorkshopReviewWebhook(
      mockReq(body, {
        'x-github-delivery': 'delivery-3',
        'x-github-event': 'pull_request_review',
        'x-hub-signature-256': `sha256=${createHmac('sha256', 'webhook-secret')
          .update(body)
          .digest('hex')}`,
      }),
      res,
      db,
      runtime(),
    )

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 1 })
    expect(loadWorkspace(db, 'card-2', 'author')).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })
  })

  it('approves the exact submitted version from an atomic GitHub snapshot', async () => {
    const now = Date.now()
    db.prepare(`
      INSERT INTO workshop_cards (
        id, author_id, card_id, card_type, name, card_json,
        review_status, live, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'unsubmitted', 0, ?, ?)
    `).run(
      'card-3',
      'author',
      'CUSTOM_CropKeeper',
      'occupation',
      'Crop Keeper',
      '{}',
      now,
      now,
    )
    enterReview(db, {
      cardId: 'card-3',
      authorId: 'author',
      prUrl: 'https://github.com/titanxxh/open-agricola/pull/44',
      expectedRevision: 1,
      commitSha: 'head-44',
    })
    const body = Buffer.from(JSON.stringify({
      action: 'submitted',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 44,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/44',
      },
    }))
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      reviewDecision: 'APPROVED',
      headRefOid: 'head-44',
      reviews: [{
        id: 'review-44',
        state: 'APPROVED',
        commitOid: 'head-44',
        authorCanPushToRepository: true,
      }],
    })
    const res = mockRes()

    await handleWorkshopReviewWebhook(
      mockReq(body, {
        'x-github-delivery': 'delivery-4',
        'x-github-event': 'pull_request_review',
        'x-hub-signature-256': `sha256=${createHmac('sha256', 'webhook-secret')
          .update(body)
          .digest('hex')}`,
      }),
      res,
      db,
      reviewRuntime,
    )

    expect(JSON.parse(res.body)).toEqual({ ok: true, approved: 1 })
    expect(reviewRuntime.provider.getPullRequestSnapshot).toHaveBeenCalledWith(44)
    expect(loadWorkspace(db, 'card-3', 'author')).toMatchObject({
      reviewStatus: 'approved',
      approvedVersionId: expect.any(String),
      live: false,
    })
  })
})
