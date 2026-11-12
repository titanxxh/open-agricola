import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'

const directories: string[] = []
const commitScript = resolve('deploy/commit-backup-set.sh')
const retentionScript = resolve('deploy/offsite-retention.sh')
const filesScript = resolve('scripts/backup-files.mjs')
const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex')

function temporary() {
  const root = mkdtempSync(join(tmpdir(), 'agricola-backup-files-'))
  directories.push(root)
  return root
}

afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})

function run(script: string, args: string[], env: NodeJS.ProcessEnv = {}) {
  const result = spawnSync('/bin/bash', [script, ...args], {
    env: { ...process.env, ...env }, encoding: 'utf8', timeout: 10_000,
  })
  if (result.error) throw result.error
  return result
}

function incoming(root: string, stem = 'daily-test', content = 'archive bytes') {
  const stage = join(root, '.incoming-test')
  mkdirSync(stage)
  const files = [`${stem}.tgz`, `env-${stem}`, `${stem}.manifest.json`]
  writeFileSync(join(stage, files[0]), content)
  writeFileSync(join(stage, files[1]), 'private configuration')
  writeFileSync(join(stage, files[2]), JSON.stringify({ formatVersion: 2, backupStem: stem, validatedAt: '2026-11-05T00:00:00Z' }))
  writeFileSync(join(stage, 'checksums.tsv'), files.map(name => {
    const bytes = readFileSync(join(stage, name))
    return `${digest(bytes)}\t${bytes.length}\t${name}\n`
  }).join(''))
  return { stage, stem, files }
}

it('rejects an expired remote commit and removes its private transfer without publishing', () => {
  const root = temporary(), transfer = incoming(root)
  const result = run(commitScript, [root, '.incoming-test', String(Date.now() - 1)])
  expect(result.status).not.toBe(0)
  expect(existsSync(join(root, `${transfer.stem}.manifest.json`))).toBe(false)
  expect(existsSync(transfer.stage)).toBe(false)
})

it('checks the absolute deadline again after hashing before publishing a manifest', () => {
  const root = temporary(), transfer = incoming(root), bin = join(root, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'sha256sum'), `#!/bin/bash
if [[ ! -f '${root}/hash-started' ]]; then touch '${root}/hash-started'; sleep 1; fi
exec /usr/bin/sha256sum "$@"
`, { mode: 0o700 })
  const result = run(commitScript, [root, '.incoming-test', String(Date.now() + 300)], {
    PATH: `${bin}:${process.env.PATH}`,
  })
  expect(result.status).not.toBe(0)
  expect(existsSync(join(root, `${transfer.stem}.manifest.json`))).toBe(false)
  expect(existsSync(transfer.stage)).toBe(false)
})

it('bounds the actual remote command after its local SSH client has been terminated', async () => {
  const root = temporary(), bin = join(root, 'bin'), remote = join(root, 'remote')
  for (const directory of [bin, remote, join(root, 'scripts')]) mkdirSync(directory)
  cpSync(resolve('backup-offsite.sh'), join(root, 'backup-offsite.sh'))
  cpSync(resolve('scripts/backup-process.sh'), join(root, 'scripts/backup-process.sh'))
  writeFileSync(join(remote, 'replay-removals.latest.json'), '{"version":1,"batches":[]}')
  writeFileSync(join(bin, 'ssh'), `#!/bin/bash
while [[ "$1" == -o ]]; do shift 2; done
shift
input=$(mktemp)
/usr/bin/cat > "$input"
# A remote SSH command is outside the local client's process group.
setsid /bin/bash -c "$*" < "$input" &
child=$!
wait "$child"
status=$?
rm -f -- "$input"
exit "$status"
`, { mode: 0o700 })
  writeFileSync(join(bin, 'cat'), `#!/bin/bash
sleep 2
printf survived > '${root}/remote-exceeded-deadline'
exec /usr/bin/cat "$@"
`, { mode: 0o700 })
  writeFileSync(join(bin, 'docker'), '#!/bin/bash\nexit 0\n', { mode: 0o700 })
  const result = run(join(root, 'backup-offsite.sh'), ['ledger-only'], {
    PATH: `${bin}:${process.env.PATH}`, OFFSITE_BACKUP_TARGET: 'fixture', OFFSITE_BACKUP_REMOTE_DIR: remote,
    BACKUP_JOB_ID: 'remote-deadline-test', BACKUP_DEADLINE_EPOCH_MS: String(Date.now() + 600),
  })
  expect(result.status).not.toBe(0)
  await new Promise(settle => setTimeout(settle, 2100))
  expect(existsSync(join(root, 'remote-exceeded-deadline'))).toBe(false)
})

it('removes a failed hash transfer while preserving an already committed backup', () => {
  const root = temporary(), transfer = incoming(root)
  writeFileSync(join(root, 'daily-previous.tgz'), 'previous valid bytes')
  writeFileSync(join(root, 'daily-previous.manifest.json'), 'previous valid report')
  writeFileSync(join(root, 'env-daily-previous'), 'previous private configuration')
  writeFileSync(join(transfer.stage, `${transfer.stem}.tgz`), 'damaged bytes')
  const result = run(commitScript, [root, '.incoming-test', String(Date.now() + 30_000)])
  expect(result.status).not.toBe(0)
  expect(existsSync(transfer.stage)).toBe(false)
  expect(readFileSync(join(root, 'daily-previous.tgz'), 'utf8')).toBe('previous valid bytes')
  expect(readFileSync(join(root, 'daily-previous.manifest.json'), 'utf8')).toBe('previous valid report')
  expect(existsSync(join(root, `${transfer.stem}.manifest.json`))).toBe(false)
})

it('commits complete triplets and accepts an identical retry without overwriting existing bytes', () => {
  const root = temporary(), transfer = incoming(root)
  const first = run(commitScript, [root, '.incoming-test', String(Date.now() + 30_000)])
  expect(first.status, first.stderr).toBe(0)
  const before = transfer.files.map(name => readFileSync(join(root, name)))
  incoming(root)
  const second = run(commitScript, [root, '.incoming-test', String(Date.now() + 30_000)])
  expect(second.status, second.stderr).toBe(0)
  expect(transfer.files.map(name => readFileSync(join(root, name)))).toEqual(before)
  expect(existsSync(transfer.stage)).toBe(false)
})

it('refuses conflicting remote contents and leaves the original committed set intact', () => {
  const root = temporary(), transfer = incoming(root)
  for (const name of transfer.files) cpSync(join(transfer.stage, name), join(root, name))
  rmSync(transfer.stage, { recursive: true })
  const before = transfer.files.map(name => readFileSync(join(root, name)))
  incoming(root, transfer.stem, 'different archive bytes')
  const result = run(commitScript, [root, '.incoming-test', String(Date.now() + 30_000)])
  expect(result.status).not.toBe(0)
  expect(transfer.files.map(name => readFileSync(join(root, name)))).toEqual(before)
  expect(existsSync(transfer.stage)).toBe(false)
})

it('rejects a transfer that lacks one member of the backup triplet', () => {
  const root = temporary(), transfer = incoming(root)
  rmSync(join(transfer.stage, `env-${transfer.stem}`))
  const result = run(commitScript, [root, '.incoming-test', String(Date.now() + 30_000)])
  expect(result.status).not.toBe(0)
  expect(existsSync(join(root, `${transfer.stem}.manifest.json`))).toBe(false)
  expect(existsSync(transfer.stage)).toBe(false)
})

it('expires nested archive bytes by their original age even inside a new incoming directory', () => {
  const root = temporary(), transfer = incoming(root)
  const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
  utimesSync(join(transfer.stage, `${transfer.stem}.tgz`), old, old)
  const fresh = join(root, '.incoming-current')
  mkdirSync(fresh)
  writeFileSync(join(fresh, 'daily-current.tgz'), 'new transfer')
  writeFileSync(join(root, 'replay-removals.latest.json'), 'independent deletion facts')
  utimesSync(join(root, 'replay-removals.latest.json'), old, old)
  const result = run(retentionScript, [root])
  expect(result.status, result.stderr).toBe(0)
  expect(existsSync(transfer.stage)).toBe(false)
  expect(existsSync(fresh)).toBe(true)
  expect(readFileSync(join(root, 'replay-removals.latest.json'), 'utf8')).toBe('independent deletion facts')
})

it('seals real archive/config bytes and lists only committed complete sets', () => {
  const root = temporary(), pending = join(root, '.pending-test')
  mkdirSync(pending)
  writeFileSync(join(pending, 'database.dump'), 'database snapshot')
  const tar = spawnSync('tar', ['-czf', join(pending, 'archive.tgz'), '-C', pending, 'database.dump'])
  expect(tar.status).toBe(0)
  writeFileSync(join(pending, 'env'), 'private configuration')
  writeFileSync(join(pending, 'report.json'), JSON.stringify({ formatVersion: 2, validatedAt: '2026-11-05T00:00:00Z' }))
  const seal = spawnSync(process.execPath, [filesScript, 'seal', pending, 'manual-test'], { encoding: 'utf8' })
  expect(seal.status, seal.stderr).toBe(0)
  cpSync(join(pending, 'archive.tgz'), join(root, 'manual-test.tgz'))
  cpSync(join(pending, 'env'), join(root, 'env-manual-test'))
  cpSync(join(pending, 'manifest.json'), join(root, 'manual-test.manifest.json'))
  writeFileSync(join(root, 'daily-incomplete.tgz'), 'unvalidated partial archive')
  const list = spawnSync(process.execPath, [filesScript, 'list', root, join(root, 'files.nul'), join(root, 'checksums.tsv')], { encoding: 'utf8' })
  expect(list.status, list.stderr).toBe(0)
  expect(readFileSync(join(root, 'files.nul'), 'utf8').split('\0').filter(Boolean).sort()).toEqual([
    'env-manual-test', 'manual-test.manifest.json', 'manual-test.tgz',
  ])
  expect(readdirSync(root)).toContain('daily-incomplete.tgz')
})

it('expires restore bytes by the sealed capture clock while preserving fresh retries and other scopes', () => {
  const root = temporary(), source = temporary(), fingerprint = 'a'.repeat(64)
  const old = new Date(Date.now() - 8 * 86400_000), fresh = new Date(Date.now() - 86400_000)
  const stage = (directory: string, suffix: string, capturedAt: Date, owner = fingerprint) => {
    const id = `db4d6c82-676f-4dcc-a570-52377b3b32f${suffix}`, path = join(directory, `restore-${id}`)
    mkdirSync(path)
    writeFileSync(join(path, 'database.dump'), 'private restore bytes')
    writeFileSync(`${path}.retention.json`, JSON.stringify({ formatVersion: 1, operationId: id,
      dataGeneration: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', targetFingerprint: owner,
      archiveSha256: 'b'.repeat(64), createdAt: capturedAt.toISOString() }))
    // Native restore creates and deletes temporary files, refreshing directory mtime.
    writeFileSync(join(path, 'restore-temporary.list'), 'temporary')
    rmSync(join(path, 'restore-temporary.list'))
    return path
  }
  const expired = stage(root, '5', old), retry = stage(root, '6', fresh)
  const foreign = stage(root, '7', old, 'c'.repeat(64)), original = stage(source, '5', old)
  const unrelated = join(root, 'restore-unrelated'); mkdirSync(unrelated); writeFileSync(join(unrelated, 'keep'), 'unrelated bytes')
  writeFileSync(join(root, 'replay-removals.latest.json'), 'independent erasure facts')
  utimesSync(join(root, 'replay-removals.latest.json'), old, old)
  const result = spawnSync(process.execPath, [filesScript, 'prune', root, '7', '1000000'], { encoding: 'utf8', env: {
    ...process.env, BACKUP_RETENTION_DAYS: '7', BACKUP_ENVIRONMENT: 'prerelease-test', BACKUP_TARGET_FINGERPRINT: fingerprint,
  } })
  expect(result.status, result.stderr).toBe(0)
  expect(existsSync(expired)).toBe(false)
  expect(existsSync(`${expired}.retention.json`)).toBe(false)
  for (const path of [retry, foreign, original]) expect(readFileSync(join(path, 'database.dump'), 'utf8')).toBe('private restore bytes')
  expect(readFileSync(join(unrelated, 'keep'), 'utf8')).toBe('unrelated bytes')
  expect(readFileSync(join(root, 'replay-removals.latest.json'), 'utf8')).toBe('independent erasure facts')
})

it('writes a new report only in a private parent with mode 0600', () => {
  const root = temporary(), report = join(root, 'report.json')
  const result = spawnSync(process.execPath, [filesScript, 'write-report', report], { input: 'inert validation bytes', encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  expect(readFileSync(report, 'utf8')).toBe('inert validation bytes')
  expect(statSync(report).mode & 0o777).toBe(0o600)
})

it.each(['file-link', 'parent-link', 'writable-parent'])('refuses a %s report output without changing another file', kind => {
  const root = temporary(), parent = join(root, 'private'), sentinel = join(root, 'inert-sentinel')
  mkdirSync(parent, { mode: 0o700 }); writeFileSync(sentinel, 'inert owner fixture bytes')
  let report = join(parent, 'report.json')
  if (kind === 'file-link') symlinkSync(sentinel, report)
  if (kind === 'parent-link') { symlinkSync(parent, join(root, 'alias')); report = join(root, 'alias', 'report.json') }
  if (kind === 'writable-parent') chmodSync(parent, 0o755)
  const result = spawnSync(process.execPath, [filesScript, 'write-report', report], { input: 'inert validation bytes', encoding: 'utf8' })
  expect(result.status).not.toBe(0)
  expect(readFileSync(sentinel, 'utf8')).toBe('inert owner fixture bytes')
})
