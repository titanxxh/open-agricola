import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const sourceBuild = 'a'.repeat(40), image = `sha256:${'b'.repeat(64)}`, container = 'c'.repeat(64)

// Real shell, timeout, tar and hashing; native PG/S3 round trips have separate tests.
function backup(fail = '', stopped = false, duplicate = false) {
  const root = mkdtempSync(join(tmpdir(), 'agricola-native-backup-'))
  try {
    for (const path of ['scripts', 'bin', 'data', 'backups']) mkdirSync(join(root, path))
    for (const path of ['scripts/backup-storage.sh', 'scripts/backup-process.sh', 'scripts/backup-files.mjs']) cpSync(path, join(root, path))
    writeFileSync(join(root, '.env'), 'ACCOUNT_REGISTRATION_POLICY=open\n')
    writeFileSync(join(root, 'data/dependencies.compose.env'), 'DATABASE_URL=test-only\n')
    const priorReport = '{"backupStem":"previous-validated-backup"}\n'
    writeFileSync(join(root, 'backups/observability.latest.json'), priorReport)
    writeFileSync(join(root, 'bin/docker'), `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$PWD/docker-calls"
printf '%s:%s\\n' "$APP_UID" "$APP_GID" >> "$PWD/docker-users"
case "$*" in
  'ps -aq '*) ;;
  *' ps -q app') printf '${container}' ;;
  'ps -q --no-trunc '*) printf '${container}' ;;
  *'{{.State.Running}}'*) printf true ;;
  *'{{.Image}}'*) printf '${image}' ;;
  *'com.docker.compose.project'*) printf backup-fixture ;;
  *'RESOURCE_DELETION_PROTOCOL'*) if [[ "\${BACKUP_TEST_FAILURE:-}" == protocol ]]; then printf 0; else printf 1; fi ;;
  *'process.env.GAME_BUILD_ID'*) printf '${sourceBuild}' ;;
  *'cleanup-scratch /backup'*) ;;
  *'ledger-export '*) printf '{"version":1,"batches":[]}' > backups/replay-removals.latest.json ;;
  *'export-online /backup/'*|*' export /backup/'*)
    [[ "\${BACKUP_TEST_FAILURE:-}" != export ]] || exit 42
    if [[ "\${BACKUP_TEST_FAILURE:-}" == deadline ]]; then sleep 30; fi
    for argument in "$@"; do
      if [[ "$argument" == /backup/.pending-*/capture ]]; then
        capture="$PWD/backups/\${argument#/backup/}"
        mkdir -p "$capture"
        printf native-archive > "$capture/database.dump"
      fi
    done
    ;;
  *'validate /backup/'*)
    [[ "\${BACKUP_TEST_FAILURE:-}" != validate ]] || exit 43
    printf '{"formatVersion":2,"validatedAt":"2026-11-05T00:00:00Z","sourceBuildId":"${sourceBuild}","targetBuildId":"${sourceBuild}"}'
    ;;
  *) echo "Unexpected fixture Docker command: $*" >&2; exit 88 ;;
esac
`, { mode: 0o700 })
    const run = () => spawnSync('/bin/bash', ['scripts/backup-storage.sh', 'manual-test', ...(stopped ? ['--already-stopped'] : [])], {
      cwd: root,
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, BACKUP_TEST_FAILURE: fail,
        SOURCE_BUILD_ID: sourceBuild, MAINTENANCE_LOCK_HELD: '0', BACKUP_JOB_ID: 'fixture-run',
        BACKUP_DEADLINE_EPOCH_MS: String(Date.now() + (fail === 'deadline' ? 2000 : 30_000)) },
      encoding: 'utf8', timeout: 15_000,
    })
    const result = run()
    if (result.error) throw result.error
    const retry = duplicate ? run() : undefined
    if (retry?.error) throw retry.error
    const archivePath = join(root, 'backups/manual-test.tgz'), reportPath = join(root, 'backups/manual-test.manifest.json')
    const configPath = join(root, 'backups/env-manual-test')
    return {
      status: result.status, retryStatus: retry?.status, stderr: result.stderr,
      calls: readFileSync(join(root, 'docker-calls'), 'utf8').trim().split('\n'),
      users: readFileSync(join(root, 'docker-users'), 'utf8').trim().split('\n'),
      archive: existsSync(archivePath) ? readFileSync(archivePath) : undefined,
      mode: existsSync(archivePath) ? statSync(archivePath).mode & 0o777 : undefined,
      report: existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : undefined,
      configuration: existsSync(configPath) ? readFileSync(configPath) : undefined,
      pending: readdirSync(join(root, 'backups')).filter(name => name.startsWith('.pending-')),
      latest: readFileSync(join(root, 'backups/observability.latest.json'), 'utf8'), priorReport,
    }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

it('captures online from the running immutable image without stopping or restarting the application', () => {
  const result = backup()
  expect(result.status, result.stderr).toBe(0)
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
  expect(result.calls.some(call => call.includes('export-online /backup/'))).toBe(true)
  expect(result.calls.some(call => call.includes('--label org.open-agricola.backup.run=fixture-run'))).toBe(true)
  expect(result.calls.some(call => call.includes('app timeout --signal=TERM'))).toBe(true)
  expect(result.report).toMatchObject({ sourceBuildId: sourceBuild, targetBuildId: sourceBuild,
    archiveSizeBytes: result.archive!.length, archiveSha256: createHash('sha256').update(result.archive!).digest('hex'),
    configurationSizeBytes: result.configuration!.length, configurationSha256: createHash('sha256').update(result.configuration!).digest('hex') })
  expect(result.mode).toBe(0o600)
  expect(result.pending).toEqual([])
  expect(new Set(result.users)).toEqual(new Set([`${process.getuid!()}:${process.getgid!()}`]))
})

it.each(['export', 'validate', 'protocol', 'deadline'])('keeps the app and last validated report intact after %s fails', fail => {
  const result = backup(fail)
  expect(result.status).not.toBe(0)
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
  expect(result.archive).toBeUndefined()
  expect(result.report).toBeUndefined()
  expect(result.configuration).toBeUndefined()
  expect(result.pending).toEqual([])
  expect(result.latest).toBe(result.priorReport)
})

it('leaves the maintenance stop owned by the deployment caller', () => {
  const result = backup('', true)
  expect(result.status, result.stderr).toBe(0)
  expect(result.calls.some(call => /(?:stop|start) app$/.test(call))).toBe(false)
  expect(result.calls.some(call => call.includes('export-online'))).toBe(false)
  expect(result.calls.some(call => call.includes(' --applications-stopped'))).toBe(true)
})

it('refuses a duplicate stem without deleting the validated archive', () => {
  const result = backup('', false, true)
  expect(result.status).toBe(0)
  expect(result.retryStatus).not.toBe(0)
  expect(result.archive).toBeDefined()
  expect(result.report.backupStem).toBe('manual-test')
})
