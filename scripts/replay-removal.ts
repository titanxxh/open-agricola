import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb } from '../server/db.ts'
import {
  applyReplayRemovalLedger,
  removeReplay,
  type ReplayRemovalReason,
} from '../server/game/replay-removal.ts'

export type ReplayRemovalCliArgs =
  | {
      command: 'remove'
      roomId: string
      reason: ReplayRemovalReason
      assetHash?: string
      eraseResult?: true
      dryRun: boolean
    }
  | {
      command: 'apply-ledger'
    }

const ROOM_ID = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
const ASSET_HASH = /^[a-f0-9]{64}$/
const REASONS = new Set<ReplayRemovalReason>([
  'removed',
  'moderation',
  'legal',
])

export function parseReplayRemovalArgs(args: string[]): ReplayRemovalCliArgs {
  if (args[0] === 'apply-ledger') {
    if (args.length !== 1) throw new Error('unexpected argument')
    return { command: 'apply-ledger' }
  }
  if (args[0] !== 'remove') throw new Error('expected remove or apply-ledger')
  let roomId: string | undefined
  let reason: ReplayRemovalReason | undefined
  let assetHash: string | undefined
  let eraseResult = false
  let dryRun = false
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--dry-run') {
      if (dryRun) throw new Error('duplicate --dry-run')
      dryRun = true
      continue
    }
    if (arg === '--erase-result') {
      if (eraseResult) throw new Error('duplicate --erase-result')
      eraseResult = true
      continue
    }
    if (
      arg !== '--room-id'
      && arg !== '--reason'
      && arg !== '--asset-hash'
    ) {
      throw new Error(`unexpected argument: ${arg ?? ''}`)
    }
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${arg}`)
    index += 1
    if (arg === '--room-id') {
      if (roomId !== undefined) throw new Error('duplicate --room-id')
      roomId = value
    } else if (arg === '--reason') {
      if (reason !== undefined) throw new Error('duplicate --reason')
      reason = value as ReplayRemovalReason
    } else {
      if (assetHash !== undefined) throw new Error('duplicate --asset-hash')
      assetHash = value
    }
  }
  if (!roomId) throw new Error('missing --room-id')
  if (roomId.length > 128 || !ROOM_ID.test(roomId)) {
    throw new Error('invalid room id')
  }
  if (!reason) throw new Error('missing --reason')
  if (!REASONS.has(reason)) throw new Error('invalid replay removal reason')
  if (assetHash !== undefined && !ASSET_HASH.test(assetHash)) {
    throw new Error('invalid replay asset hash')
  }
  if (eraseResult && reason !== 'legal') {
    throw new Error('--erase-result requires legal reason')
  }
  if (eraseResult && assetHash !== undefined) {
    throw new Error('--erase-result cannot be combined with --asset-hash')
  }
  return {
    command: 'remove',
    roomId,
    reason,
    ...(assetHash === undefined ? {} : { assetHash }),
    ...(eraseResult ? { eraseResult: true as const } : {}),
    dryRun,
  }
}

export function runReplayRemovalCli(
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
): unknown {
  const parsed = parseReplayRemovalArgs(args)
  const assetRoot = env.REPLAY_ASSET_ROOT
    ?? join(process.cwd(), 'data', 'replay-assets')
  const ledgerPath = env.REPLAY_REMOVAL_LEDGER_PATH
    ?? join(process.cwd(), 'data', 'replay-removals.jsonl')
  if (parsed.command === 'apply-ledger') {
    return applyReplayRemovalLedger(getDb(), { assetRoot, ledgerPath })
  }
  return removeReplay(getDb(), {
    roomId: parsed.roomId,
    reason: parsed.reason,
    assetRoot,
    ledgerPath,
    ...(parsed.assetHash === undefined ? {} : { assetHash: parsed.assetHash }),
    ...(parsed.eraseResult ? { eraseResult: true } : {}),
    dryRun: parsed.dryRun,
  })
}

if (
  process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(runReplayRemovalCli(process.argv.slice(2))))
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'replay removal failed')
    process.exitCode = 1
  }
}
