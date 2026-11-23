/**
 * Replay Removal ledger records and their validation. Pure data only: backup
 * export and ledger commands read these without loading the game server
 * (#2024).
 */
export type ReplayRemovalReason = 'removed' | 'moderation' | 'legal'

export type ReplayRemovalLedgerEntry = {
  version: 1
  roomId: string
  reason: ReplayRemovalReason
  removedAt: number
  assetHashes: string[]
  eraseResult: boolean
}

export type ReplayAssetTakedown = {
  hash: string
  reason: ReplayRemovalReason
  removedAt: number
}

export type ReplayRemovalLedgerBatch = {
  version: 1
  entries: ReplayRemovalLedgerEntry[]
  assetTakedowns: ReplayAssetTakedown[]
}

export const ROOM_ID = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
export const ASSET_HASH = /^[a-f0-9]{64}$/
export const REMOVAL_REASONS = new Set<ReplayRemovalReason>([
  'removed',
  'moderation',
  'legal',
])

export const validateEntry = (value: unknown): ReplayRemovalLedgerEntry => {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid replay removal ledger entry')
  }
  const entry = value as Partial<ReplayRemovalLedgerEntry>
  if (
    entry.version !== 1
    || typeof entry.roomId !== 'string'
    || entry.roomId.length > 128
    || !ROOM_ID.test(entry.roomId)
    || typeof entry.reason !== 'string'
    || !REMOVAL_REASONS.has(entry.reason as ReplayRemovalReason)
    || !Number.isSafeInteger(entry.removedAt)
    || (entry.removedAt as number) < 0
    || !Array.isArray(entry.assetHashes)
    || entry.assetHashes.some((hash) => (
      typeof hash !== 'string' || !ASSET_HASH.test(hash)
    ))
    || typeof entry.eraseResult !== 'boolean'
  ) {
    throw new Error('invalid replay removal ledger entry')
  }
  return {
    version: 1,
    roomId: entry.roomId,
    reason: entry.reason as ReplayRemovalReason,
    removedAt: entry.removedAt as number,
    assetHashes: [...new Set(entry.assetHashes)].sort(),
    eraseResult: entry.eraseResult,
  }
}

const validateAssetTakedown = (value: unknown): ReplayAssetTakedown => {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid replay asset takedown')
  }
  const rule = value as Partial<ReplayAssetTakedown>
  if (
    typeof rule.hash !== 'string'
    || !ASSET_HASH.test(rule.hash)
    || typeof rule.reason !== 'string'
    || !REMOVAL_REASONS.has(rule.reason as ReplayRemovalReason)
    || !Number.isSafeInteger(rule.removedAt)
    || (rule.removedAt as number) < 0
  ) {
    throw new Error('invalid replay asset takedown')
  }
  return {
    hash: rule.hash,
    reason: rule.reason as ReplayRemovalReason,
    removedAt: rule.removedAt as number,
  }
}

export const validateBatch = (value: unknown): ReplayRemovalLedgerBatch => {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid replay removal ledger batch')
  }
  const batch = value as Partial<ReplayRemovalLedgerBatch>
  if (
    batch.version !== 1
    || !Array.isArray(batch.entries)
    || !Array.isArray(batch.assetTakedowns)
    || (batch.entries.length === 0 && batch.assetTakedowns.length === 0)
  ) {
    throw new Error('invalid replay removal ledger batch')
  }
  return {
    version: 1,
    entries: batch.entries.map(validateEntry),
    assetTakedowns: batch.assetTakedowns.map(validateAssetTakedown),
  }
}
