/**
 * One-shot cleanup for the persisted rooms table.
 *
 * Marks rooms with `updated_at` older than `--ttl-minutes` (default 30) as
 * `'finished'`, mirroring the in-process cleanup loop's TTL semantics so the
 * server's first restart after this fix doesn't have to wait through the
 * existing TTL window for every zombie row.
 *
 * Usage:
 *   pnpm tsx scripts/cleanup-stale-rooms.ts             # dry run (default)
 *   pnpm tsx scripts/cleanup-stale-rooms.ts --apply
 *   pnpm tsx scripts/cleanup-stale-rooms.ts --apply --ttl-minutes 60
 *   pnpm tsx scripts/cleanup-stale-rooms.ts --apply --hard      # DELETE rather than mark finished
 *
 * Skips fixed dev rooms (dev2/dev3/dev4) and any row already 'finished'.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const DB_PATH = process.env.DB_PATH
  ?? resolve(process.env.DB_DIR ?? './data', 'open-agricola.db')
const FIXED_DEV_IDS = ['dev2', 'dev3', 'dev4']

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const hard = args.includes('--hard')
const ttlIdx = args.indexOf('--ttl-minutes')
const ttlMinutes = ttlIdx >= 0 && args[ttlIdx + 1] ? Number(args[ttlIdx + 1]) : 30
if (!Number.isFinite(ttlMinutes) || ttlMinutes <= 0) {
  console.error(`invalid --ttl-minutes: ${args[ttlIdx + 1]}`)
  process.exit(1)
}

if (!existsSync(DB_PATH)) {
  console.error(`DB file not found: ${DB_PATH}`)
  process.exit(1)
}

const db = new Database(DB_PATH)
const now = Date.now()
const cutoff = now - ttlMinutes * 60 * 1000
const placeholders = FIXED_DEV_IDS.map(() => '?').join(', ')

const candidates = db.prepare(
  `SELECT status, COUNT(*) c FROM rooms WHERE status != 'finished' AND updated_at < ? AND id NOT IN (${placeholders}) GROUP BY status`,
).all(cutoff, ...FIXED_DEV_IDS) as Array<{ status: string; c: number }>

const total = candidates.reduce((sum, row) => sum + row.c, 0)
const breakdown = candidates.map((r) => `${r.status}=${r.c}`).join(', ') || '(none)'

console.log(`DB: ${DB_PATH}`)
console.log(`TTL: ${ttlMinutes} minutes (cutoff = ${new Date(cutoff).toISOString()})`)
console.log(`Stale candidates: ${total} (${breakdown})`)

if (!apply) {
  console.log('\nDry run — pass --apply to perform the cleanup.')
  process.exit(0)
}

if (hard) {
  const res = db.prepare(
    `DELETE FROM rooms WHERE status != 'finished' AND updated_at < ? AND id NOT IN (${placeholders})`,
  ).run(cutoff, ...FIXED_DEV_IDS)
  console.log(`\nDeleted ${res.changes} row(s) (--hard).`)
} else {
  const res = db.prepare(
    `UPDATE rooms SET status = 'finished', updated_at = ? WHERE status != 'finished' AND updated_at < ? AND id NOT IN (${placeholders})`,
  ).run(now, cutoff, ...FIXED_DEV_IDS)
  console.log(`\nMarked ${res.changes} row(s) as finished.`)
}
