import { createHash } from 'node:crypto'
import { lstatSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { assertOwnerPath, type PrereleaseTarget } from './config'

/**
 * The backup and offsite scripts live only on the host, outside the repository and its pinned policy. The owner
 * records their directory and SHA-256 digests in `data/backup-scripts.json`, which is not part of the sealed target,
 * so updating a script never changes the target fingerprint. Every use rechecks ownership and digests.
 */
export const MACHINE_BACKUP_SCRIPTS = ['backup-offsite.sh', 'deploy/commit-backup-set.sh', 'deploy/offsite-retention.sh'] as const

export type MachineBackupScripts = {
  /** Run by path: `backup-offsite.sh` reads its sibling `deploy/` scripts, whose digests were checked with it. */
  offsite: string
  /** The verified bytes, sent to the offsite host over SSH stdin. */
  retention: Buffer
}

export const machineBackupConfigPath = (target: PrereleaseTarget) => join(target.directory, 'data/backup-scripts.json')

const owner = () => process.getuid?.()

function assertPrivateOwnerFile(path: string, label: string): void {
  const info = lstatSync(path)
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== owner() || info.nlink !== 1 || info.mode & 0o022) {
    throw new Error(`${label} must be a regular owner file that only its owner can write`)
  }
}

function assertOwnerDirectory(path: string): void {
  assertOwnerPath(path)
  const info = lstatSync(path)
  if (!info.isDirectory() || info.uid !== owner() || info.mode & 0o022) throw new Error('Machine backup script directories must be owner directories that only their owner can write')
}

export function machineBackupScripts(target: PrereleaseTarget): MachineBackupScripts {
  const configPath = machineBackupConfigPath(target)
  assertOwnerPath(configPath)
  assertPrivateOwnerFile(configPath, 'Machine backup script config')
  if (lstatSync(configPath).mode & 0o077) throw new Error('Machine backup script config must be owner-private')
  const config: unknown = JSON.parse(readFileSync(configPath, 'utf8'))
  if (!config || typeof config !== 'object' || !('format' in config) || config.format !== 1
    || !('directory' in config) || typeof config.directory !== 'string' || !isAbsolute(config.directory) || config.directory.split('/').includes('..')
    || !('sha256' in config) || !config.sha256 || typeof config.sha256 !== 'object') throw new Error('Invalid machine backup script config')
  const directory = config.directory, digests: Record<string, unknown> = { ...config.sha256 }
  if (Object.keys(digests).sort().join(',') !== [...MACHINE_BACKUP_SCRIPTS].sort().join(',')) throw new Error('Machine backup script config must list exactly the backup scripts')
  assertOwnerDirectory(directory)
  assertOwnerDirectory(join(directory, 'deploy'))
  const verified = new Map<string, Buffer>()
  for (const name of MACHINE_BACKUP_SCRIPTS) {
    const expected = digests[name]
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)) throw new Error(`Invalid SHA-256 for machine backup script ${name}`)
    const path = join(directory, name)
    assertPrivateOwnerFile(path, `Machine backup script ${name}`)
    const bytes = readFileSync(path)
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Machine backup script ${name} differs from its recorded SHA-256`)
    verified.set(name, bytes)
  }
  return { offsite: join(directory, 'backup-offsite.sh'), retention: verified.get('deploy/offsite-retention.sh')! }
}
