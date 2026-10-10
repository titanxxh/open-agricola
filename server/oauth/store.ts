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
  invite_code_hash: string | null
  account_pkce_verifier: string | null
}

type OnboardingTicketRow = {
  provider: OAuthProvider
  provider_user_id: string
  provider_login: string | null
  provider_email: string | null
  provider_email_verified: number
  display_name: string | null
  avatar_url: string | null
  return_to: string | null
  invite_code_hash: string | null
}

export type OAuthOnboardingProfile = OAuthProfile & {
  returnTo?: string
  inviteCodeHash?: string
}

function createRawSecret(): string {
  return randomBytes(32).toString('base64url')
}

function hashSecret(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function pruneExpiredOAuthRows(now: number = Date.now()): Promise<Awaited<void>> {
  const db = getDb()
  ;(await db.prepare('DELETE FROM oauth_states WHERE used_at IS NOT NULL OR expires_at <= ?').run(now))
  ;(await db.prepare('DELETE FROM oauth_onboarding_tickets WHERE used_at IS NOT NULL OR expires_at <= ?').run(now))
}

export async function createOAuthState(input: {
  provider: OAuthProvider
  intent: OAuthIntent
  userId?: string
  returnTo?: string
  inviteCodeHash?: string
  accountPkceVerifier?: string
}): Promise<Awaited<string>> {
  const raw = createRawSecret()
  const now = Date.now()
  ;(await pruneExpiredOAuthRows(now))
  ;(await getDb().prepare(`
    INSERT INTO oauth_states (state_hash, provider, intent, user_id, return_to, invite_code_hash, expires_at, created_at, account_pkce_verifier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    hashSecret(raw),
    input.provider,
    input.intent,
    input.userId ?? null,
    input.returnTo ?? null,
    input.inviteCodeHash ?? null,
    now + STATE_TTL_MS,
    now,
    input.accountPkceVerifier ?? null,
  ))
  return raw
}

function stateFromRow(row: OAuthStateRow | undefined) {
  if (!row) return null
  return {
    provider: row.provider,
    intent: row.intent,
    ...(row.user_id ? { userId: row.user_id } : {}),
    ...(row.return_to ? { returnTo: row.return_to } : {}),
    ...(row.invite_code_hash ? { inviteCodeHash: row.invite_code_hash } : {}),
    ...(row.account_pkce_verifier ? { accountPkceVerifier: row.account_pkce_verifier } : {}),
  }
}

export async function getOAuthState(rawState: string) {
  const row = await getDb().prepare(`
    SELECT provider, intent, user_id, return_to, invite_code_hash, account_pkce_verifier
    FROM oauth_states WHERE state_hash = ? AND used_at IS NULL AND expires_at > ?
  `).get(hashSecret(rawState), Date.now()) as OAuthStateRow | undefined
  return stateFromRow(row)
}

export async function consumeOAuthState(rawState: string, owner?: { provider: OAuthProvider; userId: string }) {
  const now = Date.now()
  const db = getDb()
  const row = await db.prepare(`
    UPDATE oauth_states SET used_at = ?
    WHERE state_hash = ? AND used_at IS NULL AND expires_at > ?
    AND (?::text IS NULL OR (provider = ? AND intent = 'link' AND user_id = ? AND account_pkce_verifier IS NOT NULL))
    RETURNING provider, intent, user_id, return_to, invite_code_hash, account_pkce_verifier
  `).get(now, hashSecret(rawState), now, owner?.userId ?? null, owner?.provider ?? null, owner?.userId ?? null) as OAuthStateRow | undefined
  if (row?.account_pkce_verifier) {
    await db.prepare('UPDATE oauth_states SET account_pkce_verifier = NULL WHERE state_hash = ?').run(hashSecret(rawState))
  }
  return stateFromRow(row)
}

export async function findIdentity(provider: OAuthProvider, providerUserId: string): Promise<Awaited<{ userId: string } | null>> {
  const row = (await getDb().prepare(`
    SELECT user_id
    FROM auth_identities
    WHERE provider = ? AND provider_user_id = ?
  `).get(provider, providerUserId)) as { user_id: string } | undefined
  return row ? { userId: row.user_id } : null
}

export async function linkIdentity(userId: string, profile: OAuthProfile): Promise<Awaited<void>> {
  const db = getDb()
  const existingIdentity = (await db.prepare(`
    SELECT user_id
    FROM auth_identities
    WHERE provider = ? AND provider_user_id = ?
  `).get(profile.provider, profile.providerUserId))
  if (existingIdentity) throw new Error('provider identity already linked')

  const existingProvider = (await db.prepare(`
    SELECT id
    FROM auth_identities
    WHERE user_id = ? AND provider = ?
  `).get(userId, profile.provider))
  if (existingProvider) throw new Error('user already linked provider')

  ;(await db.prepare(`
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
  ))
}

export async function createOnboardingTicket(profile: OAuthProfile, returnTo?: string, inviteCodeHash?: string): Promise<Awaited<string>> {
  const raw = createRawSecret()
  const now = Date.now()
  ;(await pruneExpiredOAuthRows(now))
  ;(await getDb().prepare(`
    INSERT INTO oauth_onboarding_tickets (
      ticket_hash, provider, provider_user_id, provider_login, provider_email,
      provider_email_verified, display_name, avatar_url, return_to, invite_code_hash, expires_at, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    hashSecret(raw),
    profile.provider,
    profile.providerUserId,
    profile.providerLogin ?? null,
    profile.email ?? null,
    profile.emailVerified ? 1 : 0,
    profile.displayName ?? null,
    profile.avatarUrl ?? null,
    returnTo ?? null,
    inviteCodeHash ?? null,
    now + ONBOARDING_TICKET_TTL_MS,
    now,
  ))
  return raw
}

function profileFromTicketRow(row: OnboardingTicketRow): OAuthOnboardingProfile {
  return {
    provider: row.provider,
    providerUserId: row.provider_user_id,
    ...(row.provider_login ? { providerLogin: row.provider_login } : {}),
    ...(row.provider_email ? { email: row.provider_email } : {}),
    emailVerified: row.provider_email_verified === 1,
    ...(row.display_name ? { displayName: row.display_name } : {}),
    ...(row.avatar_url ? { avatarUrl: row.avatar_url } : {}),
    ...(row.return_to ? { returnTo: row.return_to } : {}),
    ...(row.invite_code_hash ? { inviteCodeHash: row.invite_code_hash } : {}),
  }
}

export async function getOnboardingTicket(rawTicket: string): Promise<Awaited<OAuthOnboardingProfile | null>> {
  const ticketHash = hashSecret(rawTicket)
  const row = (await getDb().prepare(`
    SELECT provider, provider_user_id, provider_login, provider_email,
      provider_email_verified, display_name, avatar_url, return_to, invite_code_hash
    FROM oauth_onboarding_tickets
    WHERE ticket_hash = ? AND used_at IS NULL AND expires_at > ?
  `).get(ticketHash, Date.now())) as OnboardingTicketRow | undefined

  return row ? profileFromTicketRow(row) : null
}

export async function consumeOnboardingTicket(rawTicket: string): Promise<Awaited<OAuthOnboardingProfile | null>> {
  const db = getDb()
  const ticketHash = hashSecret(rawTicket)
  const now = Date.now()
  const row = (await db.prepare(`
    UPDATE oauth_onboarding_tickets SET used_at = ?
    WHERE ticket_hash = ? AND used_at IS NULL AND expires_at > ?
    RETURNING provider, provider_user_id, provider_login, provider_email,
      provider_email_verified, display_name, avatar_url, return_to, invite_code_hash
  `).get(now, ticketHash, now)) as OnboardingTicketRow | undefined

  if (!row) return null
  return profileFromTicketRow(row)
}

export async function getLinkedIdentities(userId: string): Promise<Awaited<Array<{
  provider: OAuthProvider
  providerLogin?: string
  providerEmail?: string
  linkedAt: number
}>>> {
  const rows = (await getDb().prepare(`
    SELECT provider, provider_login, provider_email, linked_at
    FROM auth_identities
    WHERE user_id = ?
    ORDER BY linked_at ASC
  `).all(userId)) as Array<{
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
