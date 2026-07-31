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

const openSnapshot = (headRefOid: string) => ({
  reviewDecision: null,
  headRefOid,
  baseRefName: 'main',
  state: 'OPEN',
  isDraft: false,
  reviews: [],
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

const insertReviewedCard = (input: {
  id: string
  prNumber: number
  reviewStatus?: string
  live?: boolean
  reviewCommitSha?: string
}): void => {
  const now = Date.now()
  db.prepare(`
    INSERT INTO workshop_cards (
      id, author_id, card_id, card_type, name, card_json,
      review_status, live, github_pr_url, review_commit_sha,
      created_at, updated_at
    ) VALUES (?, 'author', ?, 'occupation', ?, '{}', ?, ?, ?, ?, ?, ?)
  `).run(
    input.id,
    `CUSTOM_${input.id}`,
    input.id,
    input.reviewStatus ?? 'approved',
    input.live === false ? 0 : 1,
    `https://github.com/titanxxh/open-agricola/pull/${input.prNumber}`,
    input.reviewCommitSha ?? null,
    now,
    now,
  )
}

const deliver = async (
  payload: unknown,
  eventName: string,
  deliveryId: string,
  reviewRuntime = runtime(),
): Promise<ServerResponse & { statusCode: number; body: string }> => {
  const body = Buffer.from(JSON.stringify(payload))
  const res = mockRes()
  await handleWorkshopReviewWebhook(
    mockReq(body, {
      'x-github-delivery': deliveryId,
      'x-github-event': eventName,
      'x-hub-signature-256': `sha256=${createHmac('sha256', 'webhook-secret')
        .update(body)
        .digest('hex')}`,
    }),
    res,
    db,
    reviewRuntime,
  )
  return res
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
      after: 'new-head-42',
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
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot)
      .mockResolvedValue(openSnapshot('new-head-42'))

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
    expect(reviewRuntime.provider.getPullRequestSnapshot).toHaveBeenCalledTimes(1)
  })

  it('keeps the freshly submitted head in review when its synchronize event arrives late', async () => {
    insertReviewedCard({
      id: 'card-current-head',
      prNumber: 45,
      reviewStatus: 'in_review',
      live: false,
      reviewCommitSha: 'head-45',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot)
      .mockResolvedValue(openSnapshot('head-45'))

    const res = await deliver({
      action: 'synchronize',
      after: 'head-45',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 45,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/45',
      },
    }, 'pull_request', 'delivery-current-head', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 0 })
    expect(loadWorkspace(db, 'card-current-head', 'author')).toMatchObject({
      reviewStatus: 'in_review',
      live: false,
    })
  })

  it('keeps a newer submitted head when an older synchronize event arrives late', async () => {
    insertReviewedCard({
      id: 'card-newer-head',
      prNumber: 48,
      reviewStatus: 'in_review',
      live: false,
      reviewCommitSha: 'head-48-c',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot)
      .mockResolvedValue(openSnapshot('head-48-c'))

    const res = await deliver({
      action: 'synchronize',
      after: 'head-48-b',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 48,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/48',
      },
    }, 'pull_request', 'delivery-older-head', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 0 })
    expect(loadWorkspace(db, 'card-newer-head', 'author')).toMatchObject({
      reviewStatus: 'in_review',
      live: false,
    })
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

  it('invalidates a live card when its PR closes without merging', async () => {
    insertReviewedCard({ id: 'card-closed-pr', prNumber: 46 })

    const res = await deliver({
      action: 'closed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 46,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/46',
        merged: false,
      },
    }, 'pull_request', 'delivery-closed-pr')

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 1 })
    expect(loadWorkspace(db, 'card-closed-pr', 'author')).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })
  })

  it('invalidates a live card when the atomic snapshot requests changes', async () => {
    insertReviewedCard({
      id: 'card-changes-requested',
      prNumber: 47,
      reviewCommitSha: 'head-47',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      reviewDecision: 'CHANGES_REQUESTED',
      headRefOid: 'head-47',
      baseRefName: 'main',
      state: 'OPEN',
      isDraft: false,
      reviews: [{
        id: 'review-47',
        state: 'CHANGES_REQUESTED',
        commitOid: 'head-47',
        authorCanPushToRepository: true,
      }],
    })

    const res = await deliver({
      action: 'submitted',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 47,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/47',
      },
    }, 'pull_request_review', 'delivery-changes-requested', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, approved: 0, invalidated: 1 })
    expect(loadWorkspace(db, 'card-changes-requested', 'author')).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })
  })

  it('keeps an unchanged PR in review after a comment-only review', async () => {
    insertReviewedCard({
      id: 'card-comment-review',
      prNumber: 49,
      reviewStatus: 'in_review',
      live: false,
      reviewCommitSha: 'head-49',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot('head-49'),
      reviews: [{
        id: 'review-49',
        state: 'COMMENTED',
        commitOid: 'head-49',
        authorCanPushToRepository: true,
      }],
    })

    const res = await deliver({
      action: 'submitted',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 49,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/49',
      },
    }, 'pull_request_review', 'delivery-comment-review', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, approved: 0, invalidated: 0 })
    expect(loadWorkspace(db, 'card-comment-review', 'author')).toMatchObject({
      reviewStatus: 'in_review',
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
      baseRefName: 'main',
      state: 'OPEN',
      isDraft: false,
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
