import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, symlinkSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { FULL_TASK_IDS } from '../ci/verification-tasks'
import { targetFingerprint, parsePrereleaseTarget } from '../prerelease/config'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

function fixture() {
  const temporary = mkdtempSync(join(tmpdir(), 'agricola-pre-ops-'))
  roots.push(temporary)
  const root = join(temporary, 'open-agricola-prerelease-test')
  mkdirSync(join(root, 'data'), { recursive: true })
  const config = {
    format: 1, channel: 'prerelease', targetId: 'prerelease-test',
    directory: root, policyDirectory: resolve('.'), project: 'open-agricola-prerelease-test',
    origin: 'https://pre.agricola.test', port: 18575, network: 'open-agricola-prerelease-test-dependencies',
    database: { host: '127.0.0.1', port: 5432, name: 'oa_prerelease_test', appRole: 'oa_prerelease_test_app', backupRole: 'oa_prerelease_test_backup' },
    validationDatabase: { host: '127.0.0.1', port: 5432, name: 'oa_prerelease_test_validation', role: 'oa_prerelease_test_validator' },
    objects: { endpoint: 'http://127.0.0.1:9000', bucket: 'oa-prerelease-test', prefix: 'live/', appKeyId: 'pre-app', backupKeyId: 'pre-backup' },
    offsite: { host: 'backup-fixture', directory: '/srv/backups/open-agricola-prerelease-test' },
    builder: { name: 'prerelease-test', container: 'prerelease-test-builder' },
    formal: { project: 'open-agricola', directory: '/srv/open-agricola', appOrigin: 'https://app.agricola.test', apiOrigin: 'https://api.agricola.test', database: 'agricola', bucket: 'agricola', offsiteDirectory: '/srv/backups/open-agricola' },
    budgets: { app: { memoryMiB: 512, cpus: 1, pids: 256 }, tools: { memoryMiB: 512, cpus: 1, pids: 128 }, build: { memoryMiB: 1024, cpus: 1, pids: 512 }, diskMiB: 4096, reserveMemoryMiB: 256 },
  }
  writeFileSync(join(root, '.env'), 'DATABASE_URL=postgres://oa_prerelease_test_app:fixture@127.0.0.1/oa_prerelease_test\nS3_BUCKET=oa-prerelease-test\nS3_PREFIX=live/\nS3_ACCESS_KEY_ID=pre-app\nS3_SECRET_ACCESS_KEY=fixture-app\nS3_ENDPOINT=http://127.0.0.1:9000\nS3_REGION=us-east-1\nS3_FORCE_PATH_STYLE=true\n')
  writeFileSync(join(root, 'data/dependencies.compose.env'), 'DATABASE_URL=postgres://oa_prerelease_test_backup:fixture@127.0.0.1/oa_prerelease_test\nVALIDATION_DATABASE_URL=postgres://oa_prerelease_test_validator:fixture@127.0.0.1/oa_prerelease_test_validation\nS3_BUCKET=oa-prerelease-test\nS3_PREFIX=live/\nS3_ACCESS_KEY_ID=pre-backup\nS3_SECRET_ACCESS_KEY=fixture-tools\nS3_ENDPOINT=http://127.0.0.1:9000\nS3_REGION=us-east-1\nS3_FORCE_PATH_STYLE=true\n')
  chmodSync(join(root, '.env'), 0o600); chmodSync(join(root, 'data/dependencies.compose.env'), 0o600)
  const path = join(temporary, 'target.json')
  const bin = join(temporary, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'docker'), `#!/bin/sh
set -e
printf '%s\\n' "$*" >> '${temporary}/calls'
if [ -f '${temporary}/fail' ] && [ "$(cat '${temporary}/fail')" != stop ]; then exit 42; fi
case "$*" in
  *' stop --timeout 90 app') [ ! -f '${temporary}/fail' ] || exit 42;;
  *' ps -a -q app') printf '${'c'.repeat(64)}';;
  *'{{.Image}}'*) printf 'sha256:${'d'.repeat(64)}';;
  *'com.docker.compose.project'*) printf '${config.project}';;
  *'{{json .State}}'*) printf '{"Running":false,"OOMKilled":false,"ExitCode":0}';;
esac
`, { mode: 0o700 })
  const save = () => writeFileSync(path, JSON.stringify(config))
  save()
  const invoke = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prerelease/operations.ts', ...args, '--config', path], { encoding: 'utf8', env: { ...process.env, CI: '', PATH: `${bin}:${process.env.PATH}`, PRERELEASE_TEST_CALLS: join(temporary, 'calls') }, timeout: 15000 })
  return { root, config, save, invoke, bin, temporary, fail: join(temporary, 'fail'), calls: () => existsSync(join(temporary, 'calls')) ? readFileSync(join(temporary, 'calls'), 'utf8') : '' }
}

it('plans a complete isolated target without creating deployment files or exposing secrets', () => {
  const value = fixture()
  const result = value.invoke('plan')
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(result.stdout)).toMatchObject({ channel: 'prerelease', targetId: 'prerelease-test', database: 'oa_prerelease_test', retentionDays: 7 })
  expect(result.stdout).not.toContain('fixture-app')
  expect(existsSync(join(value.root, 'control'))).toBe(false)
})

it('initializes only a maintenance gateway, atomically binding the explicit authority/data generation', () => {
  const value = fixture()
  const generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5'
  const result = value.invoke('initialize', '--expected-current', 'empty', '--generation', generation)
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(readFileSync(join(value.root, 'control/gate.json'), 'utf8'))).toMatchObject({ channel: 'prerelease', mode: 'maintenance', generation, installed: null })
  const compose = JSON.parse(readFileSync(join(value.root, 'control/compose.json'), 'utf8'))
  expect(Object.keys(compose.services)).toEqual(['gateway'])
  expect(compose.services.gateway.ports).toEqual(['127.0.0.1:18575:5176'])
  expect(compose.services.gateway.volumes.some((value: string) => value.includes('.env'))).toBe(false)
})

it('refuses a formal database before Docker, SSH, state files, or a maintenance transition', () => {
  const value = fixture()
  value.config.database.name = 'agricola'
  value.save()
  const result = value.invoke('deploy', '--sha', 'a'.repeat(40), '--expected-current', 'empty')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('isolated prerelease database')
  expect(existsSync(join(value.root, 'control'))).toBe(false)
})

it('keeps a failed first install in maintenance and retries the same generation without inventing a new one', () => {
  const value = fixture(), generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5'
  writeFileSync(value.fail, '')
  const failed = value.invoke('initialize', '--expected-current', 'empty', '--generation', generation)
  expect(failed.status).not.toBe(0)
  expect(JSON.parse(readFileSync(join(value.root, 'control/gate.json'), 'utf8'))).toMatchObject({ mode: 'maintenance', generation })
  rmSync(value.fail)
  const retry = value.invoke('initialize', '--expected-current', 'empty', '--generation', generation)
  expect(retry.status, retry.stderr).toBe(0)
  expect(JSON.parse(readFileSync(join(value.root, 'control/gate.json'), 'utf8')).generation).toBe(generation)
  expect(value.calls()).not.toContain(' caddy')
})

it('closes the gateway before draining its owned writer and never resumes after a failed stop', () => {
  const value = fixture(), generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', buildId = 'a'.repeat(40)
  expect(value.invoke('initialize', '--expected-current', 'empty', '--generation', generation).status).toBe(0)
  const statePath = join(value.root, 'control/gate.json')
  const record = JSON.parse(readFileSync(statePath, 'utf8'))
  writeFileSync(statePath, JSON.stringify({ ...record, mode: 'open', buildId, installed: { buildId, image: `sha256:${'d'.repeat(64)}`, installedAt: Date.now() } }))
  const authority = join(value.temporary, 'closed.json')
  writeFileSync(authority, JSON.stringify({ receipt: { action: 'close', generationId: generation, targetOrigin: value.config.origin, targetId: value.config.targetId, completedAt: Date.now() } }))
  writeFileSync(value.fail, 'stop')
  const result = value.invoke('maintain', '--expected-current', buildId, '--authority-receipt', authority)
  expect(result.status).not.toBe(0)
  expect(JSON.parse(readFileSync(statePath, 'utf8')).mode).toBe('maintenance')
  expect(value.calls()).not.toMatch(/(?:start|restart).*app/)
  expect(value.calls()).not.toContain('caddy')
  expect(value.calls()).toContain(' stop --timeout 90 app')
})

it.each(['database', 'bucket', 'validation', 'credentials', 'bug-report', 'unsealed-host'])('rejects mismatched %s environment before any Docker action', field => {
  const value = fixture()
  const appPath = join(value.root, '.env'), toolPath = join(value.root, 'data/dependencies.compose.env')
  if (field === 'database') writeFileSync(appPath, readFileSync(appPath, 'utf8').replace('/oa_prerelease_test', '/agricola'))
  if (field === 'bucket') writeFileSync(appPath, readFileSync(appPath, 'utf8').replace('S3_BUCKET=oa-prerelease-test', 'S3_BUCKET=agricola'))
  if (field === 'validation') writeFileSync(toolPath, readFileSync(toolPath, 'utf8').replace('/oa_prerelease_test_validation', '/oa_prerelease_test'))
  if (field === 'credentials') writeFileSync(appPath, readFileSync(appPath, 'utf8') + 'GH_TOKEN=never-copy-this\n')
  if (field === 'bug-report') writeFileSync(appPath, readFileSync(appPath, 'utf8') + 'BUG_REPORT_GITHUB_PRIVATE_KEY=never-copy-this\n')
  if (field === 'unsealed-host') writeFileSync(appPath, readFileSync(appPath, 'utf8').replace('127.0.0.1/oa_', 'another-server/oa_'))
  const result = value.invoke('initialize', '--expected-current', 'empty', '--generation', 'bb4d6c82-676f-4dcc-a570-52377b3b32f5')
  expect(result.status).not.toBe(0)
  expect(value.calls()).toBe('')
  expect(existsSync(join(value.root, 'control'))).toBe(false)
  expect(result.stderr).not.toContain('never-copy-this')
})


// Public SSH receiver + real flock/FS/git/child processes. Docker is a command
// harness here; native storage and gateway/browser checks are separate evidence.
it('journals migration/startup failures closed and resumes the same candidate without a second migration', () => {
  const value = fixture(), buildId = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', operationId = 'db4d6c82-676f-4dcc-a570-52377b3b32f5'
  const authorityFile = join(value.temporary, 'close.json')
  writeFileSync(authorityFile, JSON.stringify({ receipt: { action: 'close', generationId: generation, targetOrigin: value.config.origin,
    targetId: value.config.targetId, completedAt: Date.now() } }))
  writeFileSync(join(value.bin, 'docker'), `#!/bin/sh
set -e
printf '%s\n' "$*" >> '${value.temporary}/calls'
case "$*" in
  'buildx build '*) cat >/dev/null;;
  'buildx inspect '*) printf '${JSON.stringify({ Driver: 'remote', Nodes: [{ Endpoint: `docker-container://${value.config.builder.container}` }] })}';;
  *'{{json .Config.Labels}}'*'${value.config.builder.container}') printf '{"org.open-agricola.environment":"prerelease-test"}';;
  *'{{json .HostConfig}}'*) printf '{"Privileged":false,"Memory":268435456,"NanoCpus":500000000,"PidsLimit":64}';;
  *'{{json .State}}'*'${value.config.builder.container}') printf '{"Running":true}';;
  *'{{json .State}}'*) printf '{"Running":false,"OOMKilled":false,"ExitCode":0}';;
  *' ps -a -q app') printf '${'c'.repeat(64)}';;
  *'{{.Image}}'*) printf 'sha256:${'d'.repeat(64)}';;
  *'com.docker.compose.project'*) printf '${value.config.project}';;
  *'{{json .Config}}'*) printf '{"User":"1000:1000"}';;
  *'{{json .Mounts}}'*) printf '[]';;
  'image inspect --format {{json .Config.Labels}}'*) printf '{"org.opencontainers.image.revision":"${buildId}","io.open-agricola.release-channel":"prerelease"}';;
  'image inspect --format {{.Id}}'*) printf 'sha256:${'d'.repeat(64)}';;
  *'/app/frontend-dist/frontend-build.json'*) printf '{"format":1,"gameBuildId":"${buildId}","basePath":"/open-agricola/","releaseChannel":"prerelease","deploymentTarget":"prerelease-hosted"}';;
  *'check-live '*) [ ! -f '${value.temporary}/migration-fail' ] || exit 42;;
  *' up -d --no-build --wait --wait-timeout 120 app') [ ! -f '${value.temporary}/startup-fail' ] || exit 43;;
  *' exec -T app node '*) printf '{"buildId":"${buildId}","channel":"prerelease","generation":"${generation}"}';;
esac
`, { mode: 0o700 })
  const request = { action: 'deploy', expectedCurrent: 'empty', buildId, generation, operationId, authorityFile }
  const invoke = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prerelease/operations.ts', 'receive'], {
    input: JSON.stringify({ policySha: buildId, expiresAt: Date.now() + 300000, fingerprint: targetFingerprint(parsePrereleaseTarget(value.config)),
      target: value.config, request, receipt: { status: 'passed', channel: 'prerelease', repository: 'titanxxh/open-agricola', sha: buildId,
        configuration: 'e'.repeat(64), producerConfiguration: 'f'.repeat(64), tasks: FULL_TASK_IDS.map((id, index) => ({ id, status: 'passed', runId: 1, jobId: index + 1 })) } }),
    encoding: 'utf8', timeout: 30000, env: { ...process.env, CI: '', SSH_CONNECTION: 'owner fixture', PATH: `${value.bin}:${process.env.PATH}` },
  })
  writeFileSync(join(value.temporary, 'migration-fail'), '')
  const migration = invoke()
  expect(migration.status, migration.stderr).not.toBe(0)
  expect(existsSync(join(value.root, 'control/gate.json')), migration.stderr).toBe(true)
  const state = () => JSON.parse(readFileSync(join(value.root, 'control/gate.json'), 'utf8'))
  expect(state()).toMatchObject({ mode: 'maintenance', buildId: null, operation: { stage: 'migration', id: operationId } })
  rmSync(join(value.temporary, 'migration-fail')); writeFileSync(join(value.temporary, 'startup-fail'), '')
  const startup = invoke()
  expect(startup.status, startup.stderr).not.toBe(0)
  expect(state()).toMatchObject({ mode: 'maintenance', buildId, operation: { stage: 'startup' } })
  const migrations = value.calls().split('check-live').length
  rmSync(join(value.temporary, 'startup-fail'))
  const completed = invoke()
  expect(completed.status, completed.stderr).toBe(0)
  expect(state()).toMatchObject({ mode: 'maintenance', buildId, operation: { stage: 'acceptance' } })
  expect(value.calls().split('check-live')).toHaveLength(migrations)
  expect(value.calls()).toContain('/app/frontend-dist/frontend-build.json')
  expect(value.calls()).not.toContain('caddy')
})


it.each(['control', 'output', 'backups'])('rejects a %s mount alias into formal files before state or Docker', name => {
  const value = fixture(), formal = join(value.temporary, 'formal-private')
  mkdirSync(formal); writeFileSync(join(formal, 'untouched'), 'formal bytes')
  symlinkSync(formal, join(value.root, name))
  const result = value.invoke('initialize', '--expected-current', 'empty', '--generation', 'bb4d6c82-676f-4dcc-a570-52377b3b32f5')
  expect(result.status).not.toBe(0)
  expect(value.calls()).toBe('')
  expect(readFileSync(join(formal, 'untouched'), 'utf8')).toBe('formal bytes')
  expect(existsSync(join(formal, 'gate.json'))).toBe(false)
})

it('keeps the seven-day archive cap after closure without credentials or Docker, preserving the independent ledger', () => {
  const value = fixture(), generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5'
  expect(value.invoke('initialize', '--expected-current', 'empty', '--generation', generation).status).toBe(0)
  const path = join(value.root, 'control/gate.json'), record = JSON.parse(readFileSync(path, 'utf8'))
  writeFileSync(path, JSON.stringify({ ...record, mode: 'closed' }))
  const backups = join(value.root, 'backups'); mkdirSync(backups)
  for (const name of ['pre-expired.tgz', 'env-pre-expired', 'pre-expired.manifest.json']) {
    writeFileSync(join(backups, name), 'old private bytes')
    const old = new Date(Date.now() - 8 * 86400_000); utimesSync(join(backups, name), old, old)
  }
  writeFileSync(join(backups, 'replay-removals.latest.json'), 'independent facts')
  rmSync(join(value.root, '.env')); rmSync(join(value.root, 'data/dependencies.compose.env'))
  writeFileSync(join(value.bin, 'ssh'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${value.temporary}/ssh-calls'\ncat >/dev/null\n`, { mode: 0o700 })
  const calls = value.calls(), result = value.invoke('retention', '--expected-current', 'empty')
  expect(result.status, result.stderr).toBe(0)
  expect(existsSync(join(backups, 'pre-expired.tgz'))).toBe(false)
  expect(readFileSync(join(backups, 'replay-removals.latest.json'), 'utf8')).toBe('independent facts')
  expect(value.calls()).toBe(calls)
  expect(readFileSync(join(value.temporary, 'ssh-calls'), 'utf8')).toContain('backup-fixture bash -s -- /srv/backups/open-agricola-prerelease-test 7')
})

it('rejects whole-host cleanup requests before creating state or running tools', () => {
  const value = fixture(), result = value.invoke('cleanup', '--expected-current', 'empty')
  expect(result.status).not.toBe(0)
  expect(existsSync(join(value.root, 'control'))).toBe(false)
  expect(value.calls()).toBe('')
})
