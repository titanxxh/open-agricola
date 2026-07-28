import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import type Database from 'better-sqlite3'

export type ReplayRemovalReason = 'removed' | 'moderation' | 'legal'

type ReplayRemovalLedgerEntry = {
  version: 1
  roomId: string
  reason: ReplayRemovalReason
  removedAt: number
  assetHashes: string[]
}

type ReplayRow = {
  room_id: string
  lifecycle: 'active' | 'completed' | 'expired' | 'removed'
  replay_status: 'available' | 'legacy_no_replay' | null
  custom_cards_json: string | null
}

export type ReplayRemovalOptions = {
  roomId: string
  reason: ReplayRemovalReason
  assetRoot: string
  ledgerPath: string
  assetHash?: string
  dryRun?: boolean
  now?: () => number
}

export type ReplayRemovalResult = {
  dryRun: boolean
  alreadyRemoved: boolean
  roomIds: string[]
  assetHashes: string[]
  deletedAssetHashes: string[]
}

export type ReplayRemovalLedgerResult = {
  entries: number
  removedRoomIds: string[]
  deletedAssetHashes: string[]
}

const ROOM_ID = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
const ASSET_HASH = /^[a-f0-9]{64}$/
const ASSET_URL = /^\/replay-assets\/([a-f0-9]{64})$/
const REMOVAL_REASONS = new Set<ReplayRemovalReason>([
  'removed',
  'moderation',
  'legal',
])

const replayAssetHashes = (raw: string | null): string[] => {
  if (raw === null) return []
  const definitions = JSON.parse(raw) as unknown
  if (!Array.isArray(definitions)) {
    throw new Error('invalid replay custom card archive')
  }
  return [...new Set(definitions.flatMap((definition) => {
    if (!definition || typeof definition !== 'object') return []
    const artUrl = (definition as { artUrl?: unknown }).artUrl
    if (typeof artUrl !== 'string') return []
    const match = ASSET_URL.exec(artUrl)
    return match ? [match[1]!] : []
  }))].sort()
}

const loadReplay = (
  db: Database.Database,
  roomId: string,
): ReplayRow | null =>
  (db.prepare(`
    SELECT context.room_id,
           context.lifecycle,
           context.replay_status,
           replay.custom_cards_json
    FROM game_contexts AS context
    LEFT JOIN game_replays AS replay ON replay.room_id = context.room_id
    WHERE context.room_id = ?
  `).get(roomId) as ReplayRow | undefined) ?? null

const replayRows = (db: Database.Database): ReplayRow[] =>
  db.prepare(`
    SELECT context.room_id,
           context.lifecycle,
           context.replay_status,
           replay.custom_cards_json
    FROM game_contexts AS context
    JOIN game_replays AS replay ON replay.room_id = context.room_id
    WHERE context.lifecycle != 'removed'
    ORDER BY context.room_id
  `).all() as ReplayRow[]

const referencedAssetHashes = (
  db: Database.Database,
  excludedRoomIds: ReadonlySet<string> = new Set(),
): Set<string> => {
  const hashes = new Set<string>()
  for (const row of replayRows(db)) {
    if (excludedRoomIds.has(row.room_id)) continue
    replayAssetHashes(row.custom_cards_json).forEach((hash) => hashes.add(hash))
  }
  return hashes
}

const validateEntry = (value: unknown): ReplayRemovalLedgerEntry => {
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
  ) {
    throw new Error('invalid replay removal ledger entry')
  }
  return {
    version: 1,
    roomId: entry.roomId,
    reason: entry.reason as ReplayRemovalReason,
    removedAt: entry.removedAt as number,
    assetHashes: [...new Set(entry.assetHashes)].sort(),
  }
}

const readLedger = (path: string): ReplayRemovalLedgerEntry[] => {
  if (!existsSync(path)) return []
  const raw = readFileSync(path, 'utf8')
  if (!raw.trim()) return []
  return raw.trim().split('\n').map((line) => {
    try {
      return validateEntry(JSON.parse(line) as unknown)
    } catch {
      throw new Error('invalid replay removal ledger')
    }
  })
}

const appendLedger = (
  path: string,
  entries: ReplayRemovalLedgerEntry[],
): void => {
  if (entries.length === 0) return
  mkdirSync(dirname(path), { recursive: true })
  const fd = openSync(path, 'a')
  try {
    writeFileSync(fd, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  const directoryFd = openSync(dirname(path), 'r')
  try {
    fsyncSync(directoryFd)
  } finally {
    closeSync(directoryFd)
  }
}

const applyEntries = (
  db: Database.Database,
  entries: ReplayRemovalLedgerEntry[],
): string[] => db.transaction(() => {
  const removedRoomIds: string[] = []
  for (const entry of entries) {
    const current = loadReplay(db, entry.roomId)
    if (!current || current.lifecycle === 'removed') continue
    db.prepare('DELETE FROM rooms WHERE id = ?').run(entry.roomId)
    db.prepare('DELETE FROM game_replay_steps WHERE room_id = ?').run(entry.roomId)
    db.prepare('DELETE FROM game_replays WHERE room_id = ?').run(entry.roomId)
    db.prepare(`
      UPDATE game_result_players
      SET user_id = NULL,
          display_name = 'Deleted player (seat ' || (player_index + 1) || ')'
      WHERE room_id = ?
    `).run(entry.roomId)
    db.prepare(`
      UPDATE game_contexts
      SET lifecycle = 'removed',
          phase = NULL,
          replay_status = NULL,
          expires_at = NULL,
          removal_reason = ?,
          updated_at = ?
      WHERE room_id = ?
    `).run(entry.reason, entry.removedAt, entry.roomId)
    removedRoomIds.push(entry.roomId)
  }
  return removedRoomIds
})()

const deleteUnreferencedAssets = (
  db: Database.Database,
  assetRoot: string,
  candidates: Iterable<string>,
): string[] => {
  const referenced = referencedAssetHashes(db)
  const deleted: string[] = []
  for (const hash of [...new Set(candidates)].sort()) {
    if (referenced.has(hash)) continue
    const path = join(assetRoot, hash)
    if (!existsSync(path)) continue
    unlinkSync(path)
    deleted.push(hash)
  }
  return deleted
}

const planRows = (
  db: Database.Database,
  target: ReplayRow,
  assetHash?: string,
): ReplayRow[] => {
  if (!assetHash) {
    if (
      target.lifecycle !== 'completed'
      || target.replay_status !== 'available'
      || target.custom_cards_json === null
    ) {
      throw new Error('replay is not removable')
    }
    return [target]
  }
  if (!ASSET_HASH.test(assetHash)) throw new Error('invalid replay asset hash')
  if (!replayAssetHashes(target.custom_cards_json).includes(assetHash)) {
    throw new Error('replay does not reference asset')
  }
  return replayRows(db).filter((row) =>
    replayAssetHashes(row.custom_cards_json).includes(assetHash))
}

export function removeReplay(
  db: Database.Database,
  options: ReplayRemovalOptions,
): ReplayRemovalResult {
  if (
    options.roomId.length > 128
    || !ROOM_ID.test(options.roomId)
  ) {
    throw new Error('invalid room id')
  }
  if (!REMOVAL_REASONS.has(options.reason)) {
    throw new Error('invalid replay removal reason')
  }
  const target = loadReplay(db, options.roomId)
  if (!target) throw new Error('replay not found')
  if (target.lifecycle === 'removed') {
    return {
      dryRun: options.dryRun === true,
      alreadyRemoved: true,
      roomIds: [options.roomId],
      assetHashes: [],
      deletedAssetHashes: [],
    }
  }
  const rows = planRows(db, target, options.assetHash)
  const removedAt = (options.now ?? Date.now)()
  if (!Number.isSafeInteger(removedAt) || removedAt < 0) {
    throw new Error('invalid replay removal timestamp')
  }
  const entries = rows.map((row): ReplayRemovalLedgerEntry => ({
    version: 1,
    roomId: row.room_id,
    reason: options.reason,
    removedAt,
    assetHashes: replayAssetHashes(row.custom_cards_json),
  }))
  const roomIds = entries.map((entry) => entry.roomId)
  const assetHashes = [...new Set(
    entries.flatMap((entry) => entry.assetHashes),
  )].sort()
  if (options.dryRun) {
    const referenced = referencedAssetHashes(db, new Set(roomIds))
    return {
      dryRun: true,
      alreadyRemoved: false,
      roomIds,
      assetHashes,
      deletedAssetHashes: assetHashes.filter((hash) => !referenced.has(hash)),
    }
  }
  appendLedger(options.ledgerPath, entries)
  applyEntries(db, entries)
  return {
    dryRun: false,
    alreadyRemoved: false,
    roomIds,
    assetHashes,
    deletedAssetHashes: deleteUnreferencedAssets(
      db,
      options.assetRoot,
      assetHashes,
    ),
  }
}

export function applyReplayRemovalLedger(
  db: Database.Database,
  options: {
    assetRoot: string
    ledgerPath: string
  },
): ReplayRemovalLedgerResult {
  const entries = readLedger(options.ledgerPath)
  if (entries.length === 0) {
    return {
      entries: 0,
      removedRoomIds: [],
      deletedAssetHashes: [],
    }
  }
  const removedRoomIds = applyEntries(db, entries)
  return {
    entries: entries.length,
    removedRoomIds,
    deletedAssetHashes: deleteUnreferencedAssets(
      db,
      options.assetRoot,
      entries.flatMap((entry) => entry.assetHashes),
    ),
  }
}
