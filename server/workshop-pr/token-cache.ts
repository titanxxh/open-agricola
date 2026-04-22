import { nanoid } from 'nanoid'

type Entry = { token: string; userId: string; expiresAt: number }
type Pending = { userId: string; expiresAt: number }

/**
 * In-memory transient store for the GitHub OAuth handshake token flow.
 *
 * Two phases for a given handshakeId:
 *   1. "pending" — allocated by /oauth/start; waiting for GitHub callback.
 *   2. "bound"   — token exchanged by /oauth/callback; waiting for /propose
 *                  to consume it.
 *
 * Tokens never touch disk. Entries auto-expire after ttlMs (default 60s).
 */
export class TokenCache {
  private readonly tokens = new Map<string, Entry>()
  private readonly pending = new Map<string, Pending>()
  private readonly ttlMs: number

  constructor(ttlMs = 60_000) {
    this.ttlMs = ttlMs
  }

  /** Start a handshake: allocate a handshakeId tied to userId; token bound later via callback. */
  allocateHandshakeId(userId: string): string {
    const hs = nanoid(32)
    this.pending.set(hs, { userId, expiresAt: Date.now() + this.ttlMs })
    return hs
  }

  /** Callback handler: bind the GitHub access token to an existing handshake. */
  bind(hs: string, token: string): void {
    const p = this.pending.get(hs)
    if (!p || p.expiresAt < Date.now()) {
      this.pending.delete(hs)
      return
    }
    this.tokens.set(hs, { token, userId: p.userId, expiresAt: p.expiresAt })
    this.pending.delete(hs)
  }

  /** Consumer: retrieve the bound token; returns undefined if unbound or expired. */
  get(hs: string): { token: string; userId: string } | undefined {
    const e = this.tokens.get(hs)
    if (!e) return undefined
    if (e.expiresAt < Date.now()) {
      this.tokens.delete(hs)
      return undefined
    }
    return { token: e.token, userId: e.userId }
  }

  /** True if a pending (not-yet-bound, not-yet-expired) handshakeId exists. */
  hasPending(hs: string): boolean {
    const p = this.pending.get(hs)
    if (!p) return false
    if (p.expiresAt < Date.now()) {
      this.pending.delete(hs)
      return false
    }
    return true
  }

  /** Clear all state for a handshakeId (used after successful consumption or error). */
  delete(hs: string): void {
    this.tokens.delete(hs)
    this.pending.delete(hs)
  }
}

export const tokenCache = new TokenCache()
