import type Database from 'better-sqlite3'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { verifyGitHubWebhook } from '../bug-report/github-issue-client.ts'
import {
  approveReviewedVersion,
  invalidateReviewedCard,
} from '../workshop-drafts.ts'
import {
  findApprovedHeadReview,
  type WorkshopReviewSnapshot,
} from './github-review-provider.ts'

export type WorkshopReviewRuntime = {
  webhookSecret: string
  repositoryOwner: string
  repositoryName: string
  provider: {
    getPullRequestSnapshot(prNumber: number): Promise<WorkshopReviewSnapshot>
  }
}

const header = (
  req: IncomingMessage,
  name: string,
): string | undefined => {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

const readBody = async (req: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 1024 * 1024) throw new Error('webhook_body_too_large')
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

const sendJson = (
  res: ServerResponse,
  status: number,
  payload: unknown,
): void => {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

type PullRequestWebhook = {
  action?: unknown
  after?: unknown
  repository?: { full_name?: unknown }
  pull_request?: { number?: unknown; html_url?: unknown; merged?: unknown }
}

const parsePayload = (body: Buffer): PullRequestWebhook | null => {
  try {
    const parsed = JSON.parse(body.toString()) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as PullRequestWebhook
      : null
  } catch {
    return null
  }
}

const expectedPrUrl = (
  runtime: WorkshopReviewRuntime,
  value: unknown,
  number: number,
): string | null => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    const expectedPath = `/${runtime.repositoryOwner}/${runtime.repositoryName}/pull/${number}`
    return url.protocol === 'https:'
      && url.hostname === 'github.com'
      && url.pathname.toLowerCase() === expectedPath.toLowerCase()
      ? value
      : null
  } catch {
    return null
  }
}

export async function handleWorkshopReviewWebhook(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database.Database,
  runtime: WorkshopReviewRuntime,
): Promise<boolean> {
  if (req.url !== '/api/github/webhook') return false
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, code: 'method_not_allowed' })
    return true
  }

  let body: Buffer
  try {
    body = await readBody(req)
  } catch {
    sendJson(res, 413, { ok: false, code: 'webhook_body_too_large' })
    return true
  }
  if (!verifyGitHubWebhook(
    runtime.webhookSecret,
    body,
    header(req, 'x-hub-signature-256'),
  )) {
    sendJson(res, 401, { ok: false, code: 'invalid_webhook_signature' })
    return true
  }

  const payload = parsePayload(body)
  if (!payload) {
    sendJson(res, 400, { ok: false, code: 'invalid_webhook_payload' })
    return true
  }
  const deliveryId = header(req, 'x-github-delivery')
  const eventName = header(req, 'x-github-event')
  if (!deliveryId || deliveryId.length > 200 || !eventName) {
    sendJson(res, 400, { ok: false, code: 'invalid_webhook_headers' })
    return true
  }
  const repository = payload.repository?.full_name
  const expectedRepository = `${runtime.repositoryOwner}/${runtime.repositoryName}`
  const prNumber = payload.pull_request?.number
  const prUrl = Number.isSafeInteger(prNumber) && (prNumber as number) > 0
    ? expectedPrUrl(runtime, payload.pull_request?.html_url, prNumber as number)
    : null
  if (
    typeof repository !== 'string'
    || repository.toLowerCase() !== expectedRepository.toLowerCase()
    || !prUrl
  ) {
    sendJson(res, 200, { ok: true, ignored: true })
    return true
  }

  const invalidatesReview =
    eventName === 'pull_request' && payload.action === 'synchronize'
    || eventName === 'pull_request'
      && payload.action === 'closed'
      && payload.pull_request?.merged !== true
    || eventName === 'pull_request_review' && payload.action === 'dismissed'
  if (invalidatesReview) {
    const result = db.transaction(() => {
      const inserted = db.prepare(`
        INSERT OR IGNORE INTO github_webhook_events (
          delivery_id, event_name, received_at
        ) VALUES (?, ?, ?)
      `).run(deliveryId, eventName, Date.now())
      if (inserted.changes === 0) return { duplicate: true as const }
      const synchronizedHead = eventName === 'pull_request'
        && payload.action === 'synchronize'
        && typeof payload.after === 'string'
        ? payload.after
        : undefined
      const invalidated = invalidateReviewedCard(db, {
        prUrl,
        ...(payload.action === 'closed' ? { prStatus: 'closed' } : {}),
        ...(synchronizedHead ? { preserveCommitSha: synchronizedHead } : {}),
      })
      return { invalidated }
    })()
    sendJson(res, 200, { ok: true, ...result })
    return true
  }

  if (eventName === 'pull_request_review' && payload.action === 'submitted') {
    let snapshot: WorkshopReviewSnapshot
    try {
      snapshot = await runtime.provider.getPullRequestSnapshot(prNumber as number)
    } catch {
      sendJson(res, 503, { ok: false, code: 'github_review_unavailable' })
      return true
    }
    const approvedReview = findApprovedHeadReview(snapshot)
    const result = db.transaction(() => {
      const inserted = db.prepare(`
        INSERT OR IGNORE INTO github_webhook_events (
          delivery_id, event_name, received_at
        ) VALUES (?, ?, ?)
      `).run(deliveryId, eventName, Date.now())
      if (inserted.changes === 0) return { duplicate: true as const }
      const approved = approvedReview
        ? approveReviewedVersion(db, {
            prUrl,
            commitSha: snapshot.headRefOid,
            reviewId: approvedReview.id,
          })
        : 0
      return approvedReview
        ? { approved }
        : { approved, invalidated: invalidateReviewedCard(db, { prUrl }) }
    })()
    sendJson(res, 200, { ok: true, ...result })
    return true
  }

  sendJson(res, 200, { ok: true, ignored: true })
  return true
}
