import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const sourceBuild = 'a'.repeat(40), image = `sha256:${'b'.repeat(64)}`, container = 'c'.repeat(64)

// Real shell, timeout, tar and hashing; native PG/S3 round trips have separate tests.
function backup(fail = '', stopped = false, duplicate = false) {
  const root = mkdtempSync(join(tmpdir(), 'agricola-native-backup-'))
  const offsite = fail.startsWith('offsite-')
  try {
    for (const path of ['scripts', 'bin', 'data', 'backups']) mkdirSync(join(root, path))
    for (const path of ['scripts/backup-storage.sh', 'scripts/backup-process.sh', 'scripts/backup-files.mjs']) cpSync(path, join(root, path))
    writeFileSync(join(root, '.env'), 'ACCOUNT_REGISTRATION_POLICY=open\n')
    writeFileSync(join(root, 'data/dependencies.compose.env'), 'DATABASE_URL=test-only\n')
    const priorReport = '{"backupStem":"previous-validated-backup"}\n'
    writeFileSync(join(root, 'backups/observability.latest.json'), priorReport)
    if (fail.endsWith('date-width')) writeFileSync(join(root, 'bin/date'), `#!/bin/bash
if [[ "$1" == '+%s%3N' ]]; then exec /usr/bin/date +%s%N; fi
exec /usr/bin/date "$@"
`, { mode: 0o700 })
    const remote = join(root, 'remote')
    if (offsite) {
      mkdirSync(remote)
      mkdirSync(join(root, 'deploy'))
      cpSync('backup-offsite.sh', join(root, 'backup-offsite.sh'))
      for (const path of ['deploy/offsite-retention.sh', 'deploy/commit-backup-set.sh']) cpSync(path, join(root, path))
      writeFileSync(join(remote, 'daily-old.tgz'), 'expired archive')
      const expired = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      utimesSync(join(remote, 'daily-old.tgz'), expired, expired)
      writeFileSync(join(root, 'bin/ssh'), `#!/bin/bash
while [[ "$1" == -o ]]; do shift 2; done
shift
if [[ "\${BACKUP_TEST_FAILURE:-}" == offsite-mkdir && "$*" == *'/.incoming-'* && "$*" == *'bash -s'* ]]; then
  cat >/dev/null
  exit 73
fi
exec /bin/bash -c "$*"
`, { mode: 0o700 })
      writeFileSync(join(root, 'bin/rsync'), `#!/bin/bash
args=("$@")
if [[ "$*" == *'--from0'* ]]; then
  if [[ "\${BACKUP_TEST_FAILURE:-}" == offsite-timeout ]]; then sleep 30; exit 0; fi
  for arg in "$@"; do if [[ "$arg" == --files-from=* ]]; then list="\${arg#--files-from=}"; fi; done
  destination="\${args[-1]#fixture:}"
  while IFS= read -r -d '' name; do cp -- "backups/$name" "$destination/$name"; done < "$list"
  exit 0
fi
cp -- "\${args[-2]}" "\${args[-1]#fixture:}"
`, { mode: 0o700 })
    }
    writeFileSync(join(root, 'bin/docker'), `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$PWD/docker-calls"
printf '%s:%s\\n' "$APP_UID" "$APP_GID" >> "$PWD/docker-users"
case "$*" in
  'ps -aq --filter label=org.open-agricola.backup.run')
    [[ "\${BACKUP_TEST_FAILURE:-}" != orphan ]] || printf '${'d'.repeat(64)}'
    ;;
  'ps -aq '*) ;;
  inspect*'org.open-agricola.backup.deadline'*) printf 0 ;;
  'rm -f '*) ;;
  *' ps -q app') printf '${container}' ;;
  'ps -q --no-trunc '*) printf '${container}' ;;
  *'{{.State.Running}}'*) printf true ;;
  *'{{.Image}}'*) printf '${image}' ;;
  *'com.docker.compose.project'*) printf backup-fixture ;;
  *'RESOURCE_DELETION_PROTOCOL'*) if [[ "\${BACKUP_TEST_FAILURE:-}" == protocol ]]; then printf 0; else printf 1; fi ;;
  *'process.env.GAME_BUILD_ID'*) printf '${sourceBuild}' ;;
  *'cleanup-scratch /backup'*) ;;
  *'ledger-merge '*) ;;
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
    const run = () => spawnSync('/bin/bash', offsite ? ['backup-offsite.sh'] : ['scripts/backup-storage.sh', 'manual-test', ...(stopped ? ['--already-stopped'] : [])], {
      cwd: root,
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, BACKUP_TEST_FAILURE: fail,
        SOURCE_BUILD_ID: sourceBuild, MAINTENANCE_LOCK_HELD: '0', BACKUP_JOB_ID: fail.endsWith('date-width') ? '' : 'fixture-run',
        OFFSITE_BACKUP_TARGET: 'fixture', OFFSITE_BACKUP_REMOTE_DIR: remote,
        BACKUP_DEADLINE_EPOCH_MS: String(Date.now() + (fail === 'deadline' || fail === 'offsite-timeout' ? 2000 : 30_000)) },
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
      calls: existsSync(join(root, 'docker-calls')) ? readFileSync(join(root, 'docker-calls'), 'utf8').trim().split('\n') : [],
      users: existsSync(join(root, 'docker-users')) ? readFileSync(join(root, 'docker-users'), 'utf8').trim().split('\n') : [],
      archive: existsSync(archivePath) ? readFileSync(archivePath) : undefined,
      mode: existsSync(archivePath) ? statSync(archivePath).mode & 0o777 : undefined,
      report: existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : undefined,
      configuration: existsSync(configPath) ? readFileSync(configPath) : undefined,
      pending: readdirSync(join(root, 'backups')).filter(name => name.startsWith('.pending-')),
      latest: readFileSync(join(root, 'backups/observability.latest.json'), 'utf8'), priorReport,
      remoteLedger: existsSync(join(remote, 'replay-removals.latest.json')) ? readFileSync(join(remote, 'replay-removals.latest.json'), 'utf8') : undefined,
      expiredRemoteArchive: existsSync(join(remote, 'daily-old.tgz')),
      incoming: offsite ? readdirSync(remote).filter(name => name.startsWith('.incoming-')) : [],
      remoteArchives: offsite ? readdirSync(remote).filter(name => name.endsWith('.manifest.json')).map(name => {
        const report = JSON.parse(readFileSync(join(remote, name), 'utf8'))
        return { report, bytes: readFileSync(join(remote, `${report.backupStem}.tgz`)) }
      }) : [],
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

it('still synchronizes erasure facts and prunes offsite archives when incoming creation fails', () => {
  const result = backup('offsite-mkdir')
  expect(result.status).not.toBe(0)
  expect(result.calls.some(call => call.includes('ledger-merge /backup/'))).toBe(true)
  expect(result.remoteLedger).toBe('{"version":1,"batches":[]}')
  expect(result.expiredRemoteArchive).toBe(false)
}, 15_000)

it('uses the reserved cleanup budget to remove incoming bytes after the work deadline', () => {
  const result = backup('offsite-timeout')
  expect(result.status).not.toBe(0)
  expect(result.incoming).toEqual([])
}, 15_000)

it('reaps an abandoned maintenance tool while holding the shared host lock', () => {
  const result = backup('orphan')
  expect(result.status, result.stderr).toBe(0)
  expect(result.calls).toContain(`rm -f ${'d'.repeat(64)}`)
})

it('captures and commits offsite when date ignores nanosecond field width', () => {
  const result = backup('offsite-date-width')
  expect(result.status, result.stderr).toBe(0)
  expect(result.remoteArchives).toHaveLength(1)
  const archived = result.remoteArchives[0]!
  expect(archived.report.archiveSha256).toBe(createHash('sha256').update(archived.bytes).digest('hex'))
  expect(result.remoteLedger).toBe('{"version":1,"batches":[]}')
  expect(result.incoming).toEqual([])
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
}, 15_000)
