import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const sourceBuild = 'a'.repeat(40), image = `sha256:${'b'.repeat(64)}`, container = 'c'.repeat(64)

type OffsiteDirectoryForm = 'canonical' | 'trailing-slashes' | 'dot' | 'parent' | 'cross-scope' | 'symlink'
function offsiteDirectory(directory: string, form: OffsiteDirectoryForm) {
  if (form === 'symlink') {
    symlinkSync(directory, `${directory}-alias`)
    return `${directory}-alias/`
  }
  return directory + { canonical: '', 'trailing-slashes': '///', dot: '/./', parent: '/../remote/', 'cross-scope': '/../backups/' }[form]
}

// Real shell, timeout, tar and hashing; native PG/S3 round trips have separate tests.
function backup(fail = '', stopped = false, duplicate = false, offsiteOptions: {
  mode?: 'full' | 'ledger-only'
  directoryForm?: OffsiteDirectoryForm
} = {}) {
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
    const committed = (directory: string, stem: string, ageDays: number) => {
      const archive = Buffer.from(stem), configuration = Buffer.from('private fixture configuration')
      const report = { formatVersion: 2, backupStem: stem, environment: 'stable', retentionDays: 30,
        validatedAt: new Date().toISOString(), sourceBuildId: sourceBuild, targetBuildId: sourceBuild,
        archiveSha256: createHash('sha256').update(archive).digest('hex'), archiveSizeBytes: archive.length,
        configurationSha256: createHash('sha256').update(configuration).digest('hex'), configurationSizeBytes: configuration.length }
      const files: Array<[string, Buffer | string]> = [[`${stem}.tgz`, archive], [`env-${stem}`, configuration], [`${stem}.manifest.json`, JSON.stringify(report)]]
      for (const [name, bytes] of files) {
        writeFileSync(join(directory, name), bytes)
        const date = new Date(Date.now() - ageDays * 86400_000)
        utimesSync(join(directory, name), date, date)
      }
    }
    if (fail === 'offsite-export') {
      for (let index = 1; index <= 8; index++) committed(join(root, 'backups'), `daily-seeded-${index}`, index)
      for (let index = 1; index <= 6; index++) committed(join(root, 'backups'), `pre-seeded-${index}`, index)
      committed(join(root, 'backups'), 'manual-within-limit', 29)
      committed(join(root, 'backups'), 'manual-expired', 31)
    }
    writeFileSync(join(root, 'bin/node'), `#!/bin/bash
printf 'node:%s\\n' "$*" >> "$PWD/backup-events"
exec "$OA_BACKUP_REAL_NODE" "$@"
`, { mode: 0o700 })
    if (offsite) {
      mkdirSync(remote)
      if (fail === 'offsite-export') committed(remote, 'manual-independent', 29)
      mkdirSync(join(root, 'deploy'))
      cpSync('backup-offsite.sh', join(root, 'backup-offsite.sh'))
      for (const path of ['deploy/offsite-retention.sh', 'deploy/commit-backup-set.sh']) cpSync(path, join(root, path))
      if (fail === 'offsite-export') writeFileSync(join(root, 'deploy/offsite-retention.sh'), `printf 'remote-retention\\n' >> '${root}/backup-events'\n` + readFileSync(join(root, 'deploy/offsite-retention.sh'), 'utf8'))
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
  cp -- "$list" "$PWD/archive-files.nul"
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
printf 'docker:%s\\n' "$*" >> "$PWD/backup-events"
printf '%s:%s\\n' "$APP_UID" "$APP_GID" >> "$PWD/docker-users"
case "$*" in
  'ps -aq --filter label=org.open-agricola.backup.run --filter label=org.open-agricola.backup.environment=stable')
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
    [[ "\${BACKUP_TEST_FAILURE:-}" != export && "\${BACKUP_TEST_FAILURE:-}" != offsite-export ]] || exit 42
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
    const remoteDirectory = offsiteDirectory(remote, offsiteOptions.directoryForm ?? 'canonical')
    const run = () => spawnSync('/bin/bash', offsite ? ['backup-offsite.sh', offsiteOptions.mode ?? 'full'] : ['scripts/backup-storage.sh', 'manual-test', ...(stopped ? ['--already-stopped'] : [])], {
      cwd: root,
      env: { ...process.env, BACKUP_RETENTION_DAYS: undefined, BACKUP_DAILY_COUNT: undefined, BACKUP_PRE_COUNT: undefined,
        OA_BACKUP_REAL_NODE: process.execPath, PATH: `${root}/bin:${process.env.PATH}`, BACKUP_TEST_FAILURE: fail,
        SOURCE_BUILD_ID: sourceBuild, MAINTENANCE_LOCK_HELD: '0', BACKUP_JOB_ID: fail.endsWith('date-width') ? '' : 'fixture-run',
        OFFSITE_BACKUP_TARGET: 'fixture', OFFSITE_BACKUP_REMOTE_DIR: remoteDirectory,
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
      events: existsSync(join(root, 'backup-events')) ? readFileSync(join(root, 'backup-events'), 'utf8').trim().split('\n') : [],
      localFiles: readdirSync(join(root, 'backups')),
      archiveFiles: existsSync(join(root, 'archive-files.nul')) ? readFileSync(join(root, 'archive-files.nul'), 'utf8').split('\0').filter(Boolean) : [],
      remoteFiles: offsite ? readdirSync(remote) : [],
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

function retainOffsite(directoryForm: OffsiteDirectoryForm) {
  const root = mkdtempSync(join(tmpdir(), 'agricola-offsite-retention-'))
  const remote = join(root, 'remote')
  try {
    mkdirSync(remote)
    const expired = new Date(Date.now() - 31 * 86400_000)
    for (const name of ['daily-old.tgz', 'daily-old.manifest.json', 'env-daily-old']) {
      writeFileSync(join(remote, name), 'expired fixture')
      utimesSync(join(remote, name), expired, expired)
    }
    writeFileSync(join(remote, 'replay-removals.latest.json'), '{"version":1,"batches":[]}')
    const result = spawnSync('/bin/bash', ['deploy/offsite-retention.sh', offsiteDirectory(remote, directoryForm)], { encoding: 'utf8' })
    if (result.error) throw result.error
    return { status: result.status, stderr: result.stderr, files: readdirSync(remote).sort() }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

it('captures online from the running immutable image without stopping or restarting the application', () => {
  const result = backup()
  expect(result.status, result.stderr).toBe(0)
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
  expect(result.calls.some(call => call.includes('export-online /backup/'))).toBe(true)
  expect(result.calls.some(call => call.includes('--label org.open-agricola.backup.run=fixture-run'))).toBe(true)
  expect(result.calls.some(call => call.includes('app timeout --signal=TERM'))).toBe(true)
  expect(result.report).toMatchObject({ environment: 'stable', retentionDays: 30, sourceBuildId: sourceBuild, targetBuildId: sourceBuild,
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

it('keeps stable backup cleanup and tool labels separate from prerelease environments', () => {
  const result = backup()
  expect(result.status, result.stderr).toBe(0)
  expect(result.calls).toContain('ps -aq --filter label=org.open-agricola.backup.run --filter label=org.open-agricola.backup.environment=stable')
  expect(result.calls.some(call => call.includes('--label org.open-agricola.backup.environment=stable'))).toBe(true)
  expect(result.calls.some(call => call === 'ps -aq --filter label=org.open-agricola.backup.run')).toBe(false)
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

it.each(['full', 'ledger-only'] as const)('accepts trailing slashes for an offsite %s job', mode => {
  const result = backup('offsite-directory', false, false, { mode, directoryForm: 'trailing-slashes' })
  expect(result.status, result.stderr).toBe(0)
  expect(result.remoteLedger).toBe('{"version":1,"batches":[]}')
  expect(result.remoteArchives).toHaveLength(mode === 'full' ? 1 : 0)
  expect(result.expiredRemoteArchive).toBe(mode === 'ledger-only')
  expect(result.incoming).toEqual([])
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
}, 15_000)

it('accepts trailing slashes for autonomous offsite retention without removing the ledger', () => {
  const result = retainOffsite('trailing-slashes')
  expect(result.status, result.stderr).toBe(0)
  expect(result.files).toEqual(['replay-removals.latest.json'])
})

it.each(['dot', 'parent', 'cross-scope', 'symlink'] as const)('rejects an offsite %s alias after stripping trailing slashes', directoryForm => {
  const result = backup('offsite-directory', false, false, { mode: 'ledger-only', directoryForm })
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Offsite scope contains an alias')
  expect(result.remoteLedger).toBeUndefined()
  expect(result.expiredRemoteArchive).toBe(true)
  expect(result.remoteArchives).toEqual([])
  expect(result.incoming).toEqual([])
})

it.each(['dot', 'parent', 'cross-scope', 'symlink'] as const)('rejects autonomous retention through a %s alias without deleting archives', directoryForm => {
  const result = retainOffsite(directoryForm)
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Offsite scope contains an alias')
  expect(result.files).toEqual(['daily-old.manifest.json', 'daily-old.tgz', 'env-daily-old', 'replay-removals.latest.json'])
})


it('keeps stable default age/count limits and separate ledger sync after a real shell capture failure', () => {
  const result = backup('offsite-export')
  expect(result.status).not.toBe(0)
  expect(result.latest).toBe(result.priorReport)
  expect(result.localFiles.filter(name => /^daily-.*\.tgz$/.test(name)).sort()).toEqual(Array.from({ length: 7 }, (_, index) => `daily-seeded-${index + 1}.tgz`))
  expect(result.localFiles.filter(name => /^pre-.*\.tgz$/.test(name)).sort()).toEqual(Array.from({ length: 5 }, (_, index) => `pre-seeded-${index + 1}.tgz`))
  expect(result.localFiles).toContain('manual-within-limit.tgz')
  expect(result.localFiles).not.toContain('manual-expired.tgz')
  expect(result.expiredRemoteArchive).toBe(false)
  expect(result.remoteFiles).toContain('manual-independent.tgz')
  expect(result.remoteLedger).toBe('{"version":1,"batches":[]}')
  expect(result.archiveFiles).not.toContain('replay-removals.latest.json')
  expect(result.archiveFiles).toContain('manual-within-limit.tgz')
  const captureAt = result.events.findIndex(event => event.startsWith('docker:') && event.includes('export-online /backup/'))
  const pruneAt = result.events.findIndex(event => event.startsWith('node:') && event.includes('backup-files.mjs prune backups 7 5'))
  const offsiteAt = result.events.indexOf('remote-retention')
  expect(captureAt).toBeGreaterThanOrEqual(0)
  expect(pruneAt).toBeGreaterThan(captureAt)
  expect(offsiteAt).toBeGreaterThan(pruneAt)
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
}, 15_000)
