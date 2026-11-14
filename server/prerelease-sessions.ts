import { createHash, createHmac, randomBytes } from 'node:crypto'
import {
  isPrereleaseIdentityAuthorized, PRERELEASE_SESSION_MAX_AGE_MS,
  type PrereleaseIdentityState, type PrereleaseIdentityEvent,
} from '../shared/contract/prerelease-identity'
import { normalizePrereleaseReturnPath, type PrereleaseRuntime } from '../shared/contract/prerelease-runtime'
import type { AuthUser } from './auth'
import { PrereleaseInvalidations, type InvalidationSubject } from './prerelease-invalidations'
import { getDb } from './db'
import type { PostgresDatabase } from './database/postgres'
import { FormalPrereleaseIdentityClient, parsePrereleaseIdentityState, PrereleaseIdentityError, type PrereleaseIdentityClient } from './prerelease-identity-client'

const opaque = () => randomBytes(32).toString('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('base64url')
const secret = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value)
export type PrereleaseUser = Pick<AuthUser, 'id' | 'username' | 'displayName'> & { isAdmin: false }
export type PrereleaseSession = { user: PrereleaseUser; expiresAt: number; validUntil: number }
export type PrereleaseInvalidation = { userId: string; grantId?: string; token?: string; reason: 'source_revoked' | 'account_deleted' | 'beta_changed' | 'expired' | 'logout' }
type SessionRow = { token_hash: string; user_id: string; grant_id: string; generation_id: string; build_id: string; expires_at: number; created_at: number; identity_state: string; revoked_at: number | null; revision: number }
type Lease = { state: PrereleaseIdentityState; userId: string; grantId: string; expiresAt: number; buildId: string; generationId: string }
type HandoffInput = { protocolVersion: number; code: string; state: string; browserChallenge: string; returnTo: string }
type FailureKind = 'paused' | 'expired'
type SessionFailure = Pick<Lease, 'userId' | 'grantId'> & { kind: FailureKind; reason: PrereleaseInvalidation['reason'] }
type IssuedSession = Pick<SessionRow, 'token_hash' | 'user_id' | 'grant_id' | 'expires_at' | 'revoked_at' | 'generation_id' | 'build_id'>
type InvalidationCheckpoint = Pick<PrereleaseRuntime, 'buildId' | 'generationId'> & { sequence: number; runtimeSequence: number }
type BrowserHandoff = {
  browser_verifier: string; state: string; return_path: string; expires_at: number
  source_user_id: string | null; source_grant_id: string | null; handoff_request_hash: string | null; exchanged_at: number | null
  binding_build_id: string | null; binding_generation_id: string | null; binding_target_origin: string | null
  started_sequence: number | null
}
type HandoffReceipt = {
  pending: BrowserHandoff; returnPath: string; userId: string; grantId: string; exchangedAt: number; startedSequence: number
  initialState?: PrereleaseIdentityState
}

const handoffFailure = (state: PrereleaseIdentityState, now: number): 'expired' | 'paused' =>
  state.account.kind === 'deleted' || !state.betaAccess || state.source.kind === 'invalid' || state.source.expiresAt <= now
    || state.grant.kind === 'revoked' || state.grant.expiresAt <= now ? 'expired' : 'paused'

const origin = (value: string | undefined): string => {
  if (!value) throw new Error('Missing prerelease identity origin')
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw new Error('Prerelease identity requires a configured HTTPS origin')
  return url.origin
}
export function readPrereleaseRuntime(env: NodeJS.ProcessEnv = process.env): PrereleaseRuntime | undefined {
  if (env.RELEASE_CHANNEL !== 'prerelease') return undefined
  const appUrl = new URL(env.PUBLIC_APP_ORIGIN ?? '')
  if (appUrl.protocol !== 'https:' || appUrl.username || appUrl.password || appUrl.search || appUrl.hash || !['/', '/open-agricola/'].includes(appUrl.pathname)) throw new Error('Invalid prerelease app path')
  const appOrigin = origin(appUrl.origin), formalAppOrigin = origin(env.FORMAL_APP_ORIGIN), formalApiBase = origin(env.FORMAL_API_BASE)
  if (origin(env.PUBLIC_API_BASE) !== appOrigin || [formalAppOrigin, formalApiBase].some(value => new URL(value).hostname.replace(/\.$/, '') === new URL(appOrigin).hostname.replace(/\.$/, ''))
    || !env.GAME_BUILD_ID || !/^[a-f0-9]{40}$/.test(env.GAME_BUILD_ID)
    || !env.PRERELEASE_DATA_GENERATION || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(env.PRERELEASE_DATA_GENERATION)
    || !env.PRERELEASE_TARGET_ID || !/^prerelease-[a-z0-9-]+$/.test(env.PRERELEASE_TARGET_ID)
    || Buffer.byteLength(env.PRERELEASE_IDENTITY_SERVICE_KEY ?? '') < 32) throw new Error('Incomplete isolated prerelease identity configuration')
  return { appOrigin, formalAppOrigin, formalApiBase, buildId: env.GAME_BUILD_ID, generationId: env.PRERELEASE_DATA_GENERATION, targetId: env.PRERELEASE_TARGET_ID }
}

export class PrereleaseSessions {
  readonly runtime: PrereleaseRuntime
  private readonly db: PostgresDatabase
  private readonly authority: PrereleaseIdentityClient
  private readonly now: () => number
  private eraseAccount: (userId: string) => Promise<void>
  private readonly leases = new Map<string, Lease>()
  private runtimeSequence = 0
  private closed = false
  private readonly invalidations = new PrereleaseInvalidations()
  private readonly deletedUsers = new Set<string>()
  private readonly blockedUsers = new Set<string>()
  private readonly blockedGrants = new Set<string>()
  private readonly failures = new Map<string, SessionFailure>()
  private readonly listeners = new Set<(event: PrereleaseInvalidation) => void>()
  private timer?: ReturnType<typeof setInterval>
  private refreshing?: Promise<void>

  constructor(options: { db: PostgresDatabase; runtime: PrereleaseRuntime; authority: PrereleaseIdentityClient; now?: () => number; eraseAccount?: (userId: string) => Promise<void> }) {
    this.db = options.db; this.runtime = options.runtime; this.authority = options.authority; this.now = options.now ?? Date.now
    this.eraseAccount = options.eraseAccount ?? (async () => { throw new Error('Prerelease account erasure adapter is not configured') })
  }
  setAccountErasure(callback: (userId: string) => Promise<void>) { this.eraseAccount = callback }
  subscribeInvalidation(callback: (event: PrereleaseInvalidation) => void): () => void { this.listeners.add(callback); return () => this.listeners.delete(callback) }
  private recordFailure(key: string, subject: Pick<Lease, 'userId' | 'grantId'>, kind: FailureKind, reason: PrereleaseInvalidation['reason']) {
    const previous = this.failures.get(key)
    if (reason === 'beta_changed' && previous?.kind === 'expired' && previous.reason !== 'beta_changed') return
    if (kind === 'paused' && previous?.kind === 'expired' && !(reason === 'beta_changed' && previous.reason === 'beta_changed')) return
    this.failures.set(key, { userId: subject.userId, grantId: subject.grantId, kind, reason })
  }
  private recordIssuedFailure(row: IssuedSession, kind: FailureKind, reason: PrereleaseInvalidation['reason']) {
    if (this.deletedUsers.has(row.user_id)) { kind = 'expired'; reason = 'account_deleted' }
    else if (this.blockedGrants.has(row.grant_id)) { kind = 'expired'; reason = 'source_revoked' }
    else if (row.revoked_at !== null || row.expires_at <= this.now() || row.generation_id !== this.runtime.generationId || row.build_id !== this.runtime.buildId) { kind = 'expired'; reason = 'expired' }
    this.leases.delete(row.token_hash)
    this.recordFailure(row.token_hash, { userId: row.user_id, grantId: row.grant_id }, kind, reason)
  }
  private checkpoint(): InvalidationCheckpoint {
    return { sequence: this.invalidations.checkpoint(), runtimeSequence: this.runtimeSequence, buildId: this.runtime.buildId, generationId: this.runtime.generationId }
  }
  private invalidatedSince(checkpoint: InvalidationCheckpoint, subject: InvalidationSubject): boolean {
    return this.closed || checkpoint.runtimeSequence !== this.runtimeSequence || checkpoint.buildId !== this.runtime.buildId || checkpoint.generationId !== this.runtime.generationId
      || this.invalidations.changedSince(checkpoint.sequence, subject)
  }
  private async classifyIssued(userId: string, grantId: string | undefined, kind: FailureKind, reason: PrereleaseInvalidation['reason'], checkpoint = this.checkpoint()) {
    const rows = await this.db.prepare(`SELECT token_hash,user_id,grant_id,expires_at,revoked_at,generation_id,build_id FROM prerelease_sessions
      WHERE user_id=? AND (?::text IS NULL OR grant_id=?)`).all<IssuedSession>(userId, grantId ?? null, grantId ?? null)
    for (const row of rows) {
      if (reason === 'beta_changed' && this.invalidatedSince(checkpoint, { userId: row.user_id, grantId: row.grant_id, tokenHash: row.token_hash })) continue
      this.recordIssuedFailure(row, kind, reason)
    }
  }
  private invalidate(event: PrereleaseInvalidation, kind: FailureKind = event.reason === 'beta_changed' || event.reason === 'expired' ? 'paused' : 'expired') {
    this.invalidations.record(event.token ? { kind: 'token', id: hash(event.token) } : event.grantId ? { kind: 'grant', id: event.grantId } : { kind: 'user', id: event.userId })
    if (event.reason === 'account_deleted') this.deletedUsers.add(event.userId)
    if (event.reason === 'beta_changed' || event.reason === 'account_deleted') this.blockedUsers.add(event.userId)
    if (event.reason === 'source_revoked' && event.grantId) this.blockedGrants.add(event.grantId)
    const matches = (key: string, subject: Pick<Lease, 'userId' | 'grantId'>) => subject.userId === event.userId
      && (!event.grantId || subject.grantId === event.grantId) && (!event.token || key === hash(event.token))
    for (const [key, failure] of this.failures) if (matches(key, failure)) this.recordFailure(key, failure, kind, event.reason)
    for (const [key, lease] of this.leases) if (matches(key, lease)) {
      this.leases.delete(key)
      const expired = lease.expiresAt <= this.now() || handoffFailure(lease.state, this.now()) === 'expired'
      this.recordFailure(key, lease, expired ? 'expired' : kind, expired ? 'expired' : event.reason)
    }
    for (const listener of this.listeners) listener(event)
  }
  private leaseAuthorized(lease: Lease): boolean {
    return !this.closed && !this.deletedUsers.has(lease.userId) && !this.blockedUsers.has(lease.userId) && !this.blockedGrants.has(lease.grantId) && lease.buildId === this.runtime.buildId && lease.generationId === this.runtime.generationId && this.now() < lease.expiresAt
      && isPrereleaseIdentityAuthorized(lease.state, this.now(), this.runtime.generationId)
  }
  cachedAuthorized(token: string, expected: { buildId?: string; generationId?: string } = {}): boolean {
    if (expected.buildId !== undefined && expected.buildId !== this.runtime.buildId || expected.generationId !== undefined && expected.generationId !== this.runtime.generationId) return false
    const lease = this.leases.get(hash(token))
    return !!lease && this.leaseAuthorized(lease)
  }
  status(token: string): 'authorized' | 'paused' | 'expired' { return this.cachedAuthorized(token) ? 'authorized' : this.failures.get(hash(token))?.kind ?? 'paused' }
  private user(state: PrereleaseIdentityState): PrereleaseUser {
    if (state.account.kind !== 'active') throw new Error('Deleted external principal')
    return { ...state.account.subject, isAdmin: false }
  }
  private async lockSubject(userId: string): Promise<void> {
    await this.db.prepare("SELECT pg_advisory_xact_lock(hashtextextended('open-agricola:pre-subject:' || ?,0))").get(userId)
  }
  private handoffRace(state: PrereleaseIdentityState): PrereleaseIdentityError {
    const denied = handoffFailure(state, this.now()) === 'expired' || this.blockedGrants.has(state.grantId)
      || state.account.kind === 'active' && this.deletedUsers.has(state.account.subject.id)
    return new PrereleaseIdentityError(denied ? 'expired' : 'paused', 'Identity changed during handoff')
  }
  async beginHandoff(returnPath = '/open-agricola/') {
    if (this.closed) throw new PrereleaseIdentityError('paused', 'Prerelease consumer is closed')
    const canonicalPath = normalizePrereleaseReturnPath(returnPath)
    if (!canonicalPath) throw new Error('Invalid prerelease return path')
    const cookie = opaque(), verifier = opaque(), state = opaque(), expiresAt = this.now() + 60_000
    await this.db.prepare('DELETE FROM prerelease_browser_handoffs WHERE expires_at<=?').run(this.now())
    await this.db.prepare(`INSERT INTO prerelease_browser_handoffs(cookie_hash,browser_verifier,state,return_path,expires_at,binding_build_id,binding_generation_id,binding_target_origin,started_sequence)
      VALUES(?,?,?,?,?,?,?,?,nextval('prerelease_handoff_sequence'))`).run(hash(cookie), verifier, state, canonicalPath, expiresAt, this.runtime.buildId, this.runtime.generationId, this.runtime.appOrigin)
    const formal = new URL(this.runtime.formalAppOrigin)
    formal.searchParams.set('page', 'prerelease-handoff')
    formal.hash = new URLSearchParams({ browserChallenge: hash(verifier), state, targetOrigin: this.runtime.appOrigin, returnTo: `${this.runtime.formalAppOrigin}/` }).toString()
    return { cookie, formalUrl: formal.href, expiresAt }
  }
  private async prepareHandoffReceipt(cookie: string, input: HandoffInput, requestHash: string): Promise<HandoffReceipt> {
    return this.db.transaction(async () => {
      const pending = await this.db.prepare('SELECT * FROM prerelease_browser_handoffs WHERE cookie_hash=? FOR UPDATE').get<BrowserHandoff>(hash(cookie))
      if (!pending) throw new PrereleaseIdentityError('invalid', 'Invalid prerelease handoff')
      const returnPath = normalizePrereleaseReturnPath(pending.return_path)
      if (!returnPath || pending.started_sequence === null || pending.expires_at <= this.now() || pending.state !== input.state || hash(pending.browser_verifier) !== input.browserChallenge
        || pending.binding_build_id !== this.runtime.buildId || pending.binding_generation_id !== this.runtime.generationId || pending.binding_target_origin !== this.runtime.appOrigin) throw new PrereleaseIdentityError('invalid', 'Invalid prerelease handoff')
      if (pending.source_grant_id !== null) {
        if (pending.handoff_request_hash !== requestHash || pending.source_user_id === null || pending.exchanged_at === null) throw new PrereleaseIdentityError('invalid', 'Handoff receipt binding changed')
        return { pending, returnPath, userId: pending.source_user_id, grantId: pending.source_grant_id, exchangedAt: pending.exchanged_at, startedSequence: pending.started_sequence }
      }
      const state = parsePrereleaseIdentityState(await this.authority.exchange({ code: input.code, browserVerifier: pending.browser_verifier, returnTo: input.returnTo }), this.runtime)
      if (state.account.kind !== 'active') throw new PrereleaseIdentityError('expired', 'Prerelease source account is unavailable')
      const userId = state.account.subject.id, exchangedAt = this.now()
      await this.lockSubject(userId)
      if (this.deletedUsers.has(userId) || await this.db.prepare('SELECT 1 FROM prerelease_deleted_subjects WHERE user_id=?').get(userId)
        || await this.db.prepare('SELECT 1 FROM prerelease_revoked_grants WHERE grant_id=?').get(state.grantId)) throw new PrereleaseIdentityError('expired', 'Revoked prerelease identity')
      await this.db.prepare(`UPDATE prerelease_browser_handoffs SET source_user_id=?,source_grant_id=?,handoff_request_hash=?,exchanged_at=? WHERE cookie_hash=?`)
        .run(userId, state.grantId, requestHash, exchangedAt, hash(cookie))
      return { pending, returnPath, userId, grantId: state.grantId, exchangedAt, initialState: state, startedSequence: pending.started_sequence }
    })()
  }
  private async assertCallbackNotLoggedOut(userId: string, startedSequence: number): Promise<void> {
    const row = await this.db.prepare('SELECT logout_all_sequence FROM prerelease_external_identities WHERE user_id=?').get<{ logout_all_sequence: number }>(userId)
    if (row && row.logout_all_sequence > startedSequence) throw new PrereleaseIdentityError('expired', 'Callback predates account-wide logout')
  }
  async exchangeHandoff(cookie: string, input: HandoffInput, currentToken = ''): Promise<PrereleaseSession & { token: string; returnPath: string }> {
    if (this.closed) throw new PrereleaseIdentityError('paused', 'Prerelease consumer is closed')
    if (input.protocolVersion !== 1 || !secret(input.code) || !secret(input.state) || !secret(input.browserChallenge) || input.returnTo !== `${this.runtime.formalAppOrigin}/`) throw new PrereleaseIdentityError('invalid', 'Invalid prerelease handoff')
    const requestHash = hash(JSON.stringify([input.protocolVersion, input.code, input.state, input.browserChallenge, input.returnTo]))
    const checkpoint = this.checkpoint()
    if (secret(currentToken)) {
      const receipt = await this.db.prepare(`SELECT handoff_return_path,grant_id FROM prerelease_sessions
        WHERE token_hash=? AND handoff_request_hash=?`).get<{ handoff_return_path: string; grant_id: string }>(hash(currentToken), requestHash)
      if (receipt) {
        const returnPath = normalizePrereleaseReturnPath(receipt.handoff_return_path)
        if (!returnPath) throw new PrereleaseIdentityError('paused', 'Invalid persisted handoff receipt')
        const session = await this.resolve(currentToken)
        if (!session) throw new PrereleaseIdentityError(this.status(currentToken) === 'expired' ? 'expired' : 'paused', 'Prerelease access unavailable')
        if (this.invalidatedSince(checkpoint, { userId: session.user.id, grantId: receipt.grant_id, tokenHash: hash(currentToken) })) throw new PrereleaseIdentityError(this.status(currentToken) === 'expired' || session.expiresAt <= this.now() ? 'expired' : 'paused', 'Identity changed during handoff')
        return { ...session, token: currentToken, returnPath }
      }
    }
    if (!secret(cookie)) throw new PrereleaseIdentityError(this.status(currentToken) === 'expired' ? 'expired' : 'invalid', 'Invalid prerelease handoff')
    const receipt = await this.prepareHandoffReceipt(cookie, input, requestHash)
    const state = receipt.initialState ?? parsePrereleaseIdentityState(await this.authority.status(receipt.grantId), this.runtime, receipt.grantId)
    if (state.account.kind !== 'active' || state.account.subject.id !== receipt.userId) throw new PrereleaseIdentityError('expired', 'Handoff subject changed')
    if (!isPrereleaseIdentityAuthorized(state, this.now(), this.runtime.generationId)) throw new PrereleaseIdentityError(handoffFailure(state, this.now()), 'Prerelease access unavailable')
    await this.assertCallbackNotLoggedOut(receipt.userId, receipt.startedSequence)
    if (this.invalidatedSince(checkpoint, { userId: receipt.userId, grantId: receipt.grantId })) throw this.handoffRace(state)
    const user = this.user(state)
    const token = createHmac('sha256', receipt.pending.browser_verifier).update(JSON.stringify([
      'open-agricola:pre-callback-session:v1', cookie, requestHash, this.runtime.appOrigin, this.runtime.buildId, this.runtime.generationId,
    ])).digest('base64url')
    const exchanged = await this.db.transaction(async () => {
      await this.lockSubject(user.id)
      await this.assertCallbackNotLoggedOut(user.id, receipt.startedSequence)
      const pending = await this.db.prepare('SELECT * FROM prerelease_browser_handoffs WHERE cookie_hash=? FOR UPDATE').get<BrowserHandoff>(hash(cookie))
      if (!pending || pending.expires_at <= this.now() || pending.handoff_request_hash !== requestHash
        || pending.source_user_id !== user.id || pending.source_grant_id !== state.grantId || pending.binding_build_id !== this.runtime.buildId
        || pending.binding_generation_id !== this.runtime.generationId || pending.binding_target_origin !== this.runtime.appOrigin) throw new PrereleaseIdentityError('invalid', 'Invalid prerelease handoff receipt')
      const now = this.now()
      if (this.deletedUsers.has(user.id) || await this.db.prepare('SELECT 1 FROM prerelease_deleted_subjects WHERE user_id=?').get(user.id)
        || await this.db.prepare('SELECT 1 FROM prerelease_revoked_grants WHERE grant_id=?').get(state.grantId)) throw new PrereleaseIdentityError('expired', 'Revoked prerelease identity')
      const existing = await this.db.prepare('SELECT identity_origin FROM users WHERE id=? OR username=?').get<{ identity_origin: string }>(user.id, user.username)
      if (existing && existing.identity_origin !== 'external') throw new Error('External identity conflicts with local principal')
      await this.db.prepare(`INSERT INTO users(id,username,display_name,password_hash,created_at,identity_origin) VALUES(?,?,?,NULL,?,'external')
        ON CONFLICT(id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name`).run(user.id, user.username, user.displayName, now)
      await this.db.prepare(`INSERT INTO prerelease_external_identities(user_id,source_grant_id,generation_id) VALUES(?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET source_grant_id=excluded.source_grant_id,generation_id=excluded.generation_id`).run(user.id, state.grantId, this.runtime.generationId)
      const previous = await this.db.prepare('SELECT * FROM prerelease_sessions WHERE token_hash=? FOR UPDATE').get<SessionRow>(hash(token))
      if (previous && (previous.user_id !== user.id || previous.grant_id !== state.grantId || previous.revoked_at !== null
        || previous.expires_at <= now || previous.build_id !== this.runtime.buildId || previous.generation_id !== this.runtime.generationId)) throw new PrereleaseIdentityError('expired', 'Callback session was revoked')
      const expiresAt = previous?.expires_at ?? Math.min(receipt.exchangedAt + PRERELEASE_SESSION_MAX_AGE_MS, state.grant.expiresAt, state.source.kind === 'active' ? state.source.expiresAt : now)
      await this.db.prepare(`INSERT INTO prerelease_sessions(token_hash,user_id,grant_id,generation_id,build_id,created_at,expires_at,identity_state,handoff_request_hash,handoff_return_path)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(token_hash) DO UPDATE SET identity_state=excluded.identity_state`)
        .run(hash(token), user.id, state.grantId, this.runtime.generationId, this.runtime.buildId, now, expiresAt, JSON.stringify(state), requestHash, receipt.returnPath)
      if (this.invalidatedSince(checkpoint, { userId: user.id, grantId: state.grantId })) throw this.handoffRace(state)
      return { expiresAt, returnPath: receipt.returnPath }
    })()
    const { expiresAt, returnPath } = exchanged
    if (this.invalidatedSince(checkpoint, { userId: user.id, grantId: state.grantId })) throw this.handoffRace(state)
    this.blockedUsers.delete(user.id)
    const lease = { state, userId: user.id, grantId: state.grantId, expiresAt, buildId: this.runtime.buildId, generationId: this.runtime.generationId }
    if (!this.leaseAuthorized(lease)) throw new PrereleaseIdentityError(handoffFailure(state, this.now()), 'Prerelease access unavailable')
    this.leases.set(hash(token), lease)
    return { token, user, expiresAt, validUntil: Math.min(state.validUntil, expiresAt), returnPath }
  }
  async resolve(token: string): Promise<PrereleaseSession | null> {
    if (!secret(token)) return null
    const checkpoint = this.checkpoint()
    const key = hash(token), row = await this.db.prepare(`SELECT s.*,p.revision,
      EXISTS(SELECT 1 FROM prerelease_deleted_subjects d WHERE d.user_id=s.user_id)
        OR EXISTS(SELECT 1 FROM prerelease_revoked_grants g WHERE g.grant_id=s.grant_id) AS invalidated
      FROM prerelease_sessions s JOIN prerelease_external_identities p ON p.user_id=s.user_id WHERE s.token_hash=?`).get<SessionRow & { invalidated: boolean }>(key)
    if (!row) { this.leases.delete(key); return null }
    if (row.invalidated || this.deletedUsers.has(row.user_id) || row.revoked_at !== null || row.expires_at <= this.now() || row.generation_id !== this.runtime.generationId || row.build_id !== this.runtime.buildId) {
      this.recordIssuedFailure(row, 'expired', 'expired'); return null
    }
    let state = parsePrereleaseIdentityState(JSON.parse(row.identity_state), this.runtime, row.grant_id)
    if (this.blockedUsers.has(row.user_id) || this.blockedGrants.has(row.grant_id) || !isPrereleaseIdentityAuthorized(state, this.now(), this.runtime.generationId)) {
      try {
        state = parsePrereleaseIdentityState(await this.authority.status(row.grant_id), this.runtime, row.grant_id)
        if (state.account.kind === 'active' && state.account.subject.id !== row.user_id) throw new Error('Identity subject changed')
        if (this.invalidatedSince(checkpoint, { userId: row.user_id, grantId: row.grant_id, tokenHash: key })) return null
        if (!isPrereleaseIdentityAuthorized(state, this.now(), this.runtime.generationId)) {
          if (handoffFailure(state, this.now()) === 'expired') await this.denyState(row, state)
          this.leases.delete(key); return null
        }
        const updated = await this.db.transaction(async () => {
          await this.lockSubject(row.user_id)
          const updated = await this.db.prepare(`UPDATE prerelease_sessions SET identity_state=? WHERE token_hash=? AND revoked_at IS NULL
            AND EXISTS(SELECT 1 FROM prerelease_external_identities p WHERE p.user_id=prerelease_sessions.user_id AND p.revision=?)
            AND NOT EXISTS(SELECT 1 FROM prerelease_deleted_subjects d WHERE d.user_id=prerelease_sessions.user_id)
            AND NOT EXISTS(SELECT 1 FROM prerelease_revoked_grants g WHERE g.grant_id=prerelease_sessions.grant_id)`).run(JSON.stringify(state), key, row.revision)
          if (updated.changes && state.account.kind === 'active') await this.db.prepare('UPDATE users SET username=?,display_name=? WHERE id=? AND identity_origin=\'external\'').run(state.account.subject.username, state.account.subject.displayName, row.user_id)
          return updated.changes
        })()
        if (!updated) { this.leases.delete(key); return null }
      } catch { this.leases.delete(key); return null }
    }
    if (state.account.kind !== 'active' || state.account.subject.id !== row.user_id) return null
    if (this.invalidatedSince(checkpoint, { userId: row.user_id, grantId: row.grant_id, tokenHash: key })) return null
    this.blockedUsers.delete(row.user_id)
    const lease = { state, userId: row.user_id, grantId: row.grant_id, expiresAt: row.expires_at, buildId: row.build_id, generationId: row.generation_id }
    if (!this.leaseAuthorized(lease)) {
      this.leases.delete(key)
      return null
    }
    this.failures.delete(key); this.leases.set(key, lease)
    return { user: this.user(state), expiresAt: row.expires_at, validUntil: Math.min(state.validUntil, row.expires_at) }
  }
  /** Publication keeps the caller's row lock and never refreshes identity under it. */
  async readPersisted(token: string, options: { db?: PostgresDatabase; now?: number; lock?: 'share' | 'update' } = {}): Promise<PrereleaseSession | null> {
    if (!secret(token)) return null
    const db = options.db ?? this.db, checkpoint = this.checkpoint()
    const row = await db.prepare(`SELECT s.*,
      EXISTS(SELECT 1 FROM prerelease_deleted_subjects d WHERE d.user_id=s.user_id)
        OR EXISTS(SELECT 1 FROM prerelease_revoked_grants g WHERE g.grant_id=s.grant_id) AS invalidated
      FROM prerelease_sessions s JOIN prerelease_external_identities p ON p.user_id=s.user_id WHERE s.token_hash=?
      ${options.lock === 'update' ? 'FOR UPDATE OF s' : options.lock === 'share' ? 'FOR SHARE OF s' : ''}`)
      .get<Omit<SessionRow, 'revision'> & { invalidated: boolean }>(hash(token))
    const now = options.now ?? this.now()
    if (!row || this.invalidatedSince(checkpoint, { userId: row.user_id, grantId: row.grant_id, tokenHash: hash(token) }) || row.invalidated || row.revoked_at !== null || row.expires_at <= now
      || row.generation_id !== this.runtime.generationId || row.build_id !== this.runtime.buildId
      || this.deletedUsers.has(row.user_id) || this.blockedUsers.has(row.user_id) || this.blockedGrants.has(row.grant_id)) return null
    try {
      const state = parsePrereleaseIdentityState(JSON.parse(row.identity_state), this.runtime, row.grant_id)
      if (!isPrereleaseIdentityAuthorized(state, now, this.runtime.generationId) || state.account.kind !== 'active' || state.account.subject.id !== row.user_id) return null
      return { user: this.user(state), expiresAt: row.expires_at, validUntil: Math.min(state.validUntil, row.expires_at) }
    } catch { return null }
  }
  private async denyState(row: Pick<SessionRow, 'user_id' | 'grant_id'>, state: PrereleaseIdentityState): Promise<void> {
    const sourceInvalid = state.source.kind !== 'active' || state.source.expiresAt <= this.now() || state.grant.kind !== 'active' || state.grant.expiresAt <= this.now()
    const reason = state.account.kind !== 'active' ? 'account_deleted' : sourceInvalid ? 'source_revoked' : 'beta_changed'
    this.invalidate({ userId: row.user_id, ...(reason === 'source_revoked' ? { grantId: row.grant_id } : {}), reason }, 'expired')
    const checkpoint = this.checkpoint()
    await this.db.transaction(async () => {
      await this.lockSubject(row.user_id)
      if (reason === 'source_revoked') {
        await this.db.prepare('INSERT INTO prerelease_revoked_grants(grant_id,user_id,generation_id,revoked_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(row.grant_id, row.user_id, this.runtime.generationId, this.now())
        await this.db.prepare('UPDATE prerelease_sessions SET revoked_at=? WHERE grant_id=?').run(this.now(), row.grant_id)
      } else if (reason === 'account_deleted') {
        await this.db.prepare('INSERT INTO prerelease_deleted_subjects(user_id,deleted_at) VALUES(?,?) ON CONFLICT DO NOTHING').run(row.user_id, this.now())
        await this.db.prepare('UPDATE prerelease_sessions SET revoked_at=? WHERE user_id=?').run(this.now(), row.user_id)
        await this.db.prepare('DELETE FROM prerelease_browser_handoffs WHERE source_user_id=?').run(row.user_id)
      } else await this.pauseSubject(row.user_id, 'expired', checkpoint)
      if (reason !== 'beta_changed') await this.classifyIssued(row.user_id, reason === 'source_revoked' ? row.grant_id : undefined, 'expired', reason)
    })()
  }
  private async pauseSubject(userId: string, kind: FailureKind = 'paused', checkpoint = this.checkpoint()): Promise<void> {
    await this.db.prepare('UPDATE prerelease_external_identities SET revision=revision+1 WHERE user_id=?').run(userId)
    const rows = await this.db.prepare('SELECT token_hash,identity_state FROM prerelease_sessions WHERE user_id=? AND revoked_at IS NULL').all<{ token_hash: string; identity_state: string }>(userId)
    for (const row of rows) {
      const state = parsePrereleaseIdentityState(JSON.parse(row.identity_state), this.runtime)
      state.validUntil = 0
      await this.db.prepare('UPDATE prerelease_sessions SET identity_state=? WHERE token_hash=?').run(JSON.stringify(state), row.token_hash)
    }
    await this.classifyIssued(userId, undefined, kind, 'beta_changed', checkpoint)
  }
  async revoke(token: string, all = false): Promise<void> {
    const denial = () => new PrereleaseIdentityError(this.status(token) === 'expired' ? 'expired' : 'paused', 'Prerelease access unavailable')
    if (all && !await this.resolve(token)) throw denial()
    const row = await this.db.prepare('SELECT user_id,grant_id FROM prerelease_sessions WHERE token_hash=?').get<{ user_id: string; grant_id: string }>(hash(token))
    if (!row) { if (all) throw denial(); return }
    const revoke = () => this.db.prepare(`UPDATE prerelease_sessions SET revoked_at=? WHERE ${all ? 'user_id' : 'token_hash'}=?
      RETURNING token_hash,user_id,grant_id,expires_at,revoked_at,generation_id,build_id`).all<IssuedSession>(this.now(), all ? row.user_id : hash(token))
    const revoked = all ? await this.db.transaction(async () => {
      await this.lockSubject(row.user_id)
      const current = await this.readPersisted(token, { lock: 'update' })
      if (!current || current.user.id !== row.user_id) return null
      await this.db.prepare(`UPDATE prerelease_external_identities SET logout_all_sequence=nextval('prerelease_handoff_sequence'),revision=revision+1 WHERE user_id=?`).run(row.user_id)
      await this.db.prepare('DELETE FROM prerelease_browser_handoffs WHERE source_user_id=?').run(row.user_id)
      return revoke()
    })() : await revoke()
    if (revoked === null) {
      await this.resolve(token)
      throw denial()
    }
    for (const issued of revoked) this.recordIssuedFailure(issued, 'expired', 'logout')
    this.invalidate({ userId: row.user_id, ...(all ? {} : { token, grantId: row.grant_id }), reason: 'logout' })
  }
  async processEvents(): Promise<void> {
    for (const event of await this.authority.events()) await this.processEvent(event)
  }
  private async processEvent(event: PrereleaseIdentityEvent): Promise<void> {
    const previous = await this.db.prepare('SELECT outcome FROM prerelease_processed_identity_events WHERE event_id=? AND generation_id=?').get<{ outcome: 'revoked' | 'deleted' | 'rechecked' }>(event.id, this.runtime.generationId)
    const outcome = event.kind === 'source_revoked' ? 'revoked' : event.kind === 'account_deleted' ? 'deleted' : 'rechecked'
    if (!previous) {
      this.invalidate({ userId: event.userId, ...(event.kind === 'source_revoked' ? { grantId: event.grantId } : {}), reason: event.kind })
      const checkpoint = this.checkpoint()
      if (event.kind === 'account_deleted') {
        await this.db.transaction(async () => {
          await this.lockSubject(event.userId)
          await this.db.prepare('INSERT INTO prerelease_deleted_subjects(user_id,deleted_at) VALUES(?,?) ON CONFLICT DO NOTHING').run(event.userId, this.now())
          await this.db.prepare('UPDATE prerelease_external_identities SET revision=revision+1 WHERE user_id=?').run(event.userId)
          await this.db.prepare('UPDATE prerelease_sessions SET revoked_at=? WHERE user_id=?').run(this.now(), event.userId)
          await this.db.prepare('DELETE FROM prerelease_browser_handoffs WHERE source_user_id=?').run(event.userId)
          await this.classifyIssued(event.userId, undefined, 'expired', 'account_deleted')
        })()
        // Shared invalidation must commit before it drains Room queues and erases payloads.
        await this.eraseAccount(event.userId)
        if (await this.db.prepare('SELECT 1 FROM users WHERE id=?').get(event.userId)) throw new Error('External account cleanup is incomplete')
      } else if (event.kind === 'source_revoked') {
        await this.db.transaction(async () => {
          await this.lockSubject(event.userId)
          await this.db.prepare('UPDATE prerelease_external_identities SET revision=revision+1 WHERE user_id=?').run(event.userId)
          await this.db.prepare('INSERT INTO prerelease_revoked_grants(grant_id,user_id,generation_id,revoked_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(event.grantId, event.userId, this.runtime.generationId, this.now())
          await this.db.prepare('UPDATE prerelease_sessions SET revoked_at=? WHERE grant_id=?').run(this.now(), event.grantId)
          await this.classifyIssued(event.userId, event.grantId, 'expired', 'source_revoked')
        })()
      } else {
        await this.db.transaction(async () => { await this.lockSubject(event.userId); await this.pauseSubject(event.userId, 'paused', checkpoint) })()
        const grants = await this.db.prepare(`SELECT DISTINCT grant_id FROM prerelease_sessions WHERE user_id=? AND revoked_at IS NULL
          UNION SELECT source_grant_id AS grant_id FROM prerelease_external_identities WHERE user_id=?`).all<{ grant_id: string }>(event.userId, event.userId)
        for (const row of grants) {
          const statusCheckpoint = this.checkpoint()
          const state = parsePrereleaseIdentityState(await this.authority.status(row.grant_id), this.runtime, row.grant_id)
          if (state.account.kind === 'active' && state.account.subject.id !== event.userId) throw new Error('Identity subject changed')
          if (this.invalidatedSince(statusCheckpoint, { userId: event.userId, grantId: row.grant_id })) continue
          if (!isPrereleaseIdentityAuthorized(state, this.now(), this.runtime.generationId)) {
            if (handoffFailure(state, this.now()) === 'expired') await this.denyState({ user_id: event.userId, grant_id: row.grant_id }, state)
            continue
          }
          await this.db.prepare('UPDATE prerelease_sessions SET identity_state=? WHERE grant_id=? AND user_id=? AND revoked_at IS NULL').run(JSON.stringify(state), row.grant_id, event.userId)
        }
      }
      await this.db.prepare('INSERT INTO prerelease_processed_identity_events(event_id,generation_id,outcome,completed_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(event.id, this.runtime.generationId, outcome, this.now())
    }
    await this.authority.acknowledge(event.id, previous?.outcome ?? outcome)
    await this.db.prepare('UPDATE prerelease_processed_identity_events SET acknowledged_at=? WHERE event_id=?').run(this.now(), event.id)
  }
  async refreshActive(): Promise<void> {
    if (this.closed) return
    if (this.refreshing) return this.refreshing
    this.refreshing = (async () => {
      await this.db.prepare('DELETE FROM prerelease_browser_handoffs WHERE expires_at<=?').run(this.now())
      for (const lease of this.leases.values()) if (!this.leaseAuthorized(lease)) {
        this.invalidate({ userId: lease.userId, grantId: lease.grantId, reason: 'expired' })
      }
      await this.processEvents()
      const grants = [...new Set([...this.leases.values()].filter(lease => lease.state.validUntil - this.now() <= 15_000).map(lease => lease.grantId))]
      for (const grantId of grants) {
        const checkpoint = this.checkpoint()
        const row = await this.db.prepare(`SELECT s.*,p.revision FROM prerelease_sessions s JOIN prerelease_external_identities p ON p.user_id=s.user_id WHERE s.grant_id=? AND s.revoked_at IS NULL LIMIT 1`).get<SessionRow>(grantId)
        if (!row) continue
        const state = parsePrereleaseIdentityState(await this.authority.status(grantId), this.runtime, grantId)
        if (state.account.kind === 'active' && state.account.subject.id !== row.user_id) throw new Error('Identity subject changed')
        if (this.invalidatedSince(checkpoint, { userId: row.user_id, grantId })) continue
        const authorized = isPrereleaseIdentityAuthorized(state, this.now(), this.runtime.generationId)
        if (!authorized && handoffFailure(state, this.now()) === 'expired') { await this.denyState(row, state); continue }
        const storedState = authorized ? state : { ...parsePrereleaseIdentityState(JSON.parse(row.identity_state), this.runtime, grantId), validUntil: 0 }
        const updated = await this.db.prepare(`UPDATE prerelease_sessions SET identity_state=? WHERE grant_id=? AND revoked_at IS NULL
          AND EXISTS(SELECT 1 FROM prerelease_external_identities p WHERE p.user_id=prerelease_sessions.user_id AND p.revision=?)
          AND NOT EXISTS(SELECT 1 FROM prerelease_revoked_grants g WHERE g.grant_id=prerelease_sessions.grant_id)
          AND NOT EXISTS(SELECT 1 FROM prerelease_deleted_subjects d WHERE d.user_id=prerelease_sessions.user_id)`).run(JSON.stringify(storedState), grantId, row.revision)
        if (!updated.changes || this.invalidatedSince(checkpoint, { userId: row.user_id, grantId })) continue
        if (!authorized) {
          for (const [key, lease] of this.leases) if (lease.grantId === grantId) {
            this.leases.delete(key); this.recordFailure(key, lease, 'paused', 'expired')
          }
          continue
        }
        for (const [key, lease] of this.leases) if (lease.grantId === grantId) this.leases.set(key, { ...lease, state })
      }
    })().finally(() => { this.refreshing = undefined })
    return this.refreshing
  }
  start() {
    if (this.timer) return
    this.timer = setInterval(() => { void this.refreshActive().catch(() => { /* Existing absolute leases remain unchanged on an outage. */ }) }, 1000)
    this.timer.unref()
  }
  close() { this.closed = true; this.runtimeSequence++; if (this.timer) clearInterval(this.timer); this.timer = undefined; this.leases.clear() }
}

let singleton: PrereleaseSessions | undefined
export function getPrereleaseSessions(): PrereleaseSessions | undefined {
  const runtime = readPrereleaseRuntime()
  if (!runtime) return undefined
  if (!singleton || JSON.stringify(singleton.runtime) !== JSON.stringify(runtime)) {
    singleton?.close()
    singleton = new PrereleaseSessions({ db: getDb(), runtime, authority: new FormalPrereleaseIdentityClient(runtime, process.env.PRERELEASE_IDENTITY_SERVICE_KEY ?? '') })
  }
  return singleton
}
