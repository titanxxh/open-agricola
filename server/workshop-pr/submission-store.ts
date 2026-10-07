import { nanoid } from 'nanoid'
import type { PostgresDatabase } from '../database/postgres'
import { consumeRateLimit } from '../database/rate-limit'
import { GitHubApiError } from './github-client'
import type { GenArgs, PrFile } from './code-gen'

export type SubmissionPayload = {
  appId: string
  installationId: string
  owner: string
  repository: string
  branch: string
  proposalId: string
  wcard: GenArgs['wcard']
  legacyPr?: {number:number;url:string;headSha:string;generatedPaths:string[]}
  previousFiles?: PrFile[]
  previousPrUrl?: string
  files?: PrFile[]
  mainSha?: string
  expectedHead?: string | null
  commitSha?: string
  finalCommitSha?: string
  pr?: { number: number; url: string }
  createAttempted?: boolean
}

export type SubmissionRow = {
  id: string; card_id: string; author_id: string; version_id: string; revision: number
  state: 'pending' | 'complete' | 'blocked' | 'failed'
  phase: 'prepare' | 'publish' | 'open' | 'finalize' | 'bind' | 'done'
  payload: string; lease_owner: string | null; lease_until: number
  error_code: string | null; retry_at: number; attempts: number; created_at: number; updated_at: number
}

/** Durable delivery state; leases fence local writes, and GitHub refs use their own expected-head condition. */
export class SubmissionStore {
  readonly db: PostgresDatabase
  constructor(db: PostgresDatabase) { this.db = db }

  async latest(cardId: string): Promise<SubmissionRow | undefined> {
    return this.db.prepare('SELECT * FROM workshop_submissions WHERE card_id = ? ORDER BY created_at DESC, id DESC LIMIT 1').get<SubmissionRow>(cardId)
  }

  async begin(input: { cardId: string; authorId: string; versionId: string; revision: number; payload: SubmissionPayload; restart?: boolean }): Promise<SubmissionRow> {
    return this.db.transaction(async () => {
      await this.db.prepare('SELECT id FROM workshop_cards WHERE id = ? FOR UPDATE').get(input.cardId)
      const latest = await this.latest(input.cardId)
      if (latest?.state === 'pending' || (!input.restart && latest?.state === 'complete' && latest.version_id === input.versionId && latest.revision === input.revision)) return latest
      const now = Date.now()
      const user = await consumeRateLimit(this.db, 'workshop-submission', input.authorId, 1, 10 * 60_000, now)
      const global = await consumeRateLimit(this.db, 'workshop-submission-global', 'all', 20, 60_000, now)
      if (!user.allowed || !global.allowed) throw new GitHubApiError('submission rate limited', 'rate_limited', 429, Math.ceil((Math.max(user.resetAt,global.resetAt)-now)/1000))
      const id = nanoid()
      return (await this.db.prepare(`
        INSERT INTO workshop_submissions(id,card_id,author_id,version_id,revision,payload,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?) RETURNING *
      `).get<SubmissionRow>(id,input.cardId,input.authorId,input.versionId,input.revision,JSON.stringify(input.payload),Math.max(now,(latest?.created_at ?? 0)+1),now))!
    })()
  }

  async due(): Promise<SubmissionRow[]> {
    return this.db.prepare(`SELECT * FROM workshop_submissions
      WHERE state = 'pending' AND attempts < 4 AND lease_until <= ? AND retry_at <= ?
      ORDER BY updated_at LIMIT 5`).all<SubmissionRow>(Date.now(),Date.now())
  }

  async resume(id: string): Promise<SubmissionRow | undefined> {
    return this.db.prepare(`UPDATE workshop_submissions SET state = 'pending', attempts = 0
      WHERE id = ? AND state IN ('pending','blocked') AND lease_until <= ? AND retry_at <= ? RETURNING *`).get<SubmissionRow>(id,Date.now(),Date.now())
  }

  async claim(id: string): Promise<SubmissionRow | undefined> {
    const now = Date.now()
    return this.db.prepare(`UPDATE workshop_submissions
      SET lease_owner = ?, lease_until = ?, attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND state = 'pending' AND lease_until <= ? AND retry_at <= ? AND attempts < 4 RETURNING *
    `).get<SubmissionRow>(nanoid(),now+60_000,now,id,now,now)
  }

  async save(row: SubmissionRow, payload: SubmissionPayload): Promise<void> {
    const now = Date.now()
    const result = await this.db.prepare(`UPDATE workshop_submissions
      SET phase = ?, payload = ?, state = ?, error_code = ?, retry_at = ?, updated_at = ?, lease_until = ?
      WHERE id = ? AND lease_owner = ? AND lease_until > ? AND state = 'pending'
    `).run(row.phase,JSON.stringify(payload),row.state,row.error_code,row.retry_at,now,now+60_000,row.id,row.lease_owner,now)
    if (!result.changes) throw new GitHubApiError('submission execution lease lost', 'submission_busy', 409)
    row.payload = JSON.stringify(payload)
  }

  async release(row: SubmissionRow): Promise<void> {
    await this.db.prepare('UPDATE workshop_submissions SET lease_owner = NULL, lease_until = 0 WHERE id = ? AND lease_owner = ?')
      .run(row.id,row.lease_owner)
  }
}
