import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// Exercise the actual maintenance shell and archive files, replacing only Docker.
// Native PG/S3 export and restoration are covered by storage-archive.test.ts.
function backup(fail?: 'export' | 'validate', stopped = false) {
  const root = mkdtempSync(join(tmpdir(), 'agricola-native-backup-'))
  try {
    mkdirSync(join(root, 'scripts'))
    mkdirSync(join(root, 'bin'))
    mkdirSync(join(root, 'data'))
    cpSync('scripts/backup-storage.sh', join(root, 'scripts/backup-storage.sh'))
    writeFileSync(join(root, '.env'), 'ACCOUNT_REGISTRATION_POLICY=open\n')
    writeFileSync(join(root, 'data/dependencies.compose.env'), 'DATABASE_URL=test-only\n')
    writeFileSync(join(root, 'bin/docker'), `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$PWD/docker-calls"
printf '%s:%s\\n' "$APP_UID" "$APP_GID" >> "$PWD/docker-users"
case "$*" in
  *'exec -T app node -p'*) printf source-build ;;
  *'ledger-export'*) printf '{"version":1,"batches":[]}' > backups/replay-removals.latest.json ;;
  *'export /backup/'*)
    [[ "\${BACKUP_TEST_FAILURE:-}" != export ]] || exit 42
    mkdir -p backups/.capture-manual-test
    printf native-archive > backups/.capture-manual-test/database.dump
    ;;
  *'validate /backup/'*)
    [[ "\${BACKUP_TEST_FAILURE:-}" != validate ]] || exit 43
    printf '{"sourceBuildId":"source-build","targetBuildId":"target-build"}'
    ;;
esac
`, { mode: 0o700 })
    const result = spawnSync('/bin/bash', ['scripts/backup-storage.sh', 'manual-test', ...(stopped ? ['--already-stopped'] : [])], {
      cwd: root,
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, BACKUP_TEST_FAILURE: fail ?? '', SOURCE_BUILD_ID: 'source-build', MAINTENANCE_LOCK_HELD: '0' },
      encoding: 'utf8',
    })
    if (result.error) throw result.error
    const calls = readFileSync(join(root, 'docker-calls'), 'utf8').trim().split('\n')
    const archivePath = join(root, 'backups/manual-test.tgz')
    const reportPath = join(root, 'backups/manual-test.manifest.json')
    return {
      status: result.status,
      stderr: result.stderr,
      calls,
      users: readFileSync(join(root, 'docker-users'), 'utf8').trim().split('\n'),
      archive: existsSync(archivePath) ? readFileSync(archivePath) : undefined,
      mode: existsSync(archivePath) ? statSync(archivePath).mode & 0o777 : undefined,
      report: existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : undefined,
      config: existsSync(join(root, 'backups/env-manual-test')),
      capture: existsSync(join(root, 'backups/.capture-manual-test')),
      ledger: existsSync(join(root, 'backups/replay-removals.latest.json')),
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

it('resumes the app before isolated validation and binds its archive to the report', () => {
  const result = backup()
  expect(result.status, result.stderr).toBe(0)
  const at = (text: string) => result.calls.findIndex(call => call.includes(text))
  expect(at('stop app')).toBeLessThan(at('export /backup/'))
  expect(at('start app')).toBeGreaterThan(at('export /backup/'))
  expect(at('validate /backup/')).toBeGreaterThan(at('start app'))
  expect(result.report).toMatchObject({ sourceBuildId: 'source-build', targetBuildId: 'target-build', archiveSizeBytes: result.archive!.length, archiveSha256: createHash('sha256').update(result.archive!).digest('hex') })
  expect(result.mode).toBe(0o600)
  expect(result.config).toBe(true)
  expect(result.capture).toBe(false)
  expect(result.ledger).toBe(true)
  expect(new Set(result.users)).toEqual(new Set([`${process.getuid!()}:${process.getgid!()}`]))
})

it.each(['export', 'validate'] as const)('resumes the app and removes an unvalidated archive after %s fails', fail => {
  const result = backup(fail)
  expect(result.status).not.toBe(0)
  expect(result.calls.filter(call => call.endsWith('start app'))).toHaveLength(1)
  expect(result.archive).toBeUndefined()
  expect(result.report).toBeUndefined()
  expect(result.config).toBe(false)
  expect(result.capture).toBe(false)
  expect(result.ledger).toBe(true)
})

it('leaves the maintenance stop owned by the deployment caller', () => {
  const result = backup(undefined, true)
  expect(result.status, result.stderr).toBe(0)
  expect(result.calls.some(call => /(?:stop|start) app$/.test(call))).toBe(false)
})
