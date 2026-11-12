import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertScopedPaths, loadPrereleaseEnvironment, parsePrereleaseTarget, targetFingerprint } from './config'
import { readRuntime } from './runtime'
import { archiveTool, type ToolBudget } from './docker'
import { ownerMachine } from '../release/candidate'

/** Host adapter for owner-scheduled backups; candidate images cannot supply it. */
export function runBackupArchive(args: string[], env: NodeJS.ProcessEnv = process.env): string {
  ownerMachine()
  if (!env.BACKUP_TARGET_CONFIG) throw new Error('Prerelease backup requires trusted owner context')
  const target = parsePrereleaseTarget(JSON.parse(env.BACKUP_TARGET_CONFIG))
  assertScopedPaths(target)
  loadPrereleaseEnvironment(target)
  const record = readRuntime(target), expectedTarget = record.operation?.buildId ?? record.buildId
  if (target.directory !== process.cwd() || target.policyDirectory !== resolve(import.meta.dirname, '../..')
    || env.BACKUP_POLICY_ROOT !== target.policyDirectory || env.BACKUP_ENVIRONMENT !== target.targetId
    || !record.installed || env.SOURCE_BUILD_ID !== record.installed.buildId || env.BACKUP_SOURCE_IMAGE !== record.installed.image
    || env.BACKUP_CAPTURED_IMAGE && env.BACKUP_CAPTURED_IMAGE !== record.installed.image
    || env.BACKUP_TARGET_BUILD_ID !== expectedTarget || env.BACKUP_DATA_GENERATION !== record.generation
    || env.BACKUP_TARGET_FINGERPRINT !== targetFingerprint(target)) throw new Error('Prerelease backup context differs from the installed source')
  const id = env.BACKUP_JOB_ID, deadline = Number(env.BACKUP_DEADLINE_EPOCH_MS)
  if (!id || !/^[a-zA-Z0-9-]+$/.test(id) || !Number.isSafeInteger(deadline) || deadline <= Date.now() || deadline - Date.now() > 1800_000) throw new Error('Invalid backup tool budget')
  const budget: ToolBudget = { runId: id, deadlineEpochMs: deadline }
  const [operation, path, flag] = args, capture = `/backup/.pending-${id}/capture`
  if (operation === 'cleanup-scratch' && path === '/backup' && args.length === 2) return archiveTool(target, 'tools', args, {}, budget)
  if ((operation === 'ledger-export' || operation === 'ledger-merge') && args.length === 2
    && (path === '/backup/replay-removals.latest.json' || operation === 'ledger-merge' && path === `/backup/.pending-${id}/ledger-incoming.json`)) return archiveTool(target, 'capture', args, {}, budget)
  if (operation === 'export-online' && path === capture && args.length === 2) return archiveTool(target, 'capture', args, {}, budget)
  if (operation === 'export' && path === capture && flag === '--applications-stopped' && args.length === 3 && record.mode === 'maintenance') return archiveTool(target, 'capture', args, {}, budget)
  if (operation === 'validate' && path === capture && args.length === 2) return archiveTool(target, 'tools', args, {}, budget)
  throw new Error('Unknown or unscoped prerelease backup operation')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(runBackupArchive(process.argv.slice(2))) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Prerelease backup failed'); process.exitCode = 1 }
}
