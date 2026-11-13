import { createHash, randomBytes } from 'node:crypto'
import {
  isPrereleaseIdentityAuthorized, PRERELEASE_SESSION_MAX_AGE_MS,
  type PrereleaseIdentityState, type PrereleaseIdentityEvent,
} from '../shared/contract/prerelease-identity'
import { normalizePrereleaseReturnPath, type PrereleaseRuntime } from '../shared/contract/prerelease-runtime'
import type { AuthUser } from './auth'
import { deleteAccount } from './auth'
import { getDb } from './db'
import type { PostgresDatabase } from './database/postgres'
import { FormalPrereleaseIdentityClient, parsePrereleaseIdentityState, type PrereleaseIdentityClient } from './prerelease-identity-client'

const opaque = () => randomBytes(32).toString('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('base64url')
const secret = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value)
export type PrereleaseUser = Pick<AuthUser, 'id' | 'username' | 'displayName'> & { isAdmin: false }
export type PrereleaseSession = { user: PrereleaseUser; expiresAt: number; validUntil: number }
export type PrereleaseInvalidation = { userId: string; grantId?: string; token?: string; reason: 'source_revoked' | 'account_deleted' | 'beta_changed' | 'expired' | 'logout' }
type SessionRow = { token_hash: string; user_id: string; grant_id: string; generation_id: string; build_id: string; expires_at: number; created_at: number; identity_state: string; revoked_at: number | null; revision: number }
type Lease = { state: PrereleaseIdentityState; userId: string; grantId: string; expiresAt: number; buildId: string; generationId: string }
type HandoffInput = { protocolVersion: number; code: string; state: string; browserChallenge: string; returnTo: string }

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
  private epoch = 0
  private readonly deletedUsers = new Set<string>()
  private readonly blockedUsers = new Set<string>()
  private readonly blockedGrants = new Set<string>()
  private readonly knownInvalid = new Set<string>()
  private readonly listeners = new Set<(event: PrereleaseInvalidation) => void>()
  private timer?: ReturnType<typeof setInterval>
  private refreshing?: Promise<void>

  constructor(options: { db: PostgresDatabase; runtime: PrereleaseRuntime; authority: PrereleaseIdentityClient; now?: () => number; eraseAccount?: (userId: string) => Promise<void> }) {
    this.db = options.db; this.runtime = options.runtime; this.authority = options.authority; this.now = options.now ?? Date.now
    this.eraseAccount = options.eraseAccount ?? (async userId => { await deleteAccount(userId, { db: this.db, now: this.now() }) })
  }
  setAccountErasure(callback: (userId: string) => Promise<void>) { this.eraseAccount = callback }
  subscribeInvalidation(callback: (event: PrereleaseInvalidation) => void): () => void { this.listeners.add(callback); return () => this.listeners.delete(callback) }
  private invalidate(event: PrereleaseInvalidation) {
    this.epoch++
    if (event.reason === 'account_deleted') this.deletedUsers.add(event.userId)
    if (event.reason === 'beta_changed' || event.reason === 'account_deleted') this.blockedUsers.add(event.userId)
    if (event.reason === 'source_revoked' && event.grantId) this.blockedGrants.add(event.grantId)
    for (const [key, lease] of this.leases) if (lease.userId === event.userId && (!event.grantId || lease.grantId === event.grantId)) {
      this.leases.delete(key)
      if (event.reason !== 'expired') this.knownInvalid.add(key)
    }
    for (const listener of this.listeners) listener(event)
  }
  private leaseAuthorized(lease: Lease): boolean {
    return !this.deletedUsers.has(lease.userId) && !this.blockedUsers.has(lease.userId) && !this.blockedGrants.has(lease.grantId) && lease.buildId === this.runtime.buildId && lease.generationId === this.runtime.generationId && this.now() < lease.expiresAt
      && isPrereleaseIdentityAuthorized(lease.state, this.now(), this.runtime.generationId)
  }
  cachedAuthorized(token: string, expected: { buildId?: string; generationId?: string } = {}): boolean {
    if (expected.buildId !== undefined && expected.buildId !== this.runtime.buildId || expected.generationId !== undefined && expected.generationId !== this.runtime.generationId) return false
    const lease = this.leases.get(hash(token))
    return !!lease && this.leaseAuthorized(lease)
  }
  status(token: string): 'authorized' | 'paused' | 'expired' { return this.cachedAuthorized(token) ? 'authorized' : this.knownInvalid.has(hash(token)) ? 'expired' : 'paused' }
  private user(state: PrereleaseIdentityState): PrereleaseUser {
    if (state.account.kind !== 'active') throw new Error('Deleted external principal')
    return { ...state.account.subject, isAdmin: false }
  }
  async beginHandoff(returnPath = '/open-agricola/') {
    const canonicalPath = normalizePrereleaseReturnPath(returnPath)
    if (!canonicalPath) throw new Error('Invalid prerelease return path')
    const cookie = opaque(), verifier = opaque(), state = opaque(), expiresAt = this.now() + 60_000
    await this.db.prepare('DELETE FROM prerelease_browser_handoffs WHERE expires_at<=?').run(this.now())
    await this.db.prepare('INSERT INTO prerelease_browser_handoffs(cookie_hash,browser_verifier,state,return_path,expires_at) VALUES(?,?,?,?,?)').run(hash(cookie), verifier, state, canonicalPath, expiresAt)
    const formal = new URL(this.runtime.formalAppOrigin)
    formal.searchParams.set('page', 'prerelease-handoff')
    formal.hash = new URLSearchParams({ browserChallenge: hash(verifier), state, targetOrigin: this.runtime.appOrigin, returnTo: `${this.runtime.formalAppOrigin}/` }).toString()
    return { cookie, formalUrl: formal.href, expiresAt }
  }
  async exchangeHandoff(cookie: string, input: HandoffInput): Promise<PrereleaseSession & { token: string; returnPath: string }> {
    if (!secret(cookie) || input.protocolVersion !== 1 || !secret(input.code) || !secret(input.state) || !secret(input.browserChallenge) || input.returnTo !== `${this.runtime.formalAppOrigin}/`) throw new Error('Invalid prerelease handoff')
    const operationEpoch = this.epoch
    return this.db.transaction(async () => {
      const pending = await this.db.prepare('SELECT * FROM prerelease_browser_handoffs WHERE cookie_hash=? FOR UPDATE').get<{ browser_verifier: string; state: string; return_path: string; expires_at: number }>(hash(cookie))
      if (!pending || !normalizePrereleaseReturnPath(pending.return_path) || pending.expires_at <= this.now() || pending.state !== input.state || hash(pending.browser_verifier) !== input.browserChallenge) throw new Error('Invalid prerelease handoff')
      const state = parsePrereleaseIdentityState(await this.authority.exchange({ code: input.code, browserVerifier: pending.browser_verifier, returnTo: input.returnTo }), this.runtime)
      if (!isPrereleaseIdentityAuthorized(state, this.now(), this.runtime.generationId)) throw new Error('Prerelease access unavailable')
      const user = this.user(state), now = this.now(), token = opaque(), expiresAt = Math.min(now + PRERELEASE_SESSION_MAX_AGE_MS, state.grant.expiresAt, state.source.kind === 'active' ? state.source.expiresAt : now)
      if (this.deletedUsers.has(user.id) || await this.db.prepare('SELECT 1 FROM prerelease_deleted_subjects WHERE user_id=?').get(user.id)
        || await this.db.prepare('SELECT 1 FROM prerelease_revoked_grants WHERE grant_id=?').get(state.grantId)) throw new Error('Revoked prerelease identity')
      const existing = await this.db.prepare('SELECT identity_origin FROM users WHERE id=? OR username=?').get<{ identity_origin: string }>(user.id, user.username)
      if (existing && existing.identity_origin !== 'external') throw new Error('External identity conflicts with local principal')
      await this.db.prepare(`INSERT INTO users(id,username,display_name,password_hash,created_at,identity_origin) VALUES(?,?,?,NULL,?,'external')
        ON CONFLICT(id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name`).run(user.id, user.username, user.displayName, now)
      await this.db.prepare(`INSERT INTO prerelease_external_identities(user_id,source_grant_id,generation_id) VALUES(?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET source_grant_id=excluded.source_grant_id,generation_id=excluded.generation_id`).run(user.id, state.grantId, this.runtime.generationId)
      await this.db.prepare('INSERT INTO prerelease_sessions(token_hash,user_id,grant_id,generation_id,build_id,created_at,expires_at,identity_state) VALUES(?,?,?,?,?,?,?,?)').run(hash(token), user.id, state.grantId, this.runtime.generationId, this.runtime.buildId, now, expiresAt, JSON.stringify(state))
      await this.db.prepare('DELETE FROM prerelease_browser_handoffs WHERE cookie_hash=?').run(hash(cookie))
      if (operationEpoch !== this.epoch) throw new Error('Identity changed during handoff')
      this.blockedUsers.delete(user.id)
      this.leases.set(hash(token), { state, userId: user.id, grantId: state.grantId, expiresAt, buildId: this.runtime.buildId, generationId: this.runtime.generationId })
      return { token, user, expiresAt, validUntil: state.validUntil, returnPath: pending.return_path }
    })()
  }
  async resolve(token: string): Promise<PrereleaseSession | null> {
    if (!secret(token)) return null
    const operationEpoch = this.epoch
    const key = hash(token), row = await this.db.prepare(`SELECT s.*,p.revision FROM prerelease_sessions s JOIN prerelease_external_identities p ON p.user_id=s.user_id WHERE s.token_hash=?`).get<SessionRow>(key)
    if (!row || this.deletedUsers.has(row.user_id) || row.revoked_at !== null || row.expires_at <= this.now() || row.generation_id !== this.runtime.generationId || row.build_id !== this.runtime.buildId) {
      this.leases.delete(key); this.knownInvalid.add(key); return null
    }
    let state = parsePrereleaseIdentityState(JSON.parse(row.identity_state), this.runtime, row.grant_id)
    if (this.blockedUsers.has(row.user_id) || this.blockedGrants.has(row.grant_id) || !isPrereleaseIdentityAuthorized(state, this.now(), this.runtime.generationId)) {
      try {
        state = parsePrereleaseIdentityState(await this.authority.status(row.grant_id), this.runtime, row.grant_id)
        if (state.account.kind === 'active' && state.account.subject.id !== row.user_id) throw new Error('Identity subject changed')
        if (state.account.kind !== 'active' || state.source.kind !== 'active' || state.grant.kind !== 'active' || !state.betaAccess) {
          await this.denyState(row, state); this.knownInvalid.add(key); return null
        }
        const updated = await this.db.prepare(`UPDATE prerelease_sessions SET identity_state=? WHERE token_hash=? AND revoked_at IS NULL
          AND EXISTS(SELECT 1 FROM prerelease_external_identities p WHERE p.user_id=prerelease_sessions.user_id AND p.revision=?)
          AND NOT EXISTS(SELECT 1 FROM prerelease_deleted_subjects d WHERE d.user_id=prerelease_sessions.user_id)
          AND NOT EXISTS(SELECT 1 FROM prerelease_revoked_grants g WHERE g.grant_id=prerelease_sessions.grant_id)`).run(JSON.stringify(state), key, row.revision)
        if (!updated.changes) { this.leases.delete(key); return null }
        if (state.account.kind === 'active') await this.db.prepare('UPDATE users SET username=?,display_name=? WHERE id=? AND identity_origin=\'external\'').run(state.account.subject.username, state.account.subject.displayName, row.user_id)
      } catch { this.leases.delete(key); return null }
    }
    if (state.account.kind !== 'active' || state.account.subject.id !== row.user_id) return null
    if (operationEpoch !== this.epoch) return null
    this.blockedUsers.delete(row.user_id)
    const lease = { state, userId: row.user_id, grantId: row.grant_id, expiresAt: row.expires_at, buildId: row.build_id, generationId: row.generation_id }
    if (!this.leaseAuthorized(lease)) {
      this.leases.delete(key)
      if (!state.betaAccess) { this.knownInvalid.add(key); this.invalidate({ userId: row.user_id, reason: 'beta_changed' }) }
      return null
    }
    this.knownInvalid.delete(key); this.leases.set(key, lease)
    return { user: this.user(state), expiresAt: row.expires_at, validUntil: Math.min(state.validUntil, row.expires_at) }
  }
  private async denyState(row: SessionRow, state: PrereleaseIdentityState): Promise<void> {
    const reason = state.account.kind !== 'active' ? 'account_deleted' : !state.betaAccess ? 'beta_changed' : 'source_revoked'
    this.invalidate({ userId: row.user_id, ...(reason === 'source_revoked' ? { grantId: row.grant_id } : {}), reason })
    await this.db.transaction(async () => {
      if (reason === 'source_revoked') {
        await this.db.prepare('INSERT INTO prerelease_revoked_grants(grant_id,user_id,generation_id,revoked_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(row.grant_id, row.user_id, this.runtime.generationId, this.now())
        await this.db.prepare('UPDATE prerelease_sessions SET revoked_at=? WHERE grant_id=?').run(this.now(), row.grant_id)
      } else if (reason === 'account_deleted') {
        await this.db.prepare('INSERT INTO prerelease_deleted_subjects(user_id,deleted_at) VALUES(?,?) ON CONFLICT DO NOTHING').run(row.user_id, this.now())
        await this.db.prepare('UPDATE prerelease_sessions SET revoked_at=? WHERE user_id=?').run(this.now(), row.user_id)
      } else await this.pauseSubject(row.user_id)
    })()
  }
  private async pauseSubject(userId: string): Promise<void> {
    await this.db.prepare('UPDATE prerelease_external_identities SET revision=revision+1 WHERE user_id=?').run(userId)
    const rows = await this.db.prepare('SELECT token_hash,identity_state FROM prerelease_sessions WHERE user_id=? AND revoked_at IS NULL').all<{ token_hash: string; identity_state: string }>(userId)
    for (const row of rows) {
      const state = parsePrereleaseIdentityState(JSON.parse(row.identity_state), this.runtime)
      state.validUntil = 0
      await this.db.prepare('UPDATE prerelease_sessions SET identity_state=? WHERE token_hash=?').run(JSON.stringify(state), row.token_hash)
    }
  }
  async revoke(token: string, all = false): Promise<void> {
    const row = await this.db.prepare('SELECT user_id,grant_id FROM prerelease_sessions WHERE token_hash=?').get<{ user_id: string; grant_id: string }>(hash(token))
    if (!row) return
    await this.db.prepare(`UPDATE prerelease_sessions SET revoked_at=? WHERE ${all ? 'user_id' : 'token_hash'}=?`).run(this.now(), all ? row.user_id : hash(token))
    this.knownInvalid.add(hash(token)); this.leases.delete(hash(token))
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
      if (event.kind === 'account_deleted') {
        await this.db.transaction(async () => {
          await this.db.prepare('INSERT INTO prerelease_deleted_subjects(user_id,deleted_at) VALUES(?,?) ON CONFLICT DO NOTHING').run(event.userId, this.now())
          await this.db.prepare('UPDATE prerelease_external_identities SET revision=revision+1 WHERE user_id=?').run(event.userId)
          await this.db.prepare('UPDATE prerelease_sessions SET revoked_at=? WHERE user_id=?').run(this.now(), event.userId)
        })()
        // Shared invalidation must commit before it drains Room queues and erases payloads.
        await this.eraseAccount(event.userId)
        if (await this.db.prepare('SELECT 1 FROM users WHERE id=?').get(event.userId)) throw new Error('External account cleanup is incomplete')
      } else if (event.kind === 'source_revoked') {
        await this.db.transaction(async () => {
          await this.db.prepare('UPDATE prerelease_external_identities SET revision=revision+1 WHERE user_id=?').run(event.userId)
          await this.db.prepare('INSERT INTO prerelease_revoked_grants(grant_id,user_id,generation_id,revoked_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(event.grantId, event.userId, this.runtime.generationId, this.now())
          await this.db.prepare('UPDATE prerelease_sessions SET revoked_at=? WHERE grant_id=?').run(this.now(), event.grantId)
        })()
      } else {
        await this.db.transaction(() => this.pauseSubject(event.userId))()
        const grants = await this.db.prepare(`SELECT DISTINCT grant_id FROM prerelease_sessions WHERE user_id=? AND revoked_at IS NULL
          UNION SELECT source_grant_id AS grant_id FROM prerelease_external_identities WHERE user_id=?`).all<{ grant_id: string }>(event.userId, event.userId)
        for (const row of grants) {
          const state = parsePrereleaseIdentityState(await this.authority.status(row.grant_id), this.runtime, row.grant_id)
          if (state.account.kind === 'active' && state.account.subject.id !== event.userId) throw new Error('Identity subject changed')
          await this.db.prepare('UPDATE prerelease_sessions SET identity_state=? WHERE grant_id=? AND user_id=? AND revoked_at IS NULL').run(JSON.stringify(state), row.grant_id, event.userId)
        }
      }
      await this.db.prepare('INSERT INTO prerelease_processed_identity_events(event_id,generation_id,outcome,completed_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(event.id, this.runtime.generationId, outcome, this.now())
    }
    await this.authority.acknowledge(event.id, previous?.outcome ?? outcome)
    await this.db.prepare('UPDATE prerelease_processed_identity_events SET acknowledged_at=? WHERE event_id=?').run(this.now(), event.id)
  }
  async refreshActive(): Promise<void> {
    if (this.refreshing) return this.refreshing
    this.refreshing = (async () => {
      for (const [key, lease] of this.leases) if (!this.leaseAuthorized(lease)) {
        this.leases.delete(key); this.invalidate({ userId: lease.userId, grantId: lease.grantId, reason: 'expired' })
      }
      await this.processEvents()
      const grants = [...new Set([...this.leases.values()].filter(lease => lease.state.validUntil - this.now() <= 15_000).map(lease => lease.grantId))]
      for (const grantId of grants) {
        const row = await this.db.prepare(`SELECT s.*,p.revision FROM prerelease_sessions s JOIN prerelease_external_identities p ON p.user_id=s.user_id WHERE s.grant_id=? AND s.revoked_at IS NULL LIMIT 1`).get<SessionRow>(grantId)
        if (!row) continue
        const operationEpoch = this.epoch
        const state = parsePrereleaseIdentityState(await this.authority.status(grantId), this.runtime, grantId)
        if (state.account.kind === 'active' && state.account.subject.id !== row.user_id) throw new Error('Identity subject changed')
        const updated = await this.db.prepare(`UPDATE prerelease_sessions SET identity_state=? WHERE grant_id=? AND revoked_at IS NULL
          AND EXISTS(SELECT 1 FROM prerelease_external_identities p WHERE p.user_id=prerelease_sessions.user_id AND p.revision=?)
          AND NOT EXISTS(SELECT 1 FROM prerelease_revoked_grants g WHERE g.grant_id=prerelease_sessions.grant_id)
          AND NOT EXISTS(SELECT 1 FROM prerelease_deleted_subjects d WHERE d.user_id=prerelease_sessions.user_id)`).run(JSON.stringify(state), grantId, row.revision)
        if (!updated.changes || operationEpoch !== this.epoch) continue
        if (!isPrereleaseIdentityAuthorized(state, this.now(), this.runtime.generationId)) {
          await this.denyState(row, state)
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
  close() { if (this.timer) clearInterval(this.timer); this.timer = undefined; this.leases.clear() }
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
