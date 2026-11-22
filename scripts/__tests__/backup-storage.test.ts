// @covers scripts/backup-process.sh scripts/backup-storage.sh
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const sourceBuild = 'a'.repeat(40), image = `sha256:${'b'.repeat(64)}`, container = 'c'.repeat(64)

// Real shell, timeout, tar and hashing; native PG/S3 and resident app cgroups have separate tests. A prerelease backup
// hands each storage-archive step to the owner's archive adapter (BACKUP_ARCHIVE_POLICY); the owner tools test the
// adapter itself, so here it is a stub that records its arguments and forwards them to the Docker stub.
function backup(fail = '', stopped = false, duplicate = false, options: {
  deadline?: 'missing' | 'expired'
  adapter?: 'missing' | 'relative' | 'not-executable'
} = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'agricola-native-backup-'))
  const prerelease = fail.startsWith('prerelease-')
  const root = prerelease ? join(temporary, 'open-agricola-prerelease-test') : temporary
  if (prerelease) mkdirSync(root)
  const policyRoot = process.cwd(), capturedAt = new Date(Date.now() - 1000).toISOString()
  try {
    for (const path of ['scripts', 'scripts/ci', 'bin', 'data', 'backups']) mkdirSync(join(root, path))
    for (const path of ['scripts/backup-storage.sh', 'scripts/backup-process.sh', 'scripts/backup-files.mjs', 'scripts/ci/docker-bind-user.ts']) cpSync(path, join(root, path))
    writeFileSync(join(root, '.env'), 'ACCOUNT_REGISTRATION_POLICY=open\n')
    writeFileSync(join(root, 'fixture-sentinel.txt'), 'inert owner fixture bytes')
    writeFileSync(join(root, 'data/dependencies.compose.env'), 'DATABASE_URL=test-only\n')
    const project = prerelease ? 'open-agricola-prerelease-test' : 'backup-fixture'
    const adapter = join(root, 'bin/archive-adapter')
    if (prerelease) {
      writeFileSync(adapter, `#!/bin/bash
set -eu
printf '%s|%s|%s\\n' "$*" "\${BACKUP_JOB_ID:-}" "\${BACKUP_DEADLINE_EPOCH_MS:-}" >> "$PWD/adapter-calls"
[[ "$1" == "$BACKUP_POLICY_ROOT" && "$2" == archive-policy ]] || exit 89
shift 2
exec docker adapter "$@"
`, { mode: options.adapter === 'not-executable' ? 0o600 : 0o700 })
    }
    const priorReport = '{"backupStem":"previous-validated-backup"}\n'
    writeFileSync(join(root, 'backups/observability.latest.json'), priorReport)
    writeFileSync(join(root, 'bin/node'), `#!/bin/bash
printf 'node:%s\\n' "$*" >> "$PWD/backup-events"
exec "$OA_BACKUP_REAL_NODE" "$@"
`, { mode: 0o700 })
    writeFileSync(join(root, 'bin/docker'), `#!/bin/bash
set -eu
printf '%s\\n' "$*" >> "$PWD/docker-calls"
printf 'docker:%s\\n' "$*" >> "$PWD/backup-events"
printf '%s:%s\\n' "\${APP_UID:-$(id -u)}" "\${APP_GID:-$(id -g)}" >> "$PWD/docker-users"
case "$*" in
  'info --format {{json .DriverStatus}}') printf '[]';;
  *'{{json .HostConfig}}'*) printf '{"Privileged":false,"Memory":268435456,"NanoCpus":500000000,"PidsLimit":64}';;
  *'{{json .Config}}'*) printf '{"User":"1000:1000"}';;
  *'{{json .Mounts}}'*) printf '[]';;
  'ps -aq --filter label=org.open-agricola.backup.run --filter label=org.open-agricola.backup.environment=stable')
    [[ "\${BACKUP_TEST_FAILURE:-}" != orphan ]] || printf '${'d'.repeat(64)}'
    ;;
  'ps -aq '*) ;;
  inspect*'org.open-agricola.backup.environment'*) printf stable ;;
  inspect*'org.open-agricola.backup.run'*) printf abandoned-run ;;
  inspect*'org.open-agricola.backup.deadline'*) printf 0 ;;
  inspect*'com.docker.compose.service'*) printf app ;;
  inspect*'com.docker.compose.oneoff'*) printf True ;;
  'rm -f '*) ;;
  *' ps -q app') printf '${container}' ;;
  'ps -q --no-trunc '*'label=com.docker.compose.oneoff=False') printf '${container}' ;;
  'ps -q --no-trunc '*) ;; # Source metadata is mocked above; no native resident app memory is credited.
  'ps -q '*) ;;
  *'{{.State.Running}}'*) printf true ;;
  *'{{.Image}}'*) printf '${image}' ;;
  *'com.docker.compose.project'*) printf '${project}' ;;
  *'io.open-agricola.release-channel'*) printf prerelease ;;
  *'RESOURCE_DELETION_PROTOCOL'*) if [[ "\${BACKUP_TEST_FAILURE:-}" == protocol ]]; then printf 0; else printf 1; fi ;;
  *'process.env.GAME_BUILD_ID'*) printf '${sourceBuild}' ;;
  *'cleanup-scratch /backup'*) ;;
  *'ledger-merge '*) ;;
  *'ledger-export '*) printf '{"version":1,"batches":[]}' > backups/replay-removals.latest.json ;;
  *'export-online /backup/'*|*' export /backup/'*)
    [[ "\${BACKUP_TEST_FAILURE:-}" != export ]] || exit 42
    if [[ "\${BACKUP_TEST_FAILURE:-}" == deadline ]]; then sleep 30; fi
    if [[ "\${BACKUP_TEST_FAILURE:-}" == report-link ]]; then ln -s "$PWD/fixture-sentinel.txt" "$PWD/backups/.pending-fixture-run/report.json"; fi
    for argument in "$@"; do
      if [[ "$argument" == /backup/.pending-*/capture ]]; then
        capture="$PWD/backups/\${argument#/backup/}"
        mkdir -p "$capture"
        printf native-archive > "$capture/database.dump"
        printf '%s' '${JSON.stringify({ version: 1, sourceBuildId: sourceBuild, createdAt: capturedAt, schema: 'public', objects: [] })}' > "$capture/archive.json"
      fi
    done
    ;;
  *'validate /backup/'*)
    [[ "\${BACKUP_TEST_FAILURE:-}" != validate ]] || exit 43
    printf '${JSON.stringify({ formatVersion: 2, validatedAt: '2026-11-05T00:00:00Z', sourceBuildId: sourceBuild, targetBuildId: sourceBuild })}'
    ;;
  *) echo "Unexpected fixture Docker command: $*" >&2; exit 88 ;;
esac
`, { mode: 0o700 })
    const deadline = options.deadline === 'missing' ? undefined : String(Date.now() + (options.deadline === 'expired' ? -1000 : fail === 'deadline' ? 2000 : 30_000))
    const run = () => spawnSync('/bin/bash', ['scripts/backup-storage.sh', 'manual-test', ...(stopped ? ['--already-stopped'] : [])], {
      cwd: root,
      env: { ...process.env, CI: '', GITHUB_ACTIONS: '',
        BACKUP_RETENTION_DAYS: prerelease ? '7' : undefined, BACKUP_DAILY_COUNT: undefined, BACKUP_PRE_COUNT: undefined,
        OA_BACKUP_REAL_NODE: process.execPath, PATH: `${root}/bin:${process.env.PATH}`, BACKUP_TEST_FAILURE: fail,
        SOURCE_BUILD_ID: sourceBuild, MAINTENANCE_LOCK_HELD: '0', BACKUP_JOB_ID: 'fixture-run',
        BACKUP_ENVIRONMENT: prerelease ? 'prerelease-test' : undefined, BACKUP_POLICY_ROOT: prerelease ? policyRoot : undefined,
        BACKUP_WORKING_DIRECTORY: prerelease ? root : undefined, BACKUP_SOURCE_IMAGE: prerelease ? image : undefined,
        BACKUP_TARGET_BUILD_ID: prerelease ? sourceBuild : undefined, BACKUP_DATA_GENERATION: prerelease ? 'fixture-generation' : undefined,
        BACKUP_TARGET_FINGERPRINT: prerelease ? 'f'.repeat(64) : undefined,
        BACKUP_ARCHIVE_POLICY: !prerelease || options.adapter === 'missing' ? undefined : options.adapter === 'relative' ? 'bin/archive-adapter' : adapter,
        BACKUP_TOOL_SERVICE: prerelease ? 'tools' : undefined, BACKUP_CAPTURE_SERVICE: prerelease ? 'capture' : undefined,
        BACKUP_TOOL_MEMORY_MIB: prerelease ? '256' : undefined, BACKUP_TOOL_CPUS: prerelease ? '0.5' : undefined, BACKUP_TOOL_PIDS: prerelease ? '64' : undefined,
        BACKUP_DEADLINE_EPOCH_MS: deadline },
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
      deadline,
      status: result.status, retryStatus: retry?.status, stdout: result.stdout, stderr: result.stderr,
      adapterCalls: existsSync(join(root, 'adapter-calls')) ? readFileSync(join(root, 'adapter-calls'), 'utf8').trim().split('\n') : [],
      calls: existsSync(join(root, 'docker-calls')) ? readFileSync(join(root, 'docker-calls'), 'utf8').trim().split('\n') : [],
      users: existsSync(join(root, 'docker-users')) ? readFileSync(join(root, 'docker-users'), 'utf8').trim().split('\n') : [],
      archive: existsSync(archivePath) ? readFileSync(archivePath) : undefined,
      mode: existsSync(archivePath) ? statSync(archivePath).mode & 0o777 : undefined,
      report: existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : undefined,
      configuration: existsSync(configPath) ? readFileSync(configPath) : undefined,
      pending: readdirSync(join(root, 'backups')).filter(name => name.startsWith('.pending-')),
      latest: readFileSync(join(root, 'backups/observability.latest.json'), 'utf8'), priorReport,
      sentinel: readFileSync(join(root, 'fixture-sentinel.txt'), 'utf8'),
      capturedAt, policyRoot,
    }
  } finally { rmSync(temporary, { recursive: true, force: true }) }
}

it('captures online from the running immutable image without stopping or restarting the application', () => {
  const result = backup()
  expect(result.status, result.stderr).toBe(0)
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
  expect(result.calls.some(call => call.includes('export-online /backup/'))).toBe(true)
  expect(result.calls.some(call => call.includes('--label org.open-agricola.backup.run=fixture-run'))).toBe(true)
  expect(result.calls.some(call => call.includes('app timeout --signal=TERM'))).toBe(true)
  // Validation shares the host with players and stays single-threaded.
  expect(result.calls.some(call => call.includes('STORAGE_VALIDATION_CONCURRENCY'))).toBe(false)
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
  expect(result.calls.find(call => call.includes('validate /backup/'))).toContain('-e STORAGE_VALIDATION_CONCURRENCY=auto')
})

it('refuses a linked host report without changing an inert owner fixture', () => {
  const result = backup('report-link')
  expect(result.sentinel).toBe('inert owner fixture bytes')
  expect(result.status).not.toBe(0)
  expect(result.report).toBeUndefined()
  expect(result.latest).toBe(result.priorReport)
})

it('refuses a duplicate stem without deleting the validated archive', () => {
  const result = backup('', false, true)
  expect(result.status).toBe(0)
  expect(result.retryStatus).not.toBe(0)
  expect(result.archive).toBeDefined()
  expect(result.report.backupStem).toBe('manual-test')
})

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

it('captures an open prerelease source only through the owner archive adapter', () => {
  const result = backup('prerelease-open')
  expect(result.status, result.stderr).toBe(0)
  const steps = result.adapterCalls.map(call => call.split('|')[0])
  expect(steps).toContain(`${result.policyRoot} archive-policy export-online /backup/.pending-fixture-run/capture`)
  expect(steps).toContain(`${result.policyRoot} archive-policy validate /backup/.pending-fixture-run/capture`)
  expect(result.adapterCalls.every(call => call.split('|')[1] === 'fixture-run' && /^\d+$/.test(call.split('|')[2]))).toBe(true)
  // Every storage-archive step goes through the adapter; the shell starts no tool container of its own.
  expect(result.calls.some(call => call.includes(' run --rm --no-deps '))).toBe(false)
  expect(result.calls.some(call => /^(?:buildx|build|pull|load)\b/.test(call))).toBe(false)
  expect(result.report).toMatchObject({ environment: 'prerelease-test', sourceBuildId: sourceBuild, targetBuildId: sourceBuild, createdAt: result.capturedAt, retentionDays: 7,
    dataGeneration: 'fixture-generation', targetFingerprint: 'f'.repeat(64) })
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
}, 15000)

it.each(['missing', 'relative', 'not-executable'] as const)('fails closed when the owner archive adapter is %s', adapter => {
  const result = backup('prerelease-open', false, false, { adapter })
  expect(result.status).not.toBe(0)
  expect(result.stdout + result.stderr).toContain('Prerelease backup requires the owner archive adapter')
  expect(result.adapterCalls).toEqual([])
  expect(result.report).toBeUndefined()
  expect(result.calls.some(call => call.includes('export-online /backup/'))).toBe(false)
})

it('captures prerelease maintenance through the real shell and adapter without a caller deadline', () => {
  const result = backup('prerelease-stopped', true, false, { deadline: 'missing' })
  expect(result.status, result.stderr).toBe(0)
  expect(result.adapterCalls.map(call => call.split('|')[0])).toContain(`${result.policyRoot} archive-policy export /backup/.pending-fixture-run/capture --applications-stopped`)
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
})

it('preserves an earlier caller deadline for stopped prerelease capture and rejects an expired one', () => {
  const bounded = backup('prerelease-stopped', true)
  expect(bounded.status, bounded.stderr).toBe(0)
  expect(bounded.adapterCalls.find(call => call.includes(' export /backup/'))?.split('|')[2]).toBe(bounded.deadline)
  const expired = backup('prerelease-stopped', true, false, { deadline: 'expired' })
  expect(expired.status).not.toBe(0)
  expect(expired.stderr).toContain('Backup deadline exceeded')
  expect(expired.adapterCalls).toEqual([])
  expect(expired.calls).toEqual([])
})
