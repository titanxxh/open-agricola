import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto'
import type Database from 'better-sqlite3'
import {
  createCodeChallenge,
  type GitHubFailure,
  type GitHubIssueClient,
  type GitHubIssueResult,
  type GitHubUserTokens,
} from './github-issue-client.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const EVIDENCE_TTL_MS = 30 * DAY_MS
const ATTEMPT_TTL_MS = 30 * DAY_MS
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const CLAIM_TTL_MS = 5 * 60 * 1000
const RETRY_DELAYS = [30_000, 120_000, 600_000] as const

type SqliteDb = Pick<Database.Database, 'prepare' | 'transaction'>

type EncryptedValue = {
  ciphertext: Buffer
  nonce: Buffer
  tag: Buffer
  keyId: string
}

type ConnectionRow = {
  user_id: string
  github_user_id: string
  access_token_ciphertext: Buffer
  access_token_nonce: Buffer
  access_token_tag: Buffer
  refresh_token_ciphertext: Buffer | null
  refresh_token_nonce: Buffer | null
  refresh_token_tag: Buffer | null
  key_id: string
  access_token_expires_at: number
  refresh_token_expires_at: number | null
}

type OAuthStateRow = {
  user_id: string
  return_to: string | null
  pkce_verifier_ciphertext: Buffer
  pkce_verifier_nonce: Buffer
  pkce_verifier_tag: Buffer
  pkce_verifier_key_id: string
}

type AnchorRow = {
  player_index: number
  room_version: number
  step_no: number
  frame_hash: string
}

type ContextRow = {
  lifecycle: string
}

type ReportRow = {
  submission_id: string
  reporter_user_id: string | null
  room_id: string
  player_index: number
  lifecycle: 'active' | 'completed'
  room_version: number
  step_no: number
  frame_hash: string
  phenomenon: string | null
  author_identity: 'github_user' | 'hosted' | null
  status: BugReportStatus
  github_issue_number: number | null
  github_issue_url: string | null
  evidence_expires_at: number | null
  claim_token: string | null
  claimed_at: number | null
  next_attempt_at: number | null
  submitted_at: number | null
  last_error_code: string | null
  created_at: number
  updated_at: number
}

type Claim = {
  report: ReportRow
  token: string
  mode: 'create' | 'reconcile'
}

export type BugReportStatus =
  | 'draft'
  | 'queued'
  | 'submitting'
  | 'reconcile'
  | 'retry'
  | 'needs_reconnect'
  | 'failed'
  | 'submitted'

export type BugReportView = {
  submissionId: string
  roomId: string
  reporterUserId: string | null
  playerIndex: number
  lifecycle: 'active' | 'completed'
  roomVersion: number
  stepNo: number
  frameHash: string
  phenomenon: string | null
  authorIdentity: 'github_user' | 'hosted' | null
  status: BugReportStatus
  issueNumber: number | null
  issueUrl: string | null
  lastErrorCode: string | null
  createdAt: number
  updatedAt: number
}

export class BugReportError extends Error {
  readonly code: string
  readonly status: number
  readonly retryAt?: number

  constructor(code: string, status: number, retryAt?: number) {
    super(code)
    this.code = code
    this.status = status
    this.retryAt = retryAt
  }
}

export class TokenCipher {
  private readonly activeKeyId: string
  private readonly keys: ReadonlyMap<string, Buffer>

  constructor(activeKeyId: string, keys: ReadonlyMap<string, Buffer>) {
    if (!activeKeyId || !keys.has(activeKeyId)) {
      throw new Error('bug report token active key is missing')
    }
    for (const key of keys.values()) {
      if (key.length !== 32) throw new Error('bug report token keys must be 32 bytes')
    }
    this.activeKeyId = activeKeyId
    this.keys = keys
  }

  static fromEnv(): TokenCipher | null {
    const activeKeyId = process.env.BUG_REPORT_TOKEN_ACTIVE_KEY_ID?.trim() ?? ''
    const raw = process.env.BUG_REPORT_TOKEN_ENCRYPTION_KEYS?.trim() ?? ''
    if (!activeKeyId || !raw) return null
    const parsed = JSON.parse(raw) as Record<string, string>
    return new TokenCipher(
      activeKeyId,
      new Map(Object.entries(parsed).map(([keyId, value]) => [
        keyId,
        Buffer.from(value, 'base64'),
      ])),
    )
  }

  encrypt(value: string): EncryptedValue {
    const key = this.keys.get(this.activeKeyId)!
    const nonce = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, nonce)
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ])
    return {
      ciphertext,
      nonce,
      tag: cipher.getAuthTag(),
      keyId: this.activeKeyId,
    }
  }

  decrypt(value: EncryptedValue): string {
    const key = this.keys.get(value.keyId)
    if (!key) throw new Error('bug report token key is unavailable')
    const decipher = createDecipheriv('aes-256-gcm', key, value.nonce)
    decipher.setAuthTag(value.tag)
    return Buffer.concat([
      decipher.update(value.ciphertext),
      decipher.final(),
    ]).toString('utf8')
  }
}

const hashState = (state: string): string =>
  createHash('sha256').update(state).digest('hex')

const cleanPhenomenon = (value: unknown): string => {
  if (typeof value !== 'string') throw new BugReportError('phenomenon_required', 400)
  const phenomenon = value.trim()
  const length = Array.from(phenomenon).length
  if (length === 0) throw new BugReportError('phenomenon_required', 400)
  if (length > 2000) throw new BugReportError('phenomenon_too_long', 400)
  return phenomenon
}

const toView = (row: ReportRow): BugReportView => ({
  submissionId: row.submission_id,
  roomId: row.room_id,
  reporterUserId: row.reporter_user_id,
  playerIndex: row.player_index,
  lifecycle: row.lifecycle,
  roomVersion: row.room_version,
  stepNo: row.step_no,
  frameHash: row.frame_hash,
  phenomenon: row.phenomenon,
  authorIdentity: row.author_identity,
  status: row.status,
  issueNumber: row.github_issue_number,
  issueUrl: row.github_issue_url,
  lastErrorCode: row.last_error_code,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const reportColumns = `
  submission_id, reporter_user_id, room_id, player_index, lifecycle,
  room_version, step_no, frame_hash, phenomenon, author_identity, status,
  github_issue_number, github_issue_url, evidence_expires_at, claim_token,
  claimed_at, next_attempt_at, submitted_at, last_error_code, created_at,
  updated_at
`

export class BugReportStore {
  private readonly db: SqliteDb
  private readonly cipher: TokenCipher
  private readonly now: () => number

  constructor(
    db: SqliteDb,
    cipher: TokenCipher,
    now: () => number = Date.now,
  ) {
    this.db = db
    this.cipher = cipher
    this.now = now
  }

  connectionStatus(userId: string): {
    connected: boolean
    githubUserId?: string
    expiresAt?: number
  } {
    const row = this.db.prepare(`
      SELECT github_user_id, access_token_expires_at
      FROM issue_submission_connections
      WHERE user_id = ? AND revoked_at IS NULL
    `).get(userId) as {
      github_user_id: string
      access_token_expires_at: number
    } | undefined
    return row
      ? {
          connected: true,
          githubUserId: row.github_user_id,
          expiresAt: row.access_token_expires_at,
        }
      : { connected: false }
  }

  saveConnection(
    userId: string,
    githubUserId: string,
    tokens: GitHubUserTokens,
  ): void {
    const linked = this.db.prepare(`
      SELECT provider_user_id
      FROM auth_identities
      WHERE user_id = ? AND provider = 'github'
    `).get(userId) as { provider_user_id: string } | undefined
    if (linked && linked.provider_user_id !== githubUserId) {
      throw new BugReportError('github_identity_mismatch', 409)
    }
    const owner = this.db.prepare(`
      SELECT user_id
      FROM issue_submission_connections
      WHERE github_user_id = ?
    `).get(githubUserId) as { user_id: string } | undefined
    if (owner && owner.user_id !== userId) {
      throw new BugReportError('github_identity_already_connected', 409)
    }
    const access = this.cipher.encrypt(tokens.accessToken)
    const refresh = tokens.refreshToken
      ? this.cipher.encrypt(tokens.refreshToken)
      : null
    const now = this.now()
    this.db.prepare(`
      INSERT INTO issue_submission_connections (
        user_id, github_user_id,
        access_token_ciphertext, access_token_nonce, access_token_tag,
        refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag,
        key_id, access_token_expires_at, refresh_token_expires_at,
        revoked_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        github_user_id = excluded.github_user_id,
        access_token_ciphertext = excluded.access_token_ciphertext,
        access_token_nonce = excluded.access_token_nonce,
        access_token_tag = excluded.access_token_tag,
        refresh_token_ciphertext = excluded.refresh_token_ciphertext,
        refresh_token_nonce = excluded.refresh_token_nonce,
        refresh_token_tag = excluded.refresh_token_tag,
        key_id = excluded.key_id,
        access_token_expires_at = excluded.access_token_expires_at,
        refresh_token_expires_at = excluded.refresh_token_expires_at,
        revoked_at = NULL,
        updated_at = excluded.updated_at
    `).run(
      userId,
      githubUserId,
      access.ciphertext,
      access.nonce,
      access.tag,
      refresh?.ciphertext ?? null,
      refresh?.nonce ?? null,
      refresh?.tag ?? null,
      access.keyId,
      tokens.accessTokenExpiresAt,
      tokens.refreshTokenExpiresAt ?? null,
      now,
      now,
    )
  }

  connectionTokens(userId: string): GitHubUserTokens | null {
    const row = this.db.prepare(`
      SELECT user_id, github_user_id,
             access_token_ciphertext, access_token_nonce, access_token_tag,
             refresh_token_ciphertext, refresh_token_nonce, refresh_token_tag,
             key_id, access_token_expires_at, refresh_token_expires_at
      FROM issue_submission_connections
      WHERE user_id = ? AND revoked_at IS NULL
    `).get(userId) as ConnectionRow | undefined
    if (!row) return null
    const accessToken = this.cipher.decrypt({
      ciphertext: row.access_token_ciphertext,
      nonce: row.access_token_nonce,
      tag: row.access_token_tag,
      keyId: row.key_id,
    })
    const hasRefresh = row.refresh_token_ciphertext
      && row.refresh_token_nonce
      && row.refresh_token_tag
    return {
      accessToken,
      accessTokenExpiresAt: row.access_token_expires_at,
      ...(hasRefresh
        ? {
            refreshToken: this.cipher.decrypt({
              ciphertext: row.refresh_token_ciphertext!,
              nonce: row.refresh_token_nonce!,
              tag: row.refresh_token_tag!,
              keyId: row.key_id,
            }),
            refreshTokenExpiresAt: row.refresh_token_expires_at ?? undefined,
          }
        : {}),
    }
  }

  disconnect(userId: string): void {
    this.db.prepare(`
      DELETE FROM issue_submission_connections WHERE user_id = ?
    `).run(userId)
  }

  disconnectGithubUser(githubUserId: string): void {
    this.db.prepare(`
      DELETE FROM issue_submission_connections WHERE github_user_id = ?
    `).run(githubUserId)
  }

  createConnectionState(
    userId: string,
    returnTo: string,
  ): {
    state: string
    codeChallenge: string
  } {
    const state = randomBytes(32).toString('base64url')
    const verifier = randomBytes(48).toString('base64url')
    const encrypted = this.cipher.encrypt(verifier)
    const now = this.now()
    this.db.prepare(`
      INSERT INTO oauth_states (
        state_hash, provider, intent, user_id, return_to, expires_at, created_at,
        pkce_verifier_ciphertext, pkce_verifier_nonce, pkce_verifier_tag,
        pkce_verifier_key_id
      )
      VALUES (?, 'github', 'bug_report', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      hashState(state),
      userId,
      returnTo,
      now + OAUTH_STATE_TTL_MS,
      now,
      encrypted.ciphertext,
      encrypted.nonce,
      encrypted.tag,
      encrypted.keyId,
    )
    return { state, codeChallenge: createCodeChallenge(verifier) }
  }

  consumeConnectionState(state: string): {
    userId: string
    returnTo: string
    verifier: string
  } | null {
    const now = this.now()
    const stateHash = hashState(state)
    const row = this.db.transaction(() => {
      const found = this.db.prepare(`
        SELECT user_id, return_to,
               pkce_verifier_ciphertext, pkce_verifier_nonce,
               pkce_verifier_tag, pkce_verifier_key_id
        FROM oauth_states
        WHERE state_hash = ?
          AND provider = 'github'
          AND intent = 'bug_report'
          AND used_at IS NULL
          AND expires_at > ?
      `).get(stateHash, now) as OAuthStateRow | undefined
      if (!found) return null
      const changed = this.db.prepare(`
        UPDATE oauth_states
        SET used_at = ?
        WHERE state_hash = ? AND used_at IS NULL
      `).run(now, stateHash)
      return changed.changes === 1 ? found : null
    })()
    if (!row) return null
    return {
      userId: row.user_id,
      returnTo: row.return_to ?? '/',
      verifier: this.cipher.decrypt({
        ciphertext: row.pkce_verifier_ciphertext,
        nonce: row.pkce_verifier_nonce,
        tag: row.pkce_verifier_tag,
        keyId: row.pkce_verifier_key_id,
      }),
    }
  }

  createDraft(input: {
    userId: string
    roomId: string
    phenomenon: unknown
    stepNo?: unknown
    frameHash?: unknown
  }): BugReportView {
    const phenomenon = cleanPhenomenon(input.phenomenon)
    const context = this.db.prepare(`
      SELECT lifecycle FROM game_contexts WHERE room_id = ?
    `).get(input.roomId) as ContextRow | undefined
    if (!context) throw new BugReportError('unknown_context', 404)
    let anchor: AnchorRow | undefined
    if (context.lifecycle === 'active') {
      if (input.stepNo !== undefined || input.frameHash !== undefined) {
        throw new BugReportError('anchor_mismatch', 409)
      }
      anchor = this.db.prepare(`
        SELECT room_players.player_index,
               step.room_version,
               step.step_no,
               step.frame_hash
        FROM rooms
        JOIN room_players
          ON room_players.room_id = rooms.id
         AND room_players.user_id = ?
        JOIN game_replay_steps AS step
          ON step.room_id = rooms.id
         AND step.step_no = (
           SELECT MAX(latest.step_no)
           FROM game_replay_steps AS latest
           WHERE latest.room_id = rooms.id
         )
        WHERE rooms.id = ?
      `).get(input.userId, input.roomId) as AnchorRow | undefined
    } else if (context.lifecycle === 'completed') {
      if (
        !Number.isSafeInteger(input.stepNo)
        || typeof input.frameHash !== 'string'
        || !/^[a-f0-9]{64}$/.test(input.frameHash)
      ) {
        throw new BugReportError('anchor_mismatch', 409)
      }
      anchor = this.db.prepare(`
        SELECT result_player.player_index,
               step.room_version,
               step.step_no,
               step.frame_hash
        FROM game_result_players AS result_player
        JOIN game_replay_steps AS step
          ON step.room_id = result_player.room_id
         AND step.step_no = ?
         AND step.frame_hash = ?
        WHERE result_player.room_id = ?
          AND result_player.user_id = ?
      `).get(
        input.stepNo,
        input.frameHash,
        input.roomId,
        input.userId,
      ) as AnchorRow | undefined
    } else {
      throw new BugReportError(`context_${context.lifecycle}`, 410)
    }
    if (!anchor) throw new BugReportError('not_participant', 403)
    const submissionId = randomUUID()
    const now = this.now()
    this.db.prepare(`
      INSERT INTO bug_reports (
        submission_id, reporter_user_id, room_id, player_index, lifecycle,
        room_version, step_no, frame_hash, phenomenon, status,
        evidence_expires_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(
      submissionId,
      input.userId,
      input.roomId,
      anchor.player_index,
      context.lifecycle,
      anchor.room_version,
      anchor.step_no,
      anchor.frame_hash,
      phenomenon,
      context.lifecycle === 'active' ? now + EVIDENCE_TTL_MS : null,
      now,
      now,
    )
    return this.getOwned(submissionId, input.userId)
  }

  getOwned(submissionId: string, userId: string): BugReportView {
    const row = this.report(submissionId)
    if (!row) throw new BugReportError('bug_report_not_found', 404)
    if (row.reporter_user_id !== userId) {
      throw new BugReportError('bug_report_forbidden', 403)
    }
    return toView(row)
  }

  updateDraft(
    submissionId: string,
    userId: string,
    input: {
      phenomenon?: unknown
      authorIdentity?: unknown
      confirmHosted?: unknown
    },
  ): BugReportView {
    const row = this.ownedRow(submissionId, userId)
    if (row.status === 'submitted') {
      throw new BugReportError('bug_report_already_submitted', 409)
    }
    if (!['draft', 'needs_reconnect', 'failed'].includes(row.status)) {
      throw new BugReportError('bug_report_update_conflict', 409)
    }
    let phenomenon = row.phenomenon
    let author = row.author_identity
    if (input.phenomenon !== undefined) {
      phenomenon = cleanPhenomenon(input.phenomenon)
    }
    if (input.authorIdentity !== undefined) {
      if (
        input.authorIdentity !== 'github_user'
        && input.authorIdentity !== 'hosted'
      ) {
        throw new BugReportError('invalid_author_identity', 400)
      }
      if (input.authorIdentity === 'hosted' && input.confirmHosted !== true) {
        throw new BugReportError('hosted_identity_confirmation_required', 400)
      }
      if (
        input.authorIdentity === 'github_user'
        && !this.connectionStatus(userId).connected
      ) {
        throw new BugReportError('github_connection_required', 409)
      }
      author = input.authorIdentity
    }
    const now = this.now()
    this.db.prepare(`
      UPDATE bug_reports
      SET phenomenon = ?,
          author_identity = ?,
          updated_at = ?,
          last_error_code = NULL
      WHERE submission_id = ? AND reporter_user_id = ?
    `).run(phenomenon, author, now, submissionId, userId)
    return this.getOwned(submissionId, userId)
  }

  queue(submissionId: string, userId: string): BugReportView {
    const row = this.ownedRow(submissionId, userId)
    if (row.status === 'submitted') return toView(row)
    if (['queued', 'submitting', 'reconcile', 'retry'].includes(row.status)) {
      return toView(row)
    }
    cleanPhenomenon(row.phenomenon)
    if (!row.author_identity) {
      throw new BugReportError('author_identity_required', 400)
    }
    if (
      row.author_identity === 'github_user'
      && !this.connectionStatus(userId).connected
    ) {
      throw new BugReportError('github_connection_required', 409)
    }
    if (row.submitted_at === null) this.assertQuota(row)
    const now = this.now()
    const status = row.status === 'draft' ? 'queued' : 'reconcile'
    this.db.prepare(`
      UPDATE bug_reports
      SET status = ?,
          submitted_at = COALESCE(submitted_at, ?),
          next_attempt_at = ?,
          claim_token = NULL,
          claimed_at = NULL,
          last_error_code = NULL,
          updated_at = ?
      WHERE submission_id = ? AND reporter_user_id = ?
    `).run(status, now, now, now, submissionId, userId)
    return this.getOwned(submissionId, userId)
  }

  deleteDraft(submissionId: string, userId: string): void {
    const row = this.ownedRow(submissionId, userId)
    if (!['draft', 'needs_reconnect', 'failed'].includes(row.status)) {
      throw new BugReportError('bug_report_delete_conflict', 409)
    }
    this.db.prepare(`
      DELETE FROM bug_reports
      WHERE submission_id = ? AND reporter_user_id = ?
    `).run(submissionId, userId)
  }

  claim(submissionId?: string): Claim | null {
    const now = this.now()
    return this.db.transaction(() => {
      this.db.prepare(`
        UPDATE bug_reports
        SET status = 'reconcile',
            claim_token = NULL,
            claimed_at = NULL,
            next_attempt_at = ?,
            last_error_code = 'delivery_interrupted',
            updated_at = ?
        WHERE status = 'submitting'
          AND claimed_at < ?
      `).run(now, now, now - CLAIM_TTL_MS)
      const row = this.db.prepare(`
        SELECT ${reportColumns}
        FROM bug_reports
        WHERE status IN ('queued', 'retry', 'reconcile')
          AND claim_token IS NULL
          AND COALESCE(next_attempt_at, 0) <= ?
          ${submissionId ? 'AND submission_id = ?' : ''}
        ORDER BY COALESCE(next_attempt_at, created_at), created_at
        LIMIT 1
      `).get(...(submissionId ? [now, submissionId] : [now])) as ReportRow | undefined
      if (!row) return null
      const token = randomUUID()
      const changed = this.db.prepare(`
        UPDATE bug_reports
        SET status = 'submitting',
            claim_token = ?,
            claimed_at = ?,
            updated_at = ?
        WHERE submission_id = ?
          AND status = ?
          AND claim_token IS NULL
      `).run(token, now, now, row.submission_id, row.status)
      return changed.changes === 1
        ? {
            report: { ...row, status: 'submitting' as const },
            token,
            mode: row.status === 'reconcile'
              ? 'reconcile' as const
              : 'create' as const,
          }
        : null
    })()
  }

  recordAttempt(
    submissionId: string,
    kind: 'create' | 'reconcile',
    outcome: string,
    startedAt: number,
    failure?: GitHubFailure,
  ): void {
    const now = this.now()
    this.db.prepare(`
      INSERT INTO bug_report_attempts (
        submission_id, kind, outcome, http_status, github_request_id,
        started_at, finished_at, retry_at, expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      submissionId,
      kind,
      outcome,
      failure?.status ?? null,
      failure?.requestId ?? null,
      startedAt,
      now,
      failure?.retryAt ?? null,
      now + ATTEMPT_TTL_MS,
    )
  }

  canSendGithubRequest(): { ok: true } | { ok: false; retryAt: number } {
    const now = this.now()
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count, MIN(started_at) AS oldest
      FROM bug_report_attempts
      WHERE kind = 'create' AND started_at > ?
    `).get(now - 60_000) as { count: number; oldest: number | null }
    return row.count < 20
      ? { ok: true }
      : { ok: false, retryAt: (row.oldest ?? now) + 60_000 }
  }

  retryCount(submissionId: string): number {
    const row = this.db.prepare(`
      SELECT
        SUM(CASE WHEN kind = 'create' AND outcome = 'uncertain' THEN 1 ELSE 0 END)
          AS create_count,
        SUM(CASE WHEN kind = 'reconcile' AND outcome = 'uncertain' THEN 1 ELSE 0 END)
          AS reconcile_count
      FROM bug_report_attempts
      WHERE submission_id = ?
    `).get(submissionId) as {
      create_count: number
      reconcile_count: number
    }
    return Math.max(row.create_count, row.reconcile_count)
  }

  finish(
    claim: Claim,
    result: GitHubIssueResult,
  ): void {
    const now = this.now()
    if (!result.ok) throw new Error('successful GitHub issue result required')
    this.db.prepare(`
      UPDATE bug_reports
      SET status = 'submitted',
          phenomenon = NULL,
          github_issue_number = ?,
          github_issue_url = ?,
          claim_token = NULL,
          claimed_at = NULL,
          next_attempt_at = NULL,
          last_error_code = NULL,
          updated_at = ?
      WHERE submission_id = ? AND claim_token = ?
    `).run(
      result.number,
      result.url,
      now,
      claim.report.submission_id,
      claim.token,
    )
  }

  defer(
    claim: Claim,
    status: 'reconcile' | 'retry' | 'needs_reconnect' | 'failed',
    code: string,
    nextAttemptAt?: number,
  ): void {
    const now = this.now()
    this.db.prepare(`
      UPDATE bug_reports
      SET status = ?,
          claim_token = NULL,
          claimed_at = NULL,
          next_attempt_at = ?,
          last_error_code = ?,
          updated_at = ?
      WHERE submission_id = ? AND claim_token = ?
    `).run(
      status,
      nextAttemptAt ?? null,
      code,
      now,
      claim.report.submission_id,
      claim.token,
    )
  }

  reportForEvidence(submissionId: string): ReportRow | null {
    return this.report(submissionId)
  }

  private report(submissionId: string): ReportRow | null {
    return (this.db.prepare(`
      SELECT ${reportColumns}
      FROM bug_reports
      WHERE submission_id = ?
    `).get(submissionId) as ReportRow | undefined) ?? null
  }

  private ownedRow(submissionId: string, userId: string): ReportRow {
    const row = this.report(submissionId)
    if (!row) throw new BugReportError('bug_report_not_found', 404)
    if (row.reporter_user_id !== userId) {
      throw new BugReportError('bug_report_forbidden', 403)
    }
    return row
  }

  private assertQuota(report: ReportRow): void {
    const now = this.now()
    const tenMinutes = this.db.prepare(`
      SELECT COUNT(*) AS count, MIN(submitted_at) AS oldest
      FROM bug_reports
      WHERE reporter_user_id = ?
        AND submitted_at > ?
    `).get(report.reporter_user_id, now - 10 * 60_000) as {
      count: number
      oldest: number | null
    }
    if (tenMinutes.count >= 3) {
      throw new BugReportError(
        'bug_report_rate_limited',
        429,
        (tenMinutes.oldest ?? now) + 10 * 60_000,
      )
    }
    const daily = this.db.prepare(`
      SELECT COUNT(*) AS count, MIN(submitted_at) AS oldest
      FROM bug_reports
      WHERE reporter_user_id = ?
        AND submitted_at > ?
    `).get(report.reporter_user_id, now - DAY_MS) as {
      count: number
      oldest: number | null
    }
    if (daily.count >= 10) {
      throw new BugReportError(
        'bug_report_rate_limited',
        429,
        (daily.oldest ?? now) + DAY_MS,
      )
    }
    const userRoom = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM bug_reports
      WHERE reporter_user_id = ?
        AND room_id = ?
        AND submitted_at IS NOT NULL
    `).get(report.reporter_user_id, report.room_id) as { count: number }
    if (userRoom.count >= 5) {
      throw new BugReportError('bug_report_room_limit', 429)
    }
    const room = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM bug_reports
      WHERE room_id = ? AND submitted_at IS NOT NULL
    `).get(report.room_id) as { count: number }
    if (room.count >= 30) {
      throw new BugReportError('bug_report_room_limit', 429)
    }
  }
}

export type IssueDeliveryAdapter = Pick<
  GitHubIssueClient,
  'createIssue' | 'findIssueByMarker' | 'refreshUserToken'
>

const neutralizeMentions = (value: string): string =>
  value
    .replace(/\p{Cc}/gu, (character) =>
      character === '\n' || character === '\r' || character === '\t'
        ? character
        : '')
    .replace(/@(?=[A-Za-z0-9])/g, '@\u200B')

const code = (value: string | number): string =>
  `\`${String(value).replaceAll('`', "'")}\``

const contextUrl = (report: ReportRow, appOrigin: string): string => {
  try {
    const url = new URL(appOrigin)
    url.searchParams.set('context', report.room_id)
    url.searchParams.set('step', String(report.step_no))
    url.searchParams.set('frame', report.frame_hash)
    url.searchParams.set('perspective', `p${report.player_index + 1}`)
    return url.toString()
  } catch {
    return ''
  }
}

export const buildIssue = (
  report: ReportRow,
  appOrigin: string,
): {
  title: string
  body: string
  marker: string
} => {
  const phenomenon = neutralizeMentions(cleanPhenomenon(report.phenomenon))
  const firstLine = phenomenon.split(/\r?\n/, 1)[0]!.trim()
  const summary = Array.from(firstLine).slice(0, 120).join('')
  const marker = `<!-- open-agricola-report:${report.submission_id} -->`
  const link = contextUrl(report, appOrigin)
  const body = [
    '## Phenomenon',
    '',
    phenomenon,
    '',
    '## Game context',
    '',
    `- Reporter site ID: ${code(report.reporter_user_id ?? 'deleted')}`,
    `- Reporter seat: ${code(`p${report.player_index + 1}`)}`,
    `- Room ID: ${code(report.room_id)}`,
    `- Lifecycle: ${code(report.lifecycle)}`,
    `- Room version: ${code(report.room_version)}`,
    `- Step: ${code(report.step_no)}`,
    `- Frame hash: ${code(report.frame_hash)}`,
    ...(link ? [`- Context link: ${link}`] : []),
    '',
    marker,
  ].join('\n')
  return {
    title: `Game bug: ${summary}`,
    body,
    marker,
  }
}

export class BugReportDelivery {
  private readonly store: BugReportStore
  private readonly client: IssueDeliveryAdapter
  private readonly appOrigin: string
  private readonly now: () => number
  private running = false

  constructor(
    store: BugReportStore,
    client: IssueDeliveryAdapter,
    appOrigin: string,
    now: () => number = Date.now,
  ) {
    this.store = store
    this.client = client
    this.appOrigin = appOrigin
    this.now = now
  }

  async deliver(submissionId?: string): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const claim = this.store.claim(submissionId)
      if (claim) await this.deliverClaim(claim)
    } finally {
      this.running = false
    }
  }

  async deliverDue(limit = 20): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      for (let count = 0; count < limit; count += 1) {
        const claim = this.store.claim()
        if (!claim) return
        await this.deliverClaim(claim)
      }
    } finally {
      this.running = false
    }
  }

  private async deliverClaim(claim: Claim): Promise<void> {
    const report = claim.report
    if (!report.reporter_user_id || !report.author_identity) {
      this.store.defer(claim, 'failed', 'bug_report_invalid')
      return
    }
    const issue = buildIssue(report, this.appOrigin)
    let userToken: string | undefined
    if (report.author_identity === 'github_user') {
      const tokens = this.store.connectionTokens(report.reporter_user_id)
      if (!tokens) {
        this.store.defer(claim, 'needs_reconnect', 'github_connection_required')
        return
      }
      if (tokens.accessTokenExpiresAt <= this.now() + 60_000) {
        if (
          !tokens.refreshToken
          || (tokens.refreshTokenExpiresAt ?? 0) <= this.now()
        ) {
          this.store.disconnect(report.reporter_user_id)
          this.store.defer(claim, 'needs_reconnect', 'github_connection_required')
          return
        }
        try {
          const refreshed = await this.client.refreshUserToken(tokens.refreshToken)
          const githubUserId = this.store.connectionStatus(report.reporter_user_id)
            .githubUserId
          if (!githubUserId) throw new Error('github connection missing')
          this.store.saveConnection(
            report.reporter_user_id,
            githubUserId,
            refreshed,
          )
          userToken = refreshed.accessToken
        } catch {
          this.store.disconnect(report.reporter_user_id)
          this.store.defer(claim, 'needs_reconnect', 'github_connection_required')
          return
        }
      } else {
        userToken = tokens.accessToken
      }
    }

    if (claim.mode === 'reconcile') {
      const reconciled = await this.reconcile(claim, issue.marker, userToken)
      if (reconciled !== 'not_found') return
    }

    const slot = this.store.canSendGithubRequest()
    if (!slot.ok) {
      this.store.defer(claim, 'retry', 'github_queue_limited', slot.retryAt)
      return
    }
    const startedAt = this.now()
    const result = await this.client.createIssue(
      report.author_identity,
      { title: issue.title, body: issue.body },
      userToken,
    )
    this.store.recordAttempt(
      report.submission_id,
      'create',
      result.ok ? 'success' : result.kind,
      startedAt,
      result.ok ? undefined : result,
    )
    if (result.ok) {
      this.store.finish(claim, result)
      return
    }
    if (result.kind === 'uncertain') {
      const reconciled = await this.reconcile(claim, issue.marker, userToken)
      if (reconciled !== 'not_found') return
      this.deferUncertain(claim)
      return
    }
    this.deferFailure(claim, result)
  }

  private async reconcile(
    claim: Claim,
    marker: string,
    userToken?: string,
  ): Promise<'done' | 'not_found'> {
    const report = claim.report
    const startedAt = this.now()
    const result = await this.client.findIssueByMarker(
      report.author_identity!,
      marker,
      report.submitted_at ?? report.created_at,
      userToken,
    )
    this.store.recordAttempt(
      report.submission_id,
      'reconcile',
      result.ok
        ? ('found' in result && result.found === false ? 'not_found' : 'found')
        : result.kind,
      startedAt,
      result.ok ? undefined : result,
    )
    if (result.ok && !('found' in result)) {
      this.store.finish(claim, result)
      return 'done'
    }
    if (result.ok) return 'not_found'
    if (result.kind === 'auth') {
      this.deferAuthFailure(claim, result.code)
      return 'done'
    }
    if (result.kind === 'rate_limit') {
      this.store.defer(
        claim,
        'reconcile',
        result.code,
        result.retryAt ?? this.now() + 60_000,
      )
      return 'done'
    }
    if (result.kind === 'permission' || result.kind === 'terminal') {
      this.store.defer(claim, 'failed', result.code)
      return 'done'
    }
    this.deferUncertain(claim)
    return 'done'
  }

  private deferUncertain(claim: Claim): void {
    const attempts = this.store.retryCount(claim.report.submission_id)
    if (attempts > RETRY_DELAYS.length) {
      this.store.defer(claim, 'failed', 'github_result_uncertain')
      return
    }
    this.store.defer(
      claim,
      'reconcile',
      'github_result_uncertain',
      this.now() + RETRY_DELAYS[Math.max(0, attempts - 1)]!,
    )
  }

  private deferFailure(claim: Claim, failure: GitHubFailure): void {
    if (failure.kind === 'auth') {
      this.deferAuthFailure(claim, failure.code)
      return
    }
    if (failure.kind === 'rate_limit') {
      this.store.defer(
        claim,
        'retry',
        failure.code,
        failure.retryAt ?? this.now() + 60_000,
      )
      return
    }
    this.store.defer(claim, 'failed', failure.code)
  }

  private deferAuthFailure(claim: Claim, code: string): void {
    if (claim.report.author_identity === 'github_user') {
      if (claim.report.reporter_user_id) {
        this.store.disconnect(claim.report.reporter_user_id)
      }
      this.store.defer(claim, 'needs_reconnect', code)
      return
    }
    this.store.defer(claim, 'failed', code)
  }
}
