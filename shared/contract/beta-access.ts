import type { InvitablePlayer } from './room-access'

export type BetaAccessGrant = {
  account: InvitablePlayer
  grantedBy: InvitablePlayer | null
  grantedAt: number
}

const isAccount = (value: unknown): value is InvitablePlayer => value !== null && typeof value === 'object'
  && 'id' in value && typeof value.id === 'string'
  && 'username' in value && typeof value.username === 'string'
  && 'displayName' in value && typeof value.displayName === 'string'

export const isBetaAccessGrant = (value: unknown): value is BetaAccessGrant => value !== null && typeof value === 'object'
  && 'account' in value && isAccount(value.account)
  && 'grantedBy' in value && (value.grantedBy === null || isAccount(value.grantedBy))
  && 'grantedAt' in value && typeof value.grantedAt === 'number' && Number.isSafeInteger(value.grantedAt)

export function parseBetaAccessAccount(value: unknown): string {
  if (!value || typeof value !== 'object' || !('userId' in value) || typeof value.userId !== 'string'
    || !value.userId.length || value.userId.length > 128 || value.userId.trim() !== value.userId) {
    throw new Error('Invalid Beta access account')
  }
  return value.userId
}
