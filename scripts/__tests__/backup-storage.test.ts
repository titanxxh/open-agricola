import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { atomicJson, readRuntime, writeRuntime } from '../prerelease/runtime'
import { importedImagePath } from '../prerelease/docker'
import type { ContainerImageTransfer } from '../release/container-images'
import { readPairedPrereleaseBackup } from '../prerelease/backup'
import { seedStorageGuard } from './prerelease-storage-guard-fixture'

const sourceBuild = 'a'.repeat(40), image = `sha256:${'b'.repeat(64)}`, container = 'c'.repeat(64)

// Real shell, timeout, tar and hashing; native PG/S3 and resident app cgroups have separate tests.
function backup(fail = '', stopped = false, duplicate = false, options: {
  operation?: 'deploy' | 'reset'
  deadline?: 'missing' | 'expired'
} = {}) {
  const temporary = mkdtempSync(join(tmpdir(), 'agricola-native-backup-'))
  const prerelease = fail.startsWith('prerelease-')
  const root = prerelease ? join(temporary, 'open-agricola-prerelease-test') : temporary
  if (prerelease) mkdirSync(root)
  const policySha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const policyImage = `sha256:${'d'.repeat(64)}`, capturedAt = new Date(Date.now() - 1000).toISOString()
  try {
    for (const path of ['scripts', 'scripts/ci', 'bin', 'data', 'backups']) mkdirSync(join(root, path))
    for (const path of ['scripts/backup-storage.sh', 'scripts/backup-process.sh', 'scripts/backup-files.mjs', 'scripts/ci/docker-bind-user.ts']) cpSync(path, join(root, path))
    writeFileSync(join(root, '.env'), 'ACCOUNT_REGISTRATION_POLICY=open\n')
    writeFileSync(join(root, 'fixture-sentinel.txt'), 'inert owner fixture bytes')
    writeFileSync(join(root, 'data/dependencies.compose.env'), 'DATABASE_URL=test-only\n')
    const target = prerelease ? parsePrereleaseTarget({ ...JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')),
      targetId: 'prerelease-test', directory: root, policyDirectory: process.cwd(), project: 'open-agricola-prerelease-test',
      network: 'open-agricola-prerelease-test-dependencies',
      database: { host: '127.0.0.1', port: 5432, name: 'oa_prerelease_test', appRole: 'oa_prerelease_test_app', backupRole: 'oa_prerelease_test_backup' },
      validationDatabase: { host: '127.0.0.1', port: 5432, name: 'oa_prerelease_test_validation', role: 'oa_prerelease_test_validator' },
      objects: { endpoint: 'http://127.0.0.1:9000', bucket: 'oa-prerelease-test', prefix: 'live/', appKeyId: 'pre-app', backupKeyId: 'pre-backup' },
      offsite: { host: 'fixture', directory: '/srv/backups/open-agricola-prerelease-test' },
    }) : undefined
    if (target) {
      if (fail !== 'prerelease-missing-guard') seedStorageGuard(target)
      const common = 'S3_BUCKET=oa-prerelease-test\nS3_PREFIX=live/\nS3_SECRET_ACCESS_KEY=inert-fixture\nS3_ENDPOINT=http://127.0.0.1:9000\nS3_REGION=us-east-1\nS3_FORCE_PATH_STYLE=true\n'
      writeFileSync(join(root, '.env'), 'DATABASE_URL=postgres://oa_prerelease_test_app:fixture@127.0.0.1/oa_prerelease_test\nS3_ACCESS_KEY_ID=pre-app\n' + common, { mode: 0o600 })
      writeFileSync(join(root, 'data/dependencies.compose.env'), 'DATABASE_URL=postgres://oa_prerelease_test_backup:fixture@127.0.0.1/oa_prerelease_test\nVALIDATION_DATABASE_URL=postgres://oa_prerelease_test_validator:fixture@127.0.0.1/oa_prerelease_test_validation\nS3_ACCESS_KEY_ID=pre-backup\n' + common, { mode: 0o600 })
      chmodSync(join(root, '.env'), 0o600); chmodSync(join(root, 'data/dependencies.compose.env'), 0o600)
      const transfer: ContainerImageTransfer = { format: 1, receipt: {
        format: 1, repository: 'titanxxh/open-agricola', repositoryId: 123, purpose: 'trusted-policy', channel: 'stable',
        sourceSha: policySha, producerSha: policySha, platform: 'linux/amd64',
        registryRepository: 'ghcr.io/titanxxh/open-agricola-images', manifestDigest: `sha256:${'e'.repeat(64)}`, imageId: policyImage,
        build: { runId: 10, runAttempt: 1 }, verification: { kind: 'main-policy', configuration: 'f'.repeat(64) },
      }, archive: { sha256: 'e'.repeat(64), bytes: 10240 } }
      if (fail !== 'prerelease-missing-policy') atomicJson(importedImagePath(target, 'trusted-policy', policySha, policySha), {
        fingerprint: targetFingerprint(target), transfer, nativeImageId: policyImage, archiveManifestDigest: null,
      })
      const initial = readRuntime(target)
      writeRuntime(target, { ...initial, mode: stopped ? 'maintenance' : 'open', buildId: sourceBuild, installed: { buildId: sourceBuild, image, installedAt: Date.now() },
        operation: options.operation ? { id: '11111111-1111-4111-8111-111111111111', kind: options.operation, buildId: sourceBuild, image, sourceBuildId: sourceBuild, sourceImage: image, stage: 'backup', backupStem: 'manual-test', generation: initial.generation } : null, acceptance: { acceptedAt: Date.now(), sha256: 'f'.repeat(64) } })
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
  'image inspect --format {{.Id}}'*) printf '${policyImage}';;
  'image inspect --format {{json .Config.Labels}}'*) printf '{"org.opencontainers.image.revision":"${fail === 'prerelease-bad-revision' ? 'f'.repeat(40) : policySha}","io.open-agricola.release-channel":"${fail === 'prerelease-bad-channel' ? 'prerelease' : 'stable'}"}';;
  *'/app/frontend-dist/frontend-build.json'*) printf '{"format":1,"gameBuildId":"${policySha}","basePath":"/open-agricola/","releaseChannel":"stable","deploymentTarget":"stable-hosted"}';;
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
  *'com.docker.compose.project'*) printf '${target?.project ?? 'backup-fixture'}' ;;
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
    printf '${JSON.stringify({ formatVersion: 2, validatedAt: '2026-11-05T00:00:00Z', sourceBuildId: target ? policySha : sourceBuild, targetBuildId: target ? policySha : sourceBuild, ...(target ? { createdAt: '2099-01-01T00:00:00Z' } : {}) })}'
    ;;
  *) echo "Unexpected fixture Docker command: $*" >&2; exit 88 ;;
esac
`, { mode: 0o700 })
    const deadline = options.deadline === 'missing' ? undefined : String(Date.now() + (options.deadline === 'expired' ? -1000 : fail === 'deadline' ? 2000 : 30_000))
    const run = () => spawnSync('/bin/bash', ['scripts/backup-storage.sh', 'manual-test', ...(stopped ? ['--already-stopped'] : [])], {
      cwd: root,
      env: { ...process.env, CI: fail === 'prerelease-CI' ? 'true' : '', GITHUB_ACTIONS: fail === 'prerelease-GITHUB_ACTIONS' ? 'true' : '',
        BACKUP_RETENTION_DAYS: target ? '7' : undefined, BACKUP_DAILY_COUNT: undefined, BACKUP_PRE_COUNT: undefined,
        OA_BACKUP_REAL_NODE: process.execPath, PATH: `${root}/bin:${process.env.PATH}`, BACKUP_TEST_FAILURE: fail,
        SOURCE_BUILD_ID: sourceBuild, MAINTENANCE_LOCK_HELD: '0', BACKUP_JOB_ID: 'fixture-run',
        BACKUP_ENVIRONMENT: target?.targetId, BACKUP_TARGET_CONFIG: target && fail !== 'prerelease-missing-context' ? JSON.stringify(target) : undefined,
        BACKUP_POLICY_ROOT: target?.policyDirectory, BACKUP_WORKING_DIRECTORY: target?.directory, BACKUP_SOURCE_IMAGE: target ? image : undefined,
        BACKUP_TARGET_BUILD_ID: target ? sourceBuild : undefined,
        BACKUP_DATA_GENERATION: target && readRuntime(target).generation, BACKUP_TARGET_FINGERPRINT: target && targetFingerprint(target),
        BACKUP_TOOL_SERVICE: target ? 'tools' : undefined, BACKUP_CAPTURE_SERVICE: target ? 'capture' : undefined,
        BACKUP_TOOL_MEMORY_MIB: target && String(target.budgets.tools.memoryMiB), BACKUP_TOOL_CPUS: target && String(target.budgets.tools.cpus), BACKUP_TOOL_PIDS: target && String(target.budgets.tools.pids),
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
      deadline, runtime: target ? readRuntime(target) : undefined,
      status: result.status, retryStatus: retry?.status, stderr: result.stderr,
      calls: existsSync(join(root, 'docker-calls')) ? readFileSync(join(root, 'docker-calls'), 'utf8').trim().split('\n') : [],
      users: existsSync(join(root, 'docker-users')) ? readFileSync(join(root, 'docker-users'), 'utf8').trim().split('\n') : [],
      archive: existsSync(archivePath) ? readFileSync(archivePath) : undefined,
      mode: existsSync(archivePath) ? statSync(archivePath).mode & 0o777 : undefined,
      report: existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : undefined,
      configuration: existsSync(configPath) ? readFileSync(configPath) : undefined,
      pending: readdirSync(join(root, 'backups')).filter(name => name.startsWith('.pending-')),
      latest: readFileSync(join(root, 'backups/observability.latest.json'), 'utf8'), priorReport,
      sentinel: readFileSync(join(root, 'fixture-sentinel.txt'), 'utf8'),
      capturedAt, policySha, policyImage,
      runtime: target ? readRuntime(target) : undefined,
      paired: target && existsSync(reportPath) ? readPairedPrereleaseBackup(target, 'manual-test', readRuntime(target).generation) : undefined,
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

it('captures an open prerelease source using the separate trusted policy image and read-only candidate input', () => {
  const result = backup('prerelease-policy')
  expect(result.status, result.stderr).toBe(0)
  const exporter = result.calls.find(call => call.includes('export-online /backup/'))
  expect(exporter).toContain(result.policyImage)
  expect(result.calls.some(call => /^(?:buildx|build|pull|load)\b/.test(call))).toBe(false)
  expect(exporter).not.toContain(' run --rm --no-deps ')
  const validator = result.calls.find(call => call.includes('validate /backup/'))
  expect(validator).toContain('/capture:ro')
  expect(validator).not.toMatch(/-v \S+\/backups:\/backup(?: |$)/)
  expect(result.report).toMatchObject({ sourceBuildId: sourceBuild, targetBuildId: sourceBuild, createdAt: result.capturedAt, retentionDays: 7 })
  expect(result.report.sourceBuildId).not.toBe(result.policySha)
  expect(result.paired).toMatchObject({ sourceBuildId: sourceBuild, targetBuildId: sourceBuild, createdAt: result.capturedAt })
  expect(result.runtime).toMatchObject({ mode: 'open', operation: null, installed: { buildId: sourceBuild, image } })
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
}, 15000)

it('requires fresh owner storage admission before exporting prerelease data', () => {
  const result = backup('prerelease-missing-guard')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Prerelease storage guard is missing, stale or latched')
  expect(result.report).toBeUndefined()
  expect(result.calls.some(call => call.includes('export-online /backup/'))).toBe(false)
})

it('requires an imported policy image before backup without building or exporting from the candidate', () => {
  const result = backup('prerelease-missing-policy')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Missing verified imported image')
  expect(result.report).toBeUndefined()
  expect(result.calls.some(call => /^(?:buildx|build|pull|load)\b/.test(call) || call.includes('export-online /backup/'))).toBe(false)
  expect(result.runtime).toMatchObject({ mode: 'open', installed: { buildId: sourceBuild, image } })
})

it('fails closed when prerelease backup has no trusted owner context', () => {
  const result = backup('prerelease-missing-context')
  expect(result.status).not.toBe(0)
  expect(result.report).toBeUndefined()
  expect(result.calls.some(call => call.includes('export-online /backup/'))).toBe(false)
})

it.each(['channel', 'revision'])('rejects a policy tooling image with the wrong %s without falling back to candidate export', field => {
  const result = backup(`prerelease-bad-${field}`)
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Image channel/SHA does not match')
  expect(result.report).toBeUndefined()
  expect(result.calls.some(call => call.includes('export-online /backup/'))).toBe(false)
})

it.each(['CI', 'GITHUB_ACTIONS'])('refuses the prerelease archive adapter under %s before exporter execution', flag => {
  const result = backup(`prerelease-${flag}`)
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('owner-controlled machine')
  expect(result.calls.some(call => call.includes('export-online /backup/'))).toBe(false)
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

it.each(['deploy', 'reset'] as const)('captures %s maintenance through the real shell/adapter without a caller deadline', operation => {
  const result = backup('prerelease-policy', true, false, { operation, deadline: 'missing' })
  expect(result.status, result.stderr).toBe(0)
  expect(result.calls.some(call => call.includes('export /backup/') && call.includes('--applications-stopped'))).toBe(true)
  expect(result.runtime?.mode).toBe('maintenance')
  expect(result.runtime?.operation?.kind).toBe(operation)
  expect(result.calls.some(call => /(?:stop|start|restart) app$/.test(call))).toBe(false)
})
it('preserves an earlier caller deadline for stopped prerelease capture and rejects an expired one', () => {
  const bounded = backup('prerelease-policy', true, false, { operation: 'deploy' })
  expect(bounded.status, bounded.stderr).toBe(0)
  expect(bounded.calls.find(call => call.includes('export /backup/'))).toContain(`org.open-agricola.backup.deadline=${bounded.deadline}`)
  const expired = backup('prerelease-policy', true, false, { operation: 'reset', deadline: 'expired' })
  expect(expired.status).not.toBe(0)
  expect(expired.stderr).toContain('Backup deadline exceeded')
  expect(expired.calls).toEqual([])
  expect(expired.runtime?.mode).toBe('maintenance')
})
