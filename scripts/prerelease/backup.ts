import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { command } from './docker'
import type { PrereleaseTarget } from './config'
import { targetFingerprint } from './config'

export const fileHash = (path: string): string => {
  const value = command('sha256sum', [path]).split(/\s/)[0]
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Backup hashing failed')
  return value
}

/** Verifies paired bytes and source scope before extraction or database/object writes. */
export function readPairedPrereleaseBackup(target: PrereleaseTarget, stem: string, generationId: string) {
  if (!/^(daily|pre|manual)-[a-zA-Z0-9._-]+$/.test(stem)) throw new Error('Invalid recovery-point name')
  const root = join(target.directory, 'backups')
  const value: unknown = JSON.parse(readFileSync(join(root, `${stem}.manifest.json`), 'utf8'))
  if (!value || typeof value !== 'object' || !('formatVersion' in value) || value.formatVersion !== 2
    || !('backupStem' in value) || value.backupStem !== stem || !('environment' in value) || value.environment !== target.targetId
    || !('retentionDays' in value) || value.retentionDays !== 7 || !('dataGeneration' in value) || value.dataGeneration !== generationId
    || !('targetFingerprint' in value) || value.targetFingerprint !== targetFingerprint(target)
    || !('createdAt' in value) || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || Date.now() - Date.parse(value.createdAt) >= 7 * 86400_000 || Date.parse(value.createdAt) > Date.now()
    || !('validatedAt' in value) || typeof value.validatedAt !== 'string' || !Number.isFinite(Date.parse(value.validatedAt))
    || !('sourceBuildId' in value) || typeof value.sourceBuildId !== 'string' || !/^[a-f0-9]{40}$/.test(value.sourceBuildId)
    || !('targetBuildId' in value) || typeof value.targetBuildId !== 'string' || !/^[a-f0-9]{40}$/.test(value.targetBuildId)
    || !('archiveSizeBytes' in value) || value.archiveSizeBytes !== statSync(join(root, `${stem}.tgz`)).size
    || !('configurationSizeBytes' in value) || value.configurationSizeBytes !== statSync(join(root, `env-${stem}`)).size
    || !('archiveSha256' in value) || value.archiveSha256 !== fileHash(join(root, `${stem}.tgz`))
    || !('configurationSha256' in value) || value.configurationSha256 !== fileHash(join(root, `env-${stem}`))) throw new Error('Recovery point is incomplete, altered, expired or belongs to another environment/generation')
  return { root, archive: join(root, `${stem}.tgz`), sourceBuildId: value.sourceBuildId, targetBuildId: value.targetBuildId,
    manifest: value, archiveSha256: value.archiveSha256 }
}

export function extractPairedPrereleaseBackup(target: PrereleaseTarget, archive: string, expectedHash: string, directory: string): void {
  if (fileHash(archive) !== expectedHash || existsSync(directory)) throw new Error('Restore staging must be fresh and match the selected archive')
  const names = command('tar', ['-tzf', archive]).split('\n')
  if (names.length > 100_000 || names.some(name => !/^[a-zA-Z0-9_./-]+$/.test(name) || name.startsWith('/') || name.split('/').includes('..'))) throw new Error('Archive contains an escaping path')
  const listing = command('tar', ['-tvzf', archive]).split('\n')
  let expanded = 0
  for (const line of listing) {
    const columns = line.split(/\s+/)
    if (!['d', '-'].includes(line[0]) || !/^\d+$/.test(columns[2] ?? '')) throw new Error('Archive contains links or unsupported entries')
    expanded += Number(columns[2])
  }
  if (expanded > target.budgets.diskMiB * 1024 * 1024) throw new Error('Expanded restore exceeds the prerelease storage budget')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  command('tar', ['-xzf', archive, '--no-same-owner', '--no-same-permissions', '-C', directory], { timeout: 30 * 60 * 1000 })
}
