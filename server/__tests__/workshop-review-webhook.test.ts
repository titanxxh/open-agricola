import type { PostgresDatabase } from '../database/postgres'
import { createTestDatabase } from './_helpers/postgres'
import { createHmac } from 'node:crypto'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleWorkshopReviewWebhook,
  type WorkshopReviewRuntime,
} from '../workshop-review/webhook-handler.ts'
import type { WorkshopReviewSnapshot } from '../workshop-review/github-review-provider.ts'
import { enterReview, invalidateReviewedCard, loadWorkspace, reconcilePendingMerges } from '../workshop-drafts.ts'
import { ALL_CARD_IMPLS } from '../../shared/cards/register-all.ts'

let db: PostgresDatabase

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

const insertReviewedCard = async (input: {
  id: string
  prNumber: number
  reviewStatus?: string
  live?: boolean
  reviewCommitSha?: string
}): Promise<Awaited<void>> => {
  const now = Date.now()
  ;(await db.prepare(`
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
  ))
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

beforeEach(async () => {
  db = await createTestDatabase()
  await db.exec("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES ('author', 'author', 'Author', 'hash', 1)")
})

afterEach(async () => {
  ;(await db.close())
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

  it('ignores an unbound PR without querying GitHub or recording the delivery', async () => {
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot)
      .mockResolvedValue(openSnapshot('head-unbound'))

    const res = await deliver({
      action: 'submitted',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 999,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/999',
      },
    }, 'pull_request_review', 'delivery-unbound-pr', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, ignored: true })
    expect(reviewRuntime.provider.getPullRequestSnapshot).not.toHaveBeenCalled()
    expect((await db.prepare('SELECT COUNT(*) AS count FROM github_webhook_events').get()))
      .toEqual({ count: 0 })
  })

  it('fails closed and records the delivery when GitHub is unavailable', async () => {
    await insertReviewedCard({
      id: 'card-provider-unavailable',
      prNumber: 55,
      reviewCommitSha: 'head-55',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot)
      .mockRejectedValue(new Error('github unavailable'))

    const res = await deliver({
      action: 'edited',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 55,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/55',
      },
    }, 'pull_request', 'delivery-provider-unavailable', reviewRuntime)

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({
      ok: true,
      conservative: true,
      invalidated: 1,
    })
    expect((await loadWorkspace(db, 'card-provider-unavailable', 'author'))).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })
    expect((await db.prepare('SELECT COUNT(*) AS count FROM github_webhook_events').get()))
      .toEqual({ count: 1 })
  })

  it('invalidates a synchronized live card once per delivery', async () => {
    const now = Date.now()
    ;(await db.prepare(`
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
    ))
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
    expect((await loadWorkspace(db, 'card-1', 'author'))).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })

    ;(await db.prepare(`
      UPDATE workshop_cards SET review_status = 'approved', live = 1 WHERE id = 'card-1'
    `).run())
    const duplicateRes = mockRes()

    await handleWorkshopReviewWebhook(mockReq(body, headers), duplicateRes, db, reviewRuntime)

    expect(JSON.parse(duplicateRes.body)).toEqual({ ok: true, duplicate: true })
    expect((await loadWorkspace(db, 'card-1', 'author'))).toMatchObject({
      reviewStatus: 'approved',
      live: true,
    })
    expect(reviewRuntime.provider.getPullRequestSnapshot).toHaveBeenCalledTimes(1)
  })

  it('keeps the freshly submitted head in review when its synchronize event arrives late', async () => {
    await insertReviewedCard({
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
    expect((await loadWorkspace(db, 'card-current-head', 'author'))).toMatchObject({
      reviewStatus: 'in_review',
      live: false,
    })
  })

  it('keeps a newer submitted head when an older synchronize event arrives late', async () => {
    await insertReviewedCard({
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
    expect((await loadWorkspace(db, 'card-newer-head', 'author'))).toMatchObject({
      reviewStatus: 'in_review',
      live: false,
    })
  })

  it('invalidates a card when its approval is dismissed', async () => {
    const now = Date.now()
    ;(await db.prepare(`
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
    ))
    const body = Buffer.from(JSON.stringify({
      action: 'dismissed',
      review: { commit_id: 'head-43' },
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 43,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/43',
      },
    }))
    const res = mockRes()

    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot)
      .mockResolvedValue(openSnapshot('head-43'))

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
      reviewRuntime,
    )

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 1 })
    expect((await loadWorkspace(db, 'card-2', 'author'))).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })
  })

  it('keeps an unapproved newer head when an older dismissal arrives late', async () => {
    await insertReviewedCard({
      id: 'card-unapproved-after-dismissal',
      prNumber: 52,
      reviewStatus: 'in_review',
      live: false,
      reviewCommitSha: 'head-52-b',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot)
      .mockResolvedValue(openSnapshot('head-52-b'))

    const res = await deliver({
      action: 'dismissed',
      review: { commit_id: 'head-52-a' },
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 52,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/52',
      },
    }, 'pull_request_review', 'delivery-old-dismissal', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 0 })
    expect((await loadWorkspace(db, 'card-unapproved-after-dismissal', 'author'))).toMatchObject({
      reviewStatus: 'in_review',
      live: false,
    })
  })

  it('keeps a current in-review head when one nonfinal approval is dismissed', async () => {
    await insertReviewedCard({
      id: 'card-nonfinal-dismissal',
      prNumber: 56,
      reviewStatus: 'in_review',
      live: false,
      reviewCommitSha: 'head-56',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot('head-56'),
      reviewDecision: 'REVIEW_REQUIRED',
    })

    const res = await deliver({
      action: 'dismissed',
      review: { commit_id: 'head-56' },
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 56,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/56',
      },
    }, 'pull_request_review', 'delivery-nonfinal-dismissal', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 0 })
    expect((await loadWorkspace(db, 'card-nonfinal-dismissal', 'author'))).toMatchObject({
      reviewStatus: 'in_review',
      live: false,
    })
  })

  it('keeps a newer valid approval when an older dismissal arrives late', async () => {
    await insertReviewedCard({
      id: 'card-delayed-dismissal',
      prNumber: 50,
      reviewCommitSha: 'head-50',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot('head-50'),
      reviewDecision: 'APPROVED',
      reviews: [{
        id: 'review-50',
        state: 'APPROVED',
        commitOid: 'head-50',
        authorCanPushToRepository: true,
      }],
    })

    const res = await deliver({
      action: 'dismissed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 50,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/50',
      },
    }, 'pull_request_review', 'delivery-delayed-dismissal', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 0 })
    expect((await loadWorkspace(db, 'card-delayed-dismissal', 'author'))).toMatchObject({
      reviewStatus: 'approved',
      live: true,
    })
  })

  it('restores a stale card when dismissal reveals a valid head approval', async () => {
    const now = Date.now()
    const prUrl = 'https://github.com/titanxxh/open-agricola/pull/62'
    ;(await db.prepare(`
      INSERT INTO workshop_cards (
        id, author_id, card_id, card_type, name, card_json,
        review_status, live, created_at, updated_at
      ) VALUES ('card-restored-dismissal', 'author', 'CUSTOM_RestoredDismissal',
                'occupation', 'Restored Dismissal', '{}', 'unsubmitted', 0, ?, ?)
    `).run(now, now))
    ;(await enterReview(db, {
      cardId: 'card-restored-dismissal',
      authorId: 'author',
      prUrl,
      expectedRevision: 1,
      commitSha: 'head-62',
    }))
    ;(await invalidateReviewedCard(db, { prUrl }))
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot('head-62'),
      reviewDecision: 'APPROVED',
      reviews: [{
        id: 'review-62',
        state: 'APPROVED',
        commitOid: 'head-62',
        authorCanPushToRepository: true,
      }],
    })

    const res = await deliver({
      action: 'dismissed',
      review: { commit_id: 'head-62' },
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 62,
        html_url: prUrl,
      },
    }, 'pull_request_review', 'delivery-restored-dismissal', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, approved: 1, invalidated: 0 })
    expect((await loadWorkspace(db, 'card-restored-dismissal', 'author'))).toMatchObject({
      reviewStatus: 'approved',
      live: false,
    })
  })

  it.each([
    ['submitted', 58],
    ['dismissed', 59],
  ])('preserves an approved live card when a delayed %s review arrives after merge', async (action, prNumber) => {
    const id = `card-merged-${action}`
    const head = `head-${prNumber}`
    await insertReviewedCard({ id, prNumber, reviewCommitSha: head })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot(head),
      state: 'MERGED',
    })

    const res = await deliver({
      action,
      review: { commit_id: head },
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: prNumber,
        html_url: `https://github.com/titanxxh/open-agricola/pull/${prNumber}`,
      },
    }, 'pull_request_review', `delivery-merged-${action}`, reviewRuntime)

    expect(JSON.parse(res.body)).toMatchObject({ ok: true, invalidated: 0 })
    expect((await loadWorkspace(db, id, 'author'))).toMatchObject({
      reviewStatus: 'approved',
      live: true,
    })
  })

  it('ignores an ambiguous legacy PR binding instead of selecting a row', async () => {
    await insertReviewedCard({
      id: 'card-duplicate-a',
      prNumber: 60,
      reviewStatus: 'in_review',
      live: false,
      reviewCommitSha: 'head-60',
    })
    await insertReviewedCard({
      id: 'card-duplicate-b',
      prNumber: 60,
      reviewStatus: 'in_review',
      live: false,
      reviewCommitSha: 'head-60',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot)
      .mockResolvedValue(openSnapshot('head-60'))

    const res = await deliver({
      action: 'submitted',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 60,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/60',
      },
    }, 'pull_request_review', 'delivery-duplicate-binding', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, ignored: true })
    expect(reviewRuntime.provider.getPullRequestSnapshot).not.toHaveBeenCalled()
  })

  it('graduates a live card to merged when its PR merges', async () => {
    await insertReviewedCard({ id: 'card-merged-pr', prNumber: 47 })
    ;(await db.prepare(`
      UPDATE workshop_cards SET approved_version_id = 'ver-47' WHERE id = 'card-merged-pr'
    `).run())
    const reviewRuntime = runtime()

    const res = await deliver({
      action: 'closed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 47,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/47',
        merged: true,
        base: { ref: 'main' },
      },
    }, 'pull_request', 'delivery-merged-pr', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, merged: 1, builtIn: 0 })
    expect((await loadWorkspace(db, 'card-merged-pr', 'author'))).toMatchObject({
      reviewStatus: 'merged',
      live: true,
    })
    // the graduation transition needs no GitHub round-trip
    expect(reviewRuntime.provider.getPullRequestSnapshot).not.toHaveBeenCalled()

    // duplicate delivery is idempotent
    const dup = await deliver({
      action: 'closed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 47,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/47',
        merged: true,
        base: { ref: 'main' },
      },
    }, 'pull_request', 'delivery-merged-pr', reviewRuntime)
    expect(JSON.parse(dup.body)).toEqual({ ok: true, duplicate: true })
  })

  it('persists an out-of-order merge and graduates once the approval lands', async () => {
    // approved_version_id is still null: the merge arrived before the
    // approval landed. GitHub does not redeliver acknowledged hooks, so the
    // merge fact is persisted and reconciled later.
    await insertReviewedCard({ id: 'card-early-merge', prNumber: 48, reviewStatus: 'in_review', live: false })
    const payload = {
      action: 'closed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 48,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/48',
        merged: true,
        base: { ref: 'main' },
      },
    }
    const res = await deliver(payload, 'pull_request', 'delivery-early-merge', runtime())
    expect(JSON.parse(res.body)).toEqual({ ok: true, pendingMerge: true })
    const pending = (await loadWorkspace(db, 'card-early-merge', 'author'))
    expect(pending.reviewStatus).toBe('in_review')
    expect((await db.prepare(`
      SELECT github_pr_status FROM workshop_cards WHERE id = 'card-early-merge'
    `).get())).toEqual({ github_pr_status: 'merged' })

    // the approval lands: the next reconciliation point graduates the card
    ;(await db.prepare(`
      UPDATE workshop_cards
      SET review_status = 'approved', approved_version_id = 'ver-48'
      WHERE id = 'card-early-merge'
    `).run())
    expect((await reconcilePendingMerges(db))).toBe(1)
    expect((await loadWorkspace(db, 'card-early-merge', 'author')).reviewStatus).toBe('merged')

    // duplicate delivery of the original hook is idempotent
    const dup = await deliver(payload, 'pull_request', 'delivery-early-merge', runtime())
    expect(JSON.parse(dup.body)).toEqual({ ok: true, duplicate: true })
  })

  it('demotes a live card when its PR merges into a branch other than main', async () => {
    await insertReviewedCard({ id: 'card-retargeted-merge', prNumber: 49, reviewCommitSha: 'head-49' })
    ;(await db.prepare(`
      UPDATE workshop_cards SET approved_version_id = 'ver-49' WHERE id = 'card-retargeted-merge'
    `).run())
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot('head-49'),
      state: 'MERGED',
      baseRefName: 'release',
    })

    const res = await deliver({
      action: 'closed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 49,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/49',
        merged: true,
        base: { ref: 'release' },
      },
    }, 'pull_request', 'delivery-retargeted-merge', reviewRuntime)

    // merged outside main never reaches the built-in registry: the card must
    // not terminalize, and no false pending-merge fact may be left behind
    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 1 })
    expect((await loadWorkspace(db, 'card-retargeted-merge', 'author'))).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })
    expect((await db.prepare(`
      SELECT github_pr_status FROM workshop_cards WHERE id = 'card-retargeted-merge'
    `).get())).toEqual({ github_pr_status: 'closed' })
  })

  it('records closure when a non-main merge closes an already-stale card', async () => {
    // The earlier `edited` webhook already demoted the retargeted PR's card:
    // the subsequent close must still land github_pr_status = 'closed'.
    await insertReviewedCard({
      id: 'card-stale-retarget',
      prNumber: 51,
      reviewStatus: 'stale',
      live: false,
      reviewCommitSha: 'head-51',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot('head-51'),
      state: 'MERGED',
      baseRefName: 'release',
    })

    const res = await deliver({
      action: 'closed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 51,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/51',
        merged: true,
        base: { ref: 'release' },
      },
    }, 'pull_request', 'delivery-stale-retarget-close', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 1 })
    expect((await db.prepare(`
      SELECT review_status, github_pr_status FROM workshop_cards WHERE id = 'card-stale-retarget'
    `).get())).toEqual({ review_status: 'stale', github_pr_status: 'closed' })
  })

  it('preserves the recorded closure when out-of-order deliveries revisit a stale binding', async () => {
    await insertReviewedCard({
      id: 'card-closed-stale',
      prNumber: 52,
      reviewStatus: 'stale',
      live: false,
      reviewCommitSha: 'head-52',
    })
    ;(await db.prepare(`
      UPDATE workshop_cards SET github_pr_status = 'closed' WHERE id = 'card-closed-stale'
    `).run())

    // snapshot available: the status is re-derived, never defaulted to 'open'
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot('head-52-b'),
      state: 'MERGED',
      baseRefName: 'release',
    })
    const edited = await deliver({
      action: 'edited',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 52,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/52',
      },
    }, 'pull_request', 'delivery-stale-edited', reviewRuntime)
    expect(JSON.parse(edited.body)).toMatchObject({ ok: true })
    expect((await db.prepare(`
      SELECT github_pr_status FROM workshop_cards WHERE id = 'card-closed-stale'
    `).get())).toEqual({ github_pr_status: 'closed' })

    // GitHub unavailable: fail-closed has no snapshot and must not overwrite
    const failingRuntime = runtime()
    vi.mocked(failingRuntime.provider.getPullRequestSnapshot)
      .mockRejectedValue(new Error('github down'))
    const failed = await deliver({
      action: 'synchronize',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 52,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/52',
      },
    }, 'pull_request', 'delivery-stale-failclosed', failingRuntime)
    expect(JSON.parse(failed.body)).toMatchObject({ ok: true, conservative: true })
    expect((await db.prepare(`
      SELECT github_pr_status FROM workshop_cards WHERE id = 'card-closed-stale'
    `).get())).toEqual({ github_pr_status: 'closed' })
  })

  it('reconciles the built-in takeover when a delayed approval graduates the card', async () => {
    const builtInCardId = Object.keys(ALL_CARD_IMPLS)[0]!
    const now = Date.now()
    ;(await db.prepare(`
      INSERT INTO workshop_cards (
        id, author_id, card_id, card_type, name, card_json,
        review_status, live, created_at, updated_at
      ) VALUES ('card-late-approval', 'author', ?, 'occupation', 'Late Approval', '{}', 'unsubmitted', 0, ?, ?)
    `).run(builtInCardId, now, now))
    ;(await enterReview(db, {
      cardId: 'card-late-approval',
      authorId: 'author',
      prUrl: 'https://github.com/titanxxh/open-agricola/pull/50',
      expectedRevision: 1,
      commitSha: 'head-50',
    }))

    // merge delivery arrives first: only the merge fact is persisted
    const mergeRes = await deliver({
      action: 'closed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 50,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/50',
        merged: true,
        base: { ref: 'main' },
      },
    }, 'pull_request', 'delivery-late-approval-merge', runtime())
    expect(JSON.parse(mergeRes.body)).toEqual({ ok: true, pendingMerge: true })

    // the release containing the card is already running when the delayed
    // approval lands: graduation must reconcile the takeover immediately
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot('head-50'),
      state: 'MERGED',
      reviewDecision: 'APPROVED',
      reviews: [{
        id: 'review-50',
        state: 'APPROVED',
        commitOid: 'head-50',
        authorCanPushToRepository: true,
      }],
    })
    const res = await deliver({
      action: 'submitted',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 50,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/50',
      },
    }, 'pull_request_review', 'delivery-late-approval-review', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, approved: 1, graduated: 1, builtIn: 1 })
    expect((await loadWorkspace(db, 'card-late-approval', 'author')).reviewStatus).toBe('merged')
    expect((await db.prepare(`
      SELECT built_in FROM workshop_cards WHERE id = 'card-late-approval'
    `).get())).toEqual({ built_in: 1 })
  })

  it('invalidates a live card when its PR closes without merging', async () => {
    await insertReviewedCard({ id: 'card-closed-pr', prNumber: 46 })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot('head-46'),
      state: 'CLOSED',
    })

    const res = await deliver({
      action: 'closed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 46,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/46',
        merged: false,
      },
    }, 'pull_request', 'delivery-closed-pr', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 1 })
    expect((await loadWorkspace(db, 'card-closed-pr', 'author'))).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })
  })

  it('keeps a reopened PR when its older close delivery arrives late', async () => {
    await insertReviewedCard({
      id: 'card-reopened-pr',
      prNumber: 53,
      reviewStatus: 'in_review',
      live: false,
      reviewCommitSha: 'head-53-b',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot)
      .mockResolvedValue(openSnapshot('head-53-b'))

    const res = await deliver({
      action: 'closed',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 53,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/53',
        merged: false,
      },
    }, 'pull_request', 'delivery-old-close', reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 0 })
    expect((await loadWorkspace(db, 'card-reopened-pr', 'author'))).toMatchObject({
      reviewStatus: 'in_review',
      live: false,
    })
  })

  it.each([
    ['edited', { ...openSnapshot('head-51'), baseRefName: 'release' }],
    ['converted_to_draft', { ...openSnapshot('head-51'), isDraft: true }],
  ])('invalidates a live card when %s makes its PR ineligible', async (action, snapshot) => {
    await insertReviewedCard({
      id: `card-ineligible-${action}`,
      prNumber: 51,
      reviewCommitSha: 'head-51',
    })
    const reviewRuntime = runtime()
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockResolvedValue(snapshot)

    const res = await deliver({
      action,
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 51,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/51',
      },
    }, 'pull_request', `delivery-ineligible-${action}`, reviewRuntime)

    expect(JSON.parse(res.body)).toEqual({ ok: true, invalidated: 1 })
    expect((await loadWorkspace(db, `card-ineligible-${action}`, 'author'))).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })
  })

  it('invalidates a live card when the atomic snapshot requests changes', async () => {
    await insertReviewedCard({
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
    expect((await loadWorkspace(db, 'card-changes-requested', 'author'))).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })
  })

  it('keeps an unchanged PR in review after a comment-only review', async () => {
    await insertReviewedCard({
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
    expect((await loadWorkspace(db, 'card-comment-review', 'author'))).toMatchObject({
      reviewStatus: 'in_review',
      live: false,
    })
  })

  it('approves the exact submitted version from an atomic GitHub snapshot', async () => {
    const now = Date.now()
    ;(await db.prepare(`
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
    ))
    ;(await enterReview(db, {
      cardId: 'card-3',
      authorId: 'author',
      prUrl: 'https://github.com/titanxxh/open-agricola/pull/44',
      expectedRevision: 1,
      commitSha: 'head-44',
    }))
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
    expect((await loadWorkspace(db, 'card-3', 'author'))).toMatchObject({
      reviewStatus: 'approved',
      approvedVersionId: expect.any(String),
      live: false,
    })
  })

  it('ignores an approval snapshot captured before a concurrent resubmission', async () => {
    await insertReviewedCard({
      id: 'card-concurrent-approval',
      prNumber: 54,
      reviewStatus: 'in_review',
      live: false,
      reviewCommitSha: 'head-54-a',
    })
    const reviewRuntime = runtime()
    let resolveSnapshot!: (snapshot: WorkshopReviewSnapshot) => void
    vi.mocked(reviewRuntime.provider.getPullRequestSnapshot).mockReturnValueOnce(
      new Promise(resolve => { resolveSnapshot = resolve }),
    )
    const delivering = deliver({
      action: 'submitted',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 54,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/54',
      },
    }, 'pull_request_review', 'delivery-concurrent-approval', reviewRuntime)
    await vi.waitFor(() => {
      expect(reviewRuntime.provider.getPullRequestSnapshot).toHaveBeenCalledWith(54)
    })
    ;(await db.prepare(`
      UPDATE workshop_cards SET review_commit_sha = 'head-54-b' WHERE id = ?
    `).run('card-concurrent-approval'))
    resolveSnapshot({
      ...openSnapshot('head-54-a'),
      reviewDecision: 'APPROVED',
      reviews: [{
        id: 'review-54-a',
        state: 'APPROVED',
        commitOid: 'head-54-a',
        authorCanPushToRepository: true,
      }],
    })

    const res = await delivering
    expect(JSON.parse(res.body)).toEqual({ ok: true, ignored: true })
    expect((await loadWorkspace(db, 'card-concurrent-approval', 'author'))).toMatchObject({
      reviewStatus: 'in_review',
      live: false,
    })
  })

  it('does not restore an older approval after a newer invalidation', async () => {
    await insertReviewedCard({
      id: 'card-overlapping-webhooks',
      prNumber: 57,
      reviewStatus: 'in_review',
      live: false,
      reviewCommitSha: 'head-57',
    })
    const olderRuntime = runtime()
    let resolveOlder!: (snapshot: WorkshopReviewSnapshot) => void
    vi.mocked(olderRuntime.provider.getPullRequestSnapshot).mockReturnValueOnce(
      new Promise(resolve => { resolveOlder = resolve }),
    )
    const olderDelivery = deliver({
      action: 'submitted',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 57,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/57',
      },
    }, 'pull_request_review', 'delivery-older-approval', olderRuntime)
    await vi.waitFor(() => {
      expect(olderRuntime.provider.getPullRequestSnapshot).toHaveBeenCalledWith(57)
    })

    const newerRuntime = runtime()
    vi.mocked(newerRuntime.provider.getPullRequestSnapshot).mockResolvedValue({
      ...openSnapshot('head-57'),
      reviewDecision: 'CHANGES_REQUESTED',
      reviews: [{
        id: 'changes-57',
        state: 'CHANGES_REQUESTED',
        commitOid: 'head-57',
        authorCanPushToRepository: true,
      }],
    })
    const newerRes = await deliver({
      action: 'submitted',
      repository: { full_name: 'titanxxh/open-agricola' },
      pull_request: {
        number: 57,
        html_url: 'https://github.com/titanxxh/open-agricola/pull/57',
      },
    }, 'pull_request_review', 'delivery-newer-invalidation', newerRuntime)
    expect(JSON.parse(newerRes.body)).toEqual({ ok: true, approved: 0, invalidated: 1 })

    resolveOlder({
      ...openSnapshot('head-57'),
      reviewDecision: 'APPROVED',
      reviews: [{
        id: 'approval-57',
        state: 'APPROVED',
        commitOid: 'head-57',
        authorCanPushToRepository: true,
      }],
    })
    const olderRes = await olderDelivery

    expect(JSON.parse(olderRes.body)).toEqual({ ok: true, ignored: true })
    expect((await loadWorkspace(db, 'card-overlapping-webhooks', 'author'))).toMatchObject({
      reviewStatus: 'stale',
      live: false,
    })
  })
})
