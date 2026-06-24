import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { getDb } from '../db.ts'
import type { OAuthIntent, OAuthProfile, OAuthProvider } from './types.ts'

const STATE_TTL_MS = 10 * 60 * 1000
const ONBOARDING_TICKET_TTL_MS = 15 * 60 * 1000

type OAuthStateRow = {
  provider: OAuthProvider
  intent: OAuthIntent
  user_id: string | null
  return_to: string | null
}

type OnboardingTicketRow = {
  provider: OAuthProvider
  provider_user_id: string
  provider_login: string | null
  provider_email: string | null
  provider_email_verified: number
  display_name: string | null
  avatar_url: string | null
}

function createRawSecret(): string {
  return randomBytes(32).toString('base64url')
}

function hashSecret(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function createOAuthState(input: {
  provider: OAuthProvider
  intent: OAuthIntent
  userId?: string
  returnTo?: string
}): string {
  const raw = createRawSecret()
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO oauth_states (state_hash, provider, intent, user_id, return_to, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(hashSecret(raw), input.provider, input.intent, input.userId ?? null, input.returnTo ?? null, now + STATE_TTL_MS, now)
  return raw
}

export function consumeOAuthState(rawState: string): {
  provider: OAuthProvider
  intent: OAuthIntent
  userId?: string
  returnTo?: string
} | null {
  const db = getDb()
  const stateHash = hashSecret(rawState)
  const now = Date.now()
  const row = db.prepare(`
    SELECT provider, intent, user_id, return_to
    FROM oauth_states
    WHERE state_hash = ? AND used_at IS NULL AND expires_at > ?
  `).get(stateHash, now) as OAuthStateRow | undefined

  if (!row) return null
  db.prepare('UPDATE oauth_states SET used_at = ? WHERE state_hash = ? AND used_at IS NULL').run(now, stateHash)
  return {
    provider: row.provider,
    intent: row.intent,
    ...(row.user_id ? { userId: row.user_id } : {}),
    ...(row.return_to ? { returnTo: row.return_to } : {}),
  }
}

export function findIdentity(provider: OAuthProvider, providerUserId: string): { userId: string } | null {
  const row = getDb().prepare(`
    SELECT user_id
    FROM auth_identities
    WHERE provider = ? AND provider_user_id = ?
  `).get(provider, providerUserId) as { user_id: string } | undefined
  return row ? { userId: row.user_id } : null
}

export function linkIdentity(userId: string, profile: OAuthProfile): void {
  const db = getDb()
  const existingIdentity = db.prepare(`
    SELECT user_id
    FROM auth_identities
    WHERE provider = ? AND provider_user_id = ?
  `).get(profile.provider, profile.providerUserId)
  if (existingIdentity) throw new Error('provider identity already linked')

  const existingProvider = db.prepare(`
    SELECT id
    FROM auth_identities
    WHERE user_id = ? AND provider = ?
  `).get(userId, profile.provider)
  if (existingProvider) throw new Error('user already linked provider')

  db.prepare(`
    INSERT INTO auth_identities (
      id, user_id, provider, provider_user_id, provider_login, provider_email,
      provider_email_verified, display_name, avatar_url, linked_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    userId,
    profile.provider,
    profile.providerUserId,
    profile.providerLogin ?? null,
    profile.email ?? null,
    profile.emailVerified ? 1 : 0,
    profile.displayName ?? null,
    profile.avatarUrl ?? null,
    Date.now(),
  )
}

export function createOnboardingTicket(profile: OAuthProfile): string {
  const raw = createRawSecret()
  const now = Date.now()
  getDb().prepare(`
    INSERT INTO oauth_onboarding_tickets (
      ticket_hash, provider, provider_user_id, provider_login, provider_email,
      provider_email_verified, display_name, avatar_url, expires_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    hashSecret(raw),
    profile.provider,
    profile.providerUserId,
    profile.providerLogin ?? null,
    profile.email ?? null,
    profile.emailVerified ? 1 : 0,
    profile.displayName ?? null,
    profile.avatarUrl ?? null,
    now + ONBOARDING_TICKET_TTL_MS,
    now,
  )
  return raw
}

export function consumeOnboardingTicket(rawTicket: string): OAuthProfile | null {
  const db = getDb()
  const ticketHash = hashSecret(rawTicket)
  const now = Date.now()
  const row = db.prepare(`
    SELECT provider, provider_user_id, provider_login, provider_email,
      provider_email_verified, display_name, avatar_url
    FROM oauth_onboarding_tickets
    WHERE ticket_hash = ? AND used_at IS NULL AND expires_at > ?
  `).get(ticketHash, now) as OnboardingTicketRow | undefined

  if (!row) return null
  db.prepare('UPDATE oauth_onboarding_tickets SET used_at = ? WHERE ticket_hash = ? AND used_at IS NULL').run(now, ticketHash)
  return {
    provider: row.provider,
    providerUserId: row.provider_user_id,
    ...(row.provider_login ? { providerLogin: row.provider_login } : {}),
    ...(row.provider_email ? { email: row.provider_email } : {}),
    emailVerified: row.provider_email_verified === 1,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
  }
}

export function getLinkedIdentities(userId: string): Array<{
  provider: OAuthProvider
  providerLogin?: string
  providerEmail?: string
  linkedAt: number
}> {
  const rows = getDb().prepare(`
    SELECT provider, provider_login, provider_email, linked_at
    FROM auth_identities
    WHERE user_id = ?
    ORDER BY linked_at ASC
  `).all(userId) as Array<{
    provider: OAuthProvider
    provider_login: string | null
    provider_email: string | null
    linked_at: number
  }>

  return rows.map(row => ({
    provider: row.provider,
    ...(row.provider_login ? { providerLogin: row.provider_login } : {}),
    ...(row.provider_email ? { providerEmail: row.provider_email } : {}),
    linkedAt: row.linked_at,
  }))
}
