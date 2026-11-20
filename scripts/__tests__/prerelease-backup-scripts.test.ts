import { createHash } from 'node:crypto'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { machineBackupScripts, MACHINE_BACKUP_SCRIPTS } from '../prerelease/backup-scripts'
import type { PrereleaseTarget } from '../prerelease/config'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-pre-backup-scripts-'))
  roots.push(root)
  const directory = join(root, 'open-agricola-prerelease-test'), ops = join(root, 'open-agricola-ops')
  mkdirSync(join(directory, 'data'), { recursive: true })
  mkdirSync(join(ops, 'deploy'), { recursive: true, mode: 0o755 })
  const sha256: Record<string, string> = {}
  for (const name of MACHINE_BACKUP_SCRIPTS) {
    const bytes = Buffer.from(`#!/bin/bash\n# ${name}\n`)
    writeFileSync(join(ops, name), bytes, { mode: 0o700 })
    sha256[name] = createHash('sha256').update(bytes).digest('hex')
  }
  const config = join(directory, 'data/backup-scripts.json')
  const write = (value: unknown, mode = 0o600) => { writeFileSync(config, JSON.stringify(value)); chmodSync(config, mode) }
  write({ format: 1, directory: ops, sha256 })
  const target = { directory } as PrereleaseTarget
  return { target, ops, sha256, write, read: () => machineBackupScripts(target) }
}

it('returns the pinned offsite script path and the verified retention bytes', () => {
  const value = fixture()
  const scripts = value.read()
  expect(scripts.offsite).toBe(join(value.ops, 'backup-offsite.sh'))
  expect(scripts.retention.toString()).toBe('#!/bin/bash\n# deploy/offsite-retention.sh\n')
})

it('refuses any script whose bytes differ from the recorded SHA-256, including the sibling scripts it calls', () => {
  for (const name of MACHINE_BACKUP_SCRIPTS) {
    const value = fixture()
    writeFileSync(join(value.ops, name), '#!/bin/bash\necho changed\n')
    expect(value.read, name).toThrow(`Machine backup script ${name} differs from its recorded SHA-256`)
  }
})

it('refuses scripts or directories that others can write, and symlinked scripts', () => {
  const writable = fixture()
  chmodSync(join(writable.ops, 'backup-offsite.sh'), 0o722)
  expect(writable.read).toThrow('regular owner file')
  const directory = fixture()
  chmodSync(join(directory.ops, 'deploy'), 0o777)
  expect(directory.read).toThrow('owner directories')
  const linked = fixture()
  rmSync(join(linked.ops, 'deploy/offsite-retention.sh'))
  writeFileSync(join(linked.ops, 'real-retention.sh'), '#!/bin/bash\n# deploy/offsite-retention.sh\n')
  symlinkSync(join(linked.ops, 'real-retention.sh'), join(linked.ops, 'deploy/offsite-retention.sh'))
  expect(linked.read).toThrow('regular owner file')
})

it('requires an owner-private config that lists exactly the backup scripts', () => {
  const shared = fixture()
  shared.write({ format: 1, directory: shared.ops, sha256: shared.sha256 }, 0o644)
  expect(shared.read).toThrow('owner-private')
  const missing = fixture()
  const { 'deploy/commit-backup-set.sh': _omitted, ...partial } = missing.sha256
  missing.write({ format: 1, directory: missing.ops, sha256: partial })
  expect(missing.read).toThrow('exactly the backup scripts')
  const relative = fixture()
  relative.write({ format: 1, directory: 'open-agricola-ops', sha256: relative.sha256 })
  expect(relative.read).toThrow('Invalid machine backup script config')
  const absent = fixture()
  rmSync(join(absent.target.directory, 'data/backup-scripts.json'))
  expect(absent.read).toThrow()
})
