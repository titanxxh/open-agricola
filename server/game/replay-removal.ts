import {
  closeSync,
  existsSync,
  ftruncateSync,
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
  eraseResult: boolean
}

type ReplayAssetTakedown = {
  hash: string
  reason: ReplayRemovalReason
  removedAt: number
}

type ReplayRemovalLedgerBatch = {
  version: 1
  entries: ReplayRemovalLedgerEntry[]
  assetTakedowns: ReplayAssetTakedown[]
}

type ReplayRemovalLedger = {
  entries: ReplayRemovalLedgerEntry[]
  assetTakedowns: ReplayAssetTakedown[]
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
  eraseResult?: boolean
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
  assetTakedownHashes: string[]
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

const safeReplayAssetHashes = (raw: string | null): string[] | null => {
  try {
    return replayAssetHashes(raw)
  } catch {
    return null
  }
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
): Set<string> | null => {
  const hashes = new Set<string>()
  for (const row of replayRows(db)) {
    if (excludedRoomIds.has(row.room_id)) continue
    const rowHashes = safeReplayAssetHashes(row.custom_cards_json)
    if (rowHashes === null) return null
    rowHashes.forEach((hash) => hashes.add(hash))
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

const validateBatch = (value: unknown): ReplayRemovalLedgerBatch => {
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

const readLedger = (path: string): ReplayRemovalLedger => {
  if (!existsSync(path)) return { entries: [], assetTakedowns: [] }
  const raw = readFileSync(path)
  if (raw.length === 0) return { entries: [], assetTakedowns: [] }
  let committedLength = raw.length
  if (raw[raw.length - 1] !== 0x0a) {
    committedLength = raw.lastIndexOf(0x0a) + 1
    const fd = openSync(path, 'r+')
    try {
      ftruncateSync(fd, committedLength)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
  }
  if (committedLength === 0) return { entries: [], assetTakedowns: [] }
  const lines = raw.subarray(0, committedLength).toString('utf8').split('\n')
  lines.pop()
  const batches = lines.map((line) => {
    try {
      return validateBatch(JSON.parse(line) as unknown)
    } catch {
      throw new Error('invalid replay removal ledger')
    }
  })
  return {
    entries: batches.flatMap((batch) => batch.entries),
    assetTakedowns: batches.flatMap((batch) => batch.assetTakedowns),
  }
}

const appendLedger = (
  path: string,
  batch: ReplayRemovalLedgerBatch,
): void => {
  if (batch.entries.length === 0 && batch.assetTakedowns.length === 0) return
  mkdirSync(dirname(path), { recursive: true })
  const fd = openSync(path, 'a')
  try {
    writeFileSync(fd, `${JSON.stringify(batch)}\n`)
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
    if (!current) continue
    if (current.lifecycle !== 'removed') {
      db.prepare('DELETE FROM rooms WHERE id = ?').run(entry.roomId)
      db.prepare('DELETE FROM game_replay_steps WHERE room_id = ?').run(entry.roomId)
      db.prepare('DELETE FROM game_replays WHERE room_id = ?').run(entry.roomId)
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
    } else if (entry.eraseResult) {
      db.prepare(`
        UPDATE game_contexts
        SET removal_reason = ?,
            updated_at = ?
        WHERE room_id = ?
      `).run(entry.reason, entry.removedAt, entry.roomId)
    }
    if (entry.eraseResult) {
      db.prepare('DELETE FROM game_results WHERE room_id = ?').run(entry.roomId)
    } else {
      db.prepare(`
        UPDATE game_result_players
        SET user_id = NULL,
            display_name = 'Deleted player (seat ' || (player_index + 1) || ')'
        WHERE room_id = ?
      `).run(entry.roomId)
    }
    db.prepare(`
      DELETE FROM game_context_participants
      WHERE room_id = ?
    `).run(entry.roomId)
  }
  return removedRoomIds
})()

const deleteUnreferencedAssets = (
  db: Database.Database,
  assetRoot: string,
  candidates: Iterable<string>,
): string[] => {
  const referenced = referencedAssetHashes(db)
  if (referenced === null) return []
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

const deleteAssets = (
  assetRoot: string,
  candidates: Iterable<string>,
): string[] => {
  const deleted: string[] = []
  for (const hash of [...new Set(candidates)].sort()) {
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
    safeReplayAssetHashes(row.custom_cards_json)?.includes(assetHash) === true)
}

const entryForRow = (
  row: ReplayRow,
  reason: ReplayRemovalReason,
  removedAt: number,
  eraseResult = false,
): ReplayRemovalLedgerEntry => ({
  version: 1,
  roomId: row.room_id,
  reason,
  removedAt,
  assetHashes: replayAssetHashes(row.custom_cards_json),
  eraseResult,
})

const cleanupAssets = (
  db: Database.Database,
  assetRoot: string,
  candidates: Iterable<string>,
  assetTakedowns: Iterable<string>,
): string[] => {
  const forced = deleteAssets(assetRoot, assetTakedowns)
  return [...new Set([
    ...forced,
    ...deleteUnreferencedAssets(db, assetRoot, candidates),
  ])].sort()
}

const priorRoomAssetHashes = (
  ledger: ReplayRemovalLedger,
  roomId: string,
): string[] => [...new Set(ledger.entries
  .filter((entry) => entry.roomId === roomId)
  .flatMap((entry) => entry.assetHashes))].sort()

const validateRemovedAt = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('invalid replay removal timestamp')
  }
  return value
}

const previewDeletedAssets = (
  db: Database.Database,
  candidates: Iterable<string>,
  removedRoomIds: ReadonlySet<string>,
  assetTakedowns: Iterable<string>,
): string[] => {
  const forced = new Set(assetTakedowns)
  const referenced = referencedAssetHashes(db, removedRoomIds)
  if (referenced === null) return [...forced].sort()
  for (const hash of candidates) {
    if (!referenced.has(hash)) forced.add(hash)
  }
  return [...forced].sort()
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
  if (options.eraseResult && options.reason !== 'legal') {
    throw new Error('result erasure requires legal reason')
  }
  if (options.eraseResult && options.assetHash) {
    throw new Error('result erasure cannot be combined with asset removal')
  }
  const target = loadReplay(db, options.roomId)
  if (!target) throw new Error('replay not found')
  const ledger = readLedger(options.ledgerPath)
  if (target.lifecycle === 'removed') {
    if (options.assetHash) {
      if (!ASSET_HASH.test(options.assetHash)) {
        throw new Error('invalid replay asset hash')
      }
      if (!priorRoomAssetHashes(ledger, options.roomId).includes(options.assetHash)) {
        throw new Error('replay does not reference asset')
      }
      const rows = replayRows(db).filter((row) =>
        safeReplayAssetHashes(row.custom_cards_json)?.includes(options.assetHash!) === true)
      const alreadyTakenDown = ledger.assetTakedowns.some(
        (rule) => rule.hash === options.assetHash,
      )
      if (rows.length === 0 && alreadyTakenDown) {
        return {
          dryRun: options.dryRun === true,
          alreadyRemoved: true,
          roomIds: [options.roomId],
          assetHashes: [options.assetHash],
          deletedAssetHashes: options.dryRun
            ? [options.assetHash]
            : deleteAssets(options.assetRoot, [options.assetHash]),
        }
      }
      const removedAt = validateRemovedAt((options.now ?? Date.now)())
      const entries = rows.map((row) => entryForRow(
        row,
        options.reason,
        removedAt,
      ))
      const assetTakedowns: ReplayAssetTakedown[] = alreadyTakenDown
        ? []
        : [{ hash: options.assetHash, reason: options.reason, removedAt }]
      const roomIds = [...new Set([
        options.roomId,
        ...entries.map((entry) => entry.roomId),
      ])]
      const assetHashes = [...new Set([
        options.assetHash,
        ...entries.flatMap((entry) => entry.assetHashes),
      ])].sort()
      if (options.dryRun) {
        return {
          dryRun: true,
          alreadyRemoved: false,
          roomIds,
          assetHashes,
          deletedAssetHashes: previewDeletedAssets(
            db,
            assetHashes,
            new Set(entries.map((entry) => entry.roomId)),
            [options.assetHash],
          ),
        }
      }
      appendLedger(options.ledgerPath, {
        version: 1,
        entries,
        assetTakedowns,
      })
      applyEntries(db, entries)
      return {
        dryRun: false,
        alreadyRemoved: false,
        roomIds,
        assetHashes,
        deletedAssetHashes: cleanupAssets(
          db,
          options.assetRoot,
          assetHashes,
          [options.assetHash],
        ),
      }
    }
    if (options.eraseResult) {
      const durableEntry = ledger.entries.find(
        (entry) => entry.roomId === options.roomId && entry.eraseResult,
      )
      if (durableEntry) {
        if (!options.dryRun) applyEntries(db, [durableEntry])
        return {
          dryRun: options.dryRun === true,
          alreadyRemoved: true,
          roomIds: [options.roomId],
          assetHashes: durableEntry.assetHashes,
          deletedAssetHashes: options.dryRun
            ? []
            : cleanupAssets(
                db,
                options.assetRoot,
                durableEntry.assetHashes,
                [],
              ),
        }
      }
      const removedAt = validateRemovedAt((options.now ?? Date.now)())
      const assetHashes = priorRoomAssetHashes(ledger, options.roomId)
      const entry: ReplayRemovalLedgerEntry = {
        version: 1,
        roomId: options.roomId,
        reason: options.reason,
        removedAt,
        assetHashes,
        eraseResult: true,
      }
      if (!options.dryRun) {
        appendLedger(options.ledgerPath, {
          version: 1,
          entries: [entry],
          assetTakedowns: [],
        })
        applyEntries(db, [entry])
      }
      return {
        dryRun: options.dryRun === true,
        alreadyRemoved: false,
        roomIds: [options.roomId],
        assetHashes,
        deletedAssetHashes: options.dryRun
          ? previewDeletedAssets(db, assetHashes, new Set(), [])
          : cleanupAssets(db, options.assetRoot, assetHashes, []),
      }
    }
    return {
      dryRun: options.dryRun === true,
      alreadyRemoved: true,
      roomIds: [options.roomId],
      assetHashes: [],
      deletedAssetHashes: [],
    }
  }
  const rows = planRows(db, target, options.assetHash)
  const removedAt = validateRemovedAt((options.now ?? Date.now)())
  const entries = rows.map((row) => entryForRow(
    row,
    options.reason,
    removedAt,
    options.eraseResult === true,
  ))
  const assetTakedowns: ReplayAssetTakedown[] = options.assetHash
    && !ledger.assetTakedowns.some((rule) => rule.hash === options.assetHash)
    ? [{ hash: options.assetHash, reason: options.reason, removedAt }]
    : []
  const roomIds = entries.map((entry) => entry.roomId)
  const assetHashes = [...new Set(
    entries.flatMap((entry) => entry.assetHashes),
  )].sort()
  if (options.dryRun) {
    return {
      dryRun: true,
      alreadyRemoved: false,
      roomIds,
      assetHashes,
      deletedAssetHashes: previewDeletedAssets(
        db,
        assetHashes,
        new Set(roomIds),
        options.assetHash ? [options.assetHash] : [],
      ),
    }
  }
  appendLedger(options.ledgerPath, {
    version: 1,
    entries,
    assetTakedowns,
  })
  applyEntries(db, entries)
  return {
    dryRun: false,
    alreadyRemoved: false,
    roomIds,
    assetHashes,
    deletedAssetHashes: cleanupAssets(
      db,
      options.assetRoot,
      assetHashes,
      options.assetHash ? [options.assetHash] : [],
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
  const ledger = readLedger(options.ledgerPath)
  const assetTakedownHashes = [...new Set(
    ledger.assetTakedowns.map((rule) => rule.hash),
  )].sort()
  if (ledger.entries.length === 0 && ledger.assetTakedowns.length === 0) {
    return {
      entries: 0,
      removedRoomIds: [],
      deletedAssetHashes: [],
      assetTakedownHashes: [],
    }
  }
  const entries = [...ledger.entries]
  const removedRoomIds = applyEntries(db, entries)
  const recordedRoomIds = new Set(entries.map((entry) => entry.roomId))
  const discoveredEntries = replayRows(db).flatMap((row) => {
    if (recordedRoomIds.has(row.room_id)) return []
    const hashes = safeReplayAssetHashes(row.custom_cards_json)
    if (hashes === null) return []
    const rule = ledger.assetTakedowns.find(({ hash }) => hashes.includes(hash))
    return rule ? [entryForRow(row, rule.reason, rule.removedAt)] : []
  })
  if (discoveredEntries.length > 0) {
    appendLedger(options.ledgerPath, {
      version: 1,
      entries: discoveredEntries,
      assetTakedowns: [],
    })
    entries.push(...discoveredEntries)
    removedRoomIds.push(...applyEntries(db, discoveredEntries))
  }
  return {
    entries: entries.length,
    removedRoomIds,
    deletedAssetHashes: cleanupAssets(
      db,
      options.assetRoot,
      entries.flatMap((entry) => entry.assetHashes),
      assetTakedownHashes,
    ),
    assetTakedownHashes,
  }
}
