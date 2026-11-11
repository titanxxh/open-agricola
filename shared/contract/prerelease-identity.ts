/** Stable authority contract. A grant is an association, never a site login credential. */
export const PRERELEASE_IDENTITY_PROTOCOL = 1
export const PRERELEASE_IDENTITY_FRESHNESS_MS = 30_000
export const PRERELEASE_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type PrereleaseIdentitySubject = {
  id: string
  username: string
  displayName: string
}

export type PrereleaseIdentityState = {
  protocolVersion: typeof PRERELEASE_IDENTITY_PROTOCOL
  channel: 'prerelease'
  targetOrigin: string
  generationId: string
  grantId: string
  account: { kind: 'active'; subject: PrereleaseIdentitySubject } | { kind: 'deleted' }
  source: { kind: 'active'; expiresAt: number } | { kind: 'invalid' }
  betaAccess: boolean
  grant: { kind: 'active' | 'revoked'; expiresAt: number }
  confirmedAt: number
  validUntil: number
}

export type PrereleaseEntry =
  | { kind: 'disabled' }
  | { kind: 'available'; channel: 'prerelease'; startUrl: string; returnTo: string }

export type PrereleaseIdentityEvent = {
  id: string
  userId: string
  createdAt: number
} & (
  | { kind: 'source_revoked'; grantId: string }
  | { kind: 'account_deleted' | 'beta_changed'; grantId: null }
)

export type PrereleaseIdentityReceipt = { eventId: string; completedAt: number } & (
  | { outcome: 'revoked' | 'deleted' | 'rechecked' }
  | { outcome: 'erased'; erasureOperationId: string }
)

/** Consumers use the authority's absolute deadline, including time spent in transit. */
export function isPrereleaseIdentityAuthorized(state: PrereleaseIdentityState, now: number, generationId: string): boolean {
  return state.generationId === generationId && state.confirmedAt <= now && now < state.validUntil
    && state.validUntil <= state.confirmedAt + PRERELEASE_IDENTITY_FRESHNESS_MS
    && state.account.kind === 'active' && state.source.kind === 'active'
    && now < state.source.expiresAt && state.grant.kind === 'active'
    && now < state.grant.expiresAt && state.betaAccess
}

export type PrereleaseOwnerReceipt = {
  operationId: string
  generationId: string
  targetOrigin: string
  targetId: string
  completedAt: number
} & (
  | { action: 'prepare' | 'close' | 'associate' }
  | { action: 'activate'; auditOperationId: string }
  | { action: 'audit-complete'; identityManifestSha256: string; identityCount: number; verificationReceiptSha256: string }
  | { action: 'retire'; purgeReceiptSha256: string }
)

export type PrereleaseGenerationView = {
  generationId: string
  targetOrigin: string
  targetId: string
  isCurrent: boolean
  preparedAt: number
  audit: (PrereleaseOwnerReceipt & { action: 'audit-complete' }) | null
} & (
  | { state: 'closed'; retirement: null }
  | { state: 'open'; retirement: null; audit: PrereleaseOwnerReceipt & { action: 'audit-complete' } }
  | { state: 'retired'; retirement: PrereleaseOwnerReceipt & { action: 'retire' } }
)
