import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, renameSync, symlinkSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { FULL_TASK_IDS } from '../ci/verification-tasks'
import { targetFingerprint, parsePrereleaseTarget } from '../prerelease/config'
import { readRuntime, writeRuntime, renderCompose } from '../prerelease/runtime'
import type { OperationRequest } from '../prerelease/flow'
import { afterEach, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

function fixture(proxyNetwork?: string) {
  const temporary = mkdtempSync(join(tmpdir(), 'agricola-pre-ops-'))
  roots.push(temporary)
  const root = join(temporary, 'open-agricola-prerelease-test')
  mkdirSync(join(root, 'data'), { recursive: true })
  const config = {
    format: 1, channel: 'prerelease', targetId: 'prerelease-test',
    directory: root, policyDirectory: resolve('.'), project: 'open-agricola-prerelease-test',
    origin: 'https://pre.agricola-beta.test', port: 18575, network: 'open-agricola-prerelease-test-dependencies',
    ...(proxyNetwork === undefined ? {} : { proxyNetwork }),
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
  'ps -q '*) exit 0;;
  *' stop --timeout 90 app') [ ! -f '${temporary}/fail' ] || exit 42;;
  *' ps -a -q app') printf '${'c'.repeat(64)}';;
  *'{{.Image}}'*) printf 'sha256:${'d'.repeat(64)}';;
  *'com.docker.compose.project'*) printf '${config.project}';;
  *'{{json .State}}'*) printf '{"Running":false,"OOMKilled":false,"ExitCode":0}';;
esac
`, { mode: 0o700 })
  const save = () => writeFileSync(path, JSON.stringify(config))
  save()
  const env: NodeJS.ProcessEnv = { ...process.env, CI: '', GITHUB_ACTIONS: '', PATH: `${bin}:${process.env.PATH}` }
  const invoke = (...args: string[]) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prerelease/operations.ts', ...args, '--config', path], { encoding: 'utf8', env, timeout: 15000 })
  return { root, config, save, invoke, env, bin, temporary, fail: join(temporary, 'fail'), calls: () => existsSync(join(temporary, 'calls')) ? readFileSync(join(temporary, 'calls'), 'utf8') : '' }
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
  expect(compose.networks).toEqual({ default: {} })
  expect(compose.services.gateway.networks).toEqual(['default'])
  expect(compose.services.gateway.ports).toEqual(['127.0.0.1:18575:5176'])
  expect(compose.services.gateway.volumes.some((value: string) => value.includes('.env'))).toBe(false)
  expect(parsePrereleaseTarget(value.config)).not.toHaveProperty('proxyNetwork')
})

it('connects only the trusted gateway to the sealed proxy network for maintenance and installed candidates', () => {
  const value = fixture(), target = parsePrereleaseTarget({ ...value.config, proxyNetwork: 'open-agricola_default' })
  const maintenance = readRuntime(target), buildId = 'a'.repeat(40), image = `sha256:${'d'.repeat(64)}`
  for (const record of [maintenance, { ...maintenance, buildId, installed: { buildId, image, installedAt: 1 } }]) {
    const composed = renderCompose(target, record)
    expect(composed.networks).toMatchObject({ proxy: { external: true, name: 'open-agricola_default' } })
    expect(composed.services.gateway.networks).toEqual({ default: {}, proxy: { aliases: ['prerelease-53aee54473ffcde6b9d906b12e5f0413-gateway'] } })
    expect(composed.services.gateway.ports).toEqual(['127.0.0.1:18575:5176'])
    if ('app' in composed.services && composed.services.app) {
      expect(composed.services.app.networks).toEqual({ default: { aliases: ['prerelease-test-app'] }, dependencies: {} })
      for (const service of [composed.services.tools, composed.services.migrate, composed.services.capture]) {
        expect(service.networks).toEqual(['dependencies'])
      }
    } else expect(Object.keys(composed.services)).toEqual(['gateway'])
  }
  const otherOrigin = parsePrereleaseTarget({ ...value.config, proxyNetwork: target.proxyNetwork, origin: 'https://other.agricola-beta.test' })
  expect(renderCompose(otherOrigin, readRuntime(otherOrigin)).services.gateway.networks).not.toEqual(renderCompose(target, maintenance).services.gateway.networks)
})

it.each(['open-agricola-prerelease-test-dependencies', 'open-agricola-prerelease-test_default', 'host', 'none', 'bridge', 'invalid network'])('rejects proxy network %s before changing runtime or invoking Docker', proxyNetwork => {
  const value = fixture()
  writeFileSync(join(value.temporary, 'target.json'), JSON.stringify({ ...value.config, proxyNetwork }))
  const result = value.invoke('initialize', '--expected-current', 'empty', '--generation', 'bb4d6c82-676f-4dcc-a570-52377b3b32f5')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('proxy network')
  expect(value.calls()).toBe('')
  expect(existsSync(join(value.root, 'control'))).toBe(false)
})

it('recreates the maintenance route from owner configuration and rejects changing its sealed proxy network', () => {
  const value = fixture(), config = { ...value.config, proxyNetwork: 'open-agricola_default' }
  writeFileSync(join(value.temporary, 'target.json'), JSON.stringify(config))
  const plan = value.invoke('plan')
  expect(plan.status, plan.stderr).toBe(0)
  expect(JSON.parse(plan.stdout).proxyUpstream).toBe('prerelease-53aee54473ffcde6b9d906b12e5f0413-gateway:5176')
  const initialize = () => value.invoke('initialize', '--expected-current', 'empty', '--generation', 'bb4d6c82-676f-4dcc-a570-52377b3b32f5')
  const first = initialize()
  expect(first.status, first.stderr).toBe(0)
  writeFileSync(join(value.root, 'control/compose.json'), '{}')
  const retry = initialize()
  expect(retry.status, retry.stderr).toBe(0)
  const composed = JSON.parse(readFileSync(join(value.root, 'control/compose.json'), 'utf8'))
  expect(Object.keys(composed.services)).toEqual(['gateway'])
  expect(composed.networks).toEqual({ default: {}, proxy: { external: true, name: config.proxyNetwork } })
  expect(composed.services.gateway.networks).toEqual({ default: {}, proxy: { aliases: ['prerelease-53aee54473ffcde6b9d906b12e5f0413-gateway'] } })
  expect(value.calls()).toContain('up -d --no-build gateway')
  expect(value.calls()).not.toMatch(/buildx|migrate|up.*app/)
  const record = readRuntime(parsePrereleaseTarget(config))
  expect(record.mode).toBe('maintenance')
  for (const changed of [value.config, { ...config, proxyNetwork: 'another-proxy' }]) {
    const target = parsePrereleaseTarget(changed)
    expect(targetFingerprint(target)).not.toBe(record.fingerprint)
    expect(() => readRuntime(target)).toThrow('sealed prerelease target')
  }
})

it('revalidates a changed formal deployment without reinstalling pre or changing its generation', () => {
  const value = fixture(), target = parsePrereleaseTarget(value.config)
  const buildId = 'a'.repeat(40), image = `sha256:${'d'.repeat(64)}`, generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5'
  const operationId = 'cb4d6c82-676f-4dcc-a570-52377b3b32f5'
  writeRuntime(target, { ...readRuntime(target), generation, buildId, installed: { buildId, image, installedAt: 1 }, mode: 'open',
    acceptance: { acceptedAt: Date.now(), sha256: 'f'.repeat(64), formalBuildId: 'b'.repeat(40) } })
  const authority = join(value.temporary, 'closed.json')
  writeFileSync(authority, JSON.stringify({ receipt: { action: 'close', generationId: generation, targetOrigin: target.origin, targetId: target.targetId, completedAt: Date.now() } }))
  const invoke = () => value.invoke('reverify', '--expected-current', buildId, '--operation-id', operationId, '--authority-receipt', authority)
  const result = invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(readRuntime(target)).toMatchObject({ mode: 'maintenance', generation, buildId, installed: { buildId, image, installedAt: 1 },
    acceptance: null, operation: { id: operationId, kind: 'reverify', stage: 'acceptance', buildId, image, generation } })
  expect(invoke().status).toBe(0)
  expect(value.calls()).not.toMatch(/buildx|migrate|stop.*app|restart.*app/)
})

it('keeps the identity service key in the app and excludes it from migration and capture processes', () => {
  const value = fixture(), target = parsePrereleaseTarget(value.config), buildId = 'a'.repeat(40), image = `sha256:${'d'.repeat(64)}`
  writeFileSync(join(value.root, '.env'), readFileSync(join(value.root, '.env'), 'utf8') + 'PRERELEASE_IDENTITY_SERVICE_KEY=target-app-only-fixture\n')
  const composed = renderCompose(target, { ...readRuntime(target), buildId, installed: { buildId, image, installedAt: 1 } })
  if (!('app' in composed.services) || !composed.services.app || !composed.services.migrate || !composed.services.capture) throw new Error('Expected installed candidate services')
  expect(composed.services.app.env_file).toEqual([join(value.root, '.env')])
  for (const service of [composed.services.migrate, composed.services.capture]) {
    expect(service.environment).toMatchObject({ DATABASE_URL: 'postgres://oa_prerelease_test_app:fixture@127.0.0.1/oa_prerelease_test' })
    expect(service.environment).not.toHaveProperty('PRERELEASE_IDENTITY_SERVICE_KEY')
    expect(service).not.toHaveProperty('env_file')
  }
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
  'ps -q '*) exit 0;;
  'start '*) touch '${value.temporary}/builder-running-'"$2";;
  'stop --timeout 30 '*) rm -f '${value.temporary}/builder-running-'"$4";;
  'buildx build '*) cat >/dev/null;;
  'buildx inspect '*) exit 125;;
  'buildx ls --format {{json .Builder}}') printf '%s\n' '${JSON.stringify({ Name: value.config.builder.name, Driver: 'remote', Nodes: [{ Name: 'prerelease-test0', Endpoint: `docker-container://${value.config.builder.container}` }] })}' '${JSON.stringify({ Name: value.config.builder.name, Driver: 'remote', Nodes: [{ Name: 'prerelease-test0', Endpoint: `docker-container://${value.config.builder.container}` }] })}';;
  *'{{json .Config.Labels}}'*'${value.config.builder.container}') printf '{"org.open-agricola.environment":"prerelease-test"}';;
  *'{{json .HostConfig}}'*) printf '{"Privileged":false,"Memory":268435456,"NanoCpus":500000000,"PidsLimit":64}';;
  *'{{json .State}}'*'${value.config.builder.container}') if [ -f '${value.temporary}/builder-running-${value.config.builder.container}' ]; then printf '{"Running":true}'; else printf '{"Running":false}'; fi;;
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
    encoding: 'utf8', timeout: 30000, env: { ...value.env, SSH_CONNECTION: 'owner fixture' },
  })
  writeFileSync(join(value.temporary, 'migration-fail'), '')
  const migration = invoke()
  expect(migration.status, migration.stderr).not.toBe(0)
  expect(existsSync(join(value.root, 'control/gate.json')), migration.stderr).toBe(true)
  const state = () => JSON.parse(readFileSync(join(value.root, 'control/gate.json'), 'utf8'))
  expect(state()).toMatchObject({ mode: 'maintenance', buildId: null, operation: { stage: 'migration', id: operationId } })
  expect(existsSync(join(value.root, 'control', `policy-${buildId}`, 'node_modules'))).toBe(true)
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


function startupRetryFixture(sourceInstalled = true, sameBuild = false, proxyNetwork?: string) {
  const value = fixture(proxyNetwork), target = parsePrereleaseTarget(value.config)
  const buildId = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const image = `sha256:${'e'.repeat(64)}`, sourceBuildId = sameBuild ? buildId : 'a'.repeat(40)
  const sourceImage = sameBuild ? image : `sha256:${'d'.repeat(64)}`
  const policyImage = `sha256:${'f'.repeat(64)}`
  const generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', operationId = 'db4d6c82-676f-4dcc-a570-52377b3b32f5'
  expect(value.invoke('initialize', '--expected-current', 'empty', '--generation', generation).status).toBe(0)
  const state = () => readRuntime(target)
  const containerImage = join(value.temporary, 'container-image'), containerState = join(value.temporary, 'container-state')
  writeFileSync(containerState, '{"Running":false,"OOMKilled":false,"ExitCode":0}')
  if (sourceInstalled) {
    writeRuntime(target, { ...state(), mode: 'open', buildId: sourceBuildId,
      installed: { buildId: sourceBuildId, image: sourceImage, installedAt: Date.now() },
      acceptance: { acceptedAt: Date.now(), sha256: 'f'.repeat(64), formalBuildId: null } })
    writeFileSync(containerImage, sourceImage)
    const backups = join(value.root, 'backups'), stem = `pre-${operationId}`
    const capture = join(value.temporary, 'capture'); mkdirSync(capture)
    writeFileSync(join(capture, 'database.dump'), 'fixture database snapshot')
    writeFileSync(join(capture, 'archive.json'), JSON.stringify({ version: 1, sourceBuildId, createdAt: new Date().toISOString(), objects: [] }))
    execFileSync('tar', ['-czf', join(backups, `${stem}.tgz`), '-C', capture, '.'])
    const archive = readFileSync(join(backups, `${stem}.tgz`)), configuration = Buffer.from('fixture configuration')
    writeFileSync(join(backups, `env-${stem}`), configuration)
    const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
    writeFileSync(join(backups, `${stem}.manifest.json`), JSON.stringify({ formatVersion: 2, backupStem: stem,
      environment: target.targetId, retentionDays: 7, dataGeneration: generation, targetFingerprint: targetFingerprint(target),
      createdAt: new Date().toISOString(), validatedAt: new Date().toISOString(), sourceBuildId, targetBuildId: buildId,
      archiveSizeBytes: archive.length, archiveSha256: digest(archive), configurationSizeBytes: configuration.length, configurationSha256: digest(configuration) }))
  }
  const authorityFile = join(value.temporary, 'close.json')
  writeFileSync(authorityFile, JSON.stringify({ action: 'close', generationId: generation, targetOrigin: target.origin,
    targetId: target.targetId, completedAt: Date.now() }))
  writeFileSync(join(value.bin, 'bash'), `#!/bin/sh
if [ "$1" = -euo ]; then exec /bin/bash "$@"; fi
[ "$1" = '${process.cwd()}/backup-offsite.sh' ] || exit 88
`, { mode: 0o700 })
  writeFileSync(join(value.bin, 'docker'), `#!/bin/sh
set -e
printf '%s\n' "$*" >> '${value.temporary}/calls'
case "$*" in
  'ps -q '*) exit 0;;
  'start '*) touch '${value.temporary}/builder-running-'"$2";;
  'stop --timeout 30 '*) rm -f '${value.temporary}/builder-running-'"$4";;
  'buildx build '*) cat >/dev/null;;
  'buildx ls --format {{json .Builder}}') printf '${JSON.stringify({ Name: target.builder.name, Driver: 'remote', Nodes: [{ Endpoint: `docker-container://${target.builder.container}` }] })}';;
  *'{{json .Config.Labels}}'*'${target.builder.container}') printf '{"org.open-agricola.environment":"${target.targetId}"}';;
  *'{{json .HostConfig}}'*) printf '{"Privileged":false,"Memory":268435456,"NanoCpus":500000000,"PidsLimit":64}';;
  *'{{json .State}}'*'${target.builder.container}') if [ -f '${value.temporary}/builder-running-${target.builder.container}' ]; then printf '{"Running":true}'; else printf '{"Running":false}'; fi;;
  *'{{json .State}}'*) cat '${containerState}';;
  *' ps -a -q app') if [ -f '${containerImage}' ]; then printf '${'c'.repeat(64)}'; fi;;
  *'{{.Image}}'*) cat '${containerImage}';;
  *'com.docker.compose.project'*) if [ -f '${value.temporary}/container-project' ]; then cat '${value.temporary}/container-project'; else printf '${target.project}'; fi;;
  *'{{json .Config}}'*) printf '{"User":"1000:1000"}';;
  *'{{json .Mounts}}'*) printf '[]';;
  'image inspect --format {{json .Config.Labels}}'*)
    case "$*" in *'${policyImage}'*) channel=stable;; *) channel=prerelease;; esac
    printf '{"org.opencontainers.image.revision":"${buildId}","io.open-agricola.release-channel":"%s"}' "$channel";;
  'image inspect --format {{.Id}}'*)
    case "$*" in *'-policy:'*|*'${policyImage}'*) printf '${policyImage}';; *) printf '${image}';; esac;;
  *'/app/frontend-dist/frontend-build.json'*)
    case "$*" in *'${policyImage}'*) channel=stable;; *) channel=prerelease;; esac
    printf '{"format":1,"gameBuildId":"${buildId}","basePath":"/open-agricola/","releaseChannel":"%s","deploymentTarget":"%s-hosted"}' "$channel" "$channel";;
  *' up -d --no-build --wait --wait-timeout 120 app')
    [ ! -f '${value.temporary}/startup-fail' ] || exit 43
    printf '${image}' > '${containerImage}';;
  *' exec -T app node '*) printf '{"buildId":"${buildId}","channel":"prerelease","generation":"${generation}"}';;
esac
`, { mode: 0o700 })
  const invoke = () => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prerelease/operations.ts', 'receive'], {
    input: JSON.stringify({ policySha: buildId, expiresAt: Date.now() + 300000, fingerprint: targetFingerprint(target), target,
      request: { action: 'deploy', expectedCurrent: sourceInstalled ? sourceBuildId : 'empty', buildId, generation, operationId, authorityFile },
      receipt: { status: 'passed', channel: 'prerelease', repository: 'titanxxh/open-agricola', sha: buildId,
        configuration: 'e'.repeat(64), producerConfiguration: 'f'.repeat(64), tasks: FULL_TASK_IDS.map((id, index) => ({ id, status: 'passed', runId: 1, jobId: index + 1 })) } }),
    encoding: 'utf8', timeout: 30000, env: { ...value.env, SSH_CONNECTION: 'owner fixture' },
  })
  writeFileSync(join(value.temporary, 'startup-fail'), '')
  const interrupted = invoke()
  expect(interrupted.status, interrupted.stderr).not.toBe(0)
  expect(state()).toMatchObject({ mode: 'maintenance', buildId, operation: { stage: 'startup', id: operationId } })
  rmSync(join(value.temporary, 'startup-fail'))
  return { ...value, invoke, state, sourceImage, image, containerImage, containerState, generation, operationId, authorityFile }
}

it('retries the startup journal after migration while the drained source container still exists', () => {
  const value = startupRetryFixture()
  expect(value.state().operation?.sourceImage).toBe(value.sourceImage)
  expect(readFileSync(value.containerImage, 'utf8')).toBe(value.sourceImage)
  const migrations = value.calls().split('check-live').length
  const result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(value.state()).toMatchObject({ mode: 'maintenance', operation: { stage: 'acceptance' } })
  expect(readFileSync(value.containerImage, 'utf8')).toBe(value.image)
  expect(value.calls().split('check-live')).toHaveLength(migrations)
})

it.each(['empty', 'candidate', 'same-image'])('retries an unaccepted startup when container state is %s', kind => {
  const value = startupRetryFixture(kind !== 'empty', kind === 'same-image')
  if (kind !== 'empty') {
    writeFileSync(value.containerImage, value.image)
    writeFileSync(value.containerState, '{"Running":false,"OOMKilled":false,"ExitCode":43}')
  }
  const result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(value.state()).toMatchObject({ mode: 'maintenance', operation: { stage: 'acceptance' } })
})

it.each(['foreign-image', 'foreign-project', 'running', 'unclean', 'oom'])('refuses a %s source during startup retry without starting any writer', kind => {
  const value = startupRetryFixture()
  if (kind === 'foreign-image') writeFileSync(value.containerImage, `sha256:${'f'.repeat(64)}`)
  if (kind === 'foreign-project') writeFileSync(join(value.temporary, 'container-project'), 'open-agricola')
  if (kind === 'running') writeFileSync(value.containerState, '{"Running":true,"OOMKilled":false,"ExitCode":0}')
  if (kind === 'unclean') writeFileSync(value.containerState, '{"Running":false,"OOMKilled":false,"ExitCode":43}')
  if (kind === 'oom') writeFileSync(value.containerState, '{"Running":false,"OOMKilled":true,"ExitCode":0}')
  const starts = value.calls().split('up -d --no-build --wait --wait-timeout 120 app').length
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.state()).toMatchObject({ mode: 'maintenance', operation: { stage: 'startup' } })
  expect(value.calls().split('up -d --no-build --wait --wait-timeout 120 app')).toHaveLength(starts)
})

it.each(['normal', 'migration-retry', 'startup-retry'])('cleans restore staging across the %s completion path', completion => {
  const source = startupRetryFixture(true, false, 'open-agricola_default')
  expect(source.invoke().status).toBe(0)
  const replacement = fixture('open-agricola_default'), directory = join(replacement.temporary, 'open-agricola-prerelease-replacement')
  renameSync(replacement.root, directory)
  Object.assign(replacement.config, { directory, targetId: 'prerelease-replacement', project: 'open-agricola-prerelease-replacement',
    network: 'open-agricola-prerelease-replacement-dependencies' })
  for (const value of [replacement.config.database, replacement.config.validationDatabase]) {
    value.name = value.name.replace('prerelease_test', 'prerelease_replacement')
  }
  replacement.config.database.appRole = 'oa_prerelease_replacement_app'; replacement.config.database.backupRole = 'oa_prerelease_replacement_backup'
  replacement.config.validationDatabase.role = 'oa_prerelease_replacement_validator'
  Object.assign(replacement.config.objects, { bucket: 'oa-prerelease-replacement', appKeyId: 'replacement-app', backupKeyId: 'replacement-backup' })
  replacement.config.offsite.directory = '/srv/backups/open-agricola-prerelease-replacement'
  Object.assign(replacement.config.builder, { name: 'prerelease-replacement', container: 'prerelease-replacement-builder' })
  for (const name of ['.env', 'data/dependencies.compose.env']) writeFileSync(join(directory, name), readFileSync(join(directory, name), 'utf8')
    .replaceAll('prerelease_test', 'prerelease_replacement').replaceAll('oa-prerelease-test', 'oa-prerelease-replacement')
    .replaceAll('pre-app', 'replacement-app').replaceAll('pre-backup', 'replacement-backup'))
  replacement.save()
  const target = parsePrereleaseTarget(replacement.config), next = 'cc4d6c82-676f-4dcc-a570-52377b3b32f5'
  const sourceGateway = renderCompose(parsePrereleaseTarget(source.config), source.state()).services.gateway
  expect(renderCompose(target, readRuntime(target)).services.gateway.networks).toEqual(sourceGateway.networks)
  const sourceApp = renderCompose(parsePrereleaseTarget(source.config), source.state()).services.app
  if (!sourceApp) throw new Error('Expected an installed source app')
  expect(sourceApp.networks).toEqual({ default: { aliases: ['prerelease-test-app'] }, dependencies: {} })
  const operationId = 'ec4d6c82-676f-4dcc-a570-52377b3b32f5', stem = `pre-${source.operationId}`
  const script = readFileSync(join(source.bin, 'docker'), 'utf8').replaceAll(source.temporary, replacement.temporary)
    .replaceAll(source.config.targetId, target.targetId).replaceAll(source.generation, next)
    .replace('case "$*" in', `case "$*" in\n  *' restore /backup/restore-'*) [ ! -f '${replacement.temporary}/restore-fail' ] || exit 44;;\n  *' stop --timeout 30 gateway') [ ! -f '${replacement.temporary}/gateway-stop-fail' ] || exit 45;;\nesac\ncase "$*" in`)
  const sourceBuilder = `case "$*" in
  'ps -q '*) exit 0;;
  'buildx ls --format {{json .Builder}}') printf '%s\n' '${JSON.stringify({ Name: source.config.builder.name, Driver: 'remote', Nodes: [{ Endpoint: `docker-container://${source.config.builder.container}` }] })}' '${JSON.stringify({ Name: target.builder.name, Driver: 'remote', Nodes: [{ Endpoint: `docker-container://${target.builder.container}` }] })}'; exit 0;;
  *'{{json .Config.Labels}}'*'${source.config.builder.container}') printf '{"org.open-agricola.environment":"${source.config.targetId}"}'; exit 0;;
  *'{{json .State}}'*'${source.config.builder.container}') if [ -f '${replacement.temporary}/builder-running-${source.config.builder.container}' ]; then printf '{"Running":true}'; else printf '{"Running":false}'; fi; exit 0;;
esac
`
  writeFileSync(join(replacement.bin, 'docker'), script.replace('set -e\n', `set -e\n${sourceBuilder}`), { mode: 0o700 })
  writeFileSync(join(replacement.bin, 'bash'), readFileSync(join(source.bin, 'bash')), { mode: 0o700 })
  writeFileSync(join(source.root, 'backups/replay-removals.latest.json'), '{"version":1,"batches":[]}')
  const point = readFileSync(join(source.root, 'backups', `${stem}.tgz`))
  const buildId = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const request: OperationRequest = { action: 'restore', expectedCurrent: 'empty', buildId, generation: next, operationId,
    sourceTarget: parsePrereleaseTarget(source.config), expectedSourceCurrent: buildId, acceptLoss: source.generation,
    backupStem: stem, backupGeneration: source.generation, authorityFile: source.authorityFile }
  const invoke = (operationTarget = target) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/prerelease/operations.ts', 'receive'], {
    input: JSON.stringify({ policySha: buildId, expiresAt: Date.now() + 300000, fingerprint: targetFingerprint(operationTarget), target: operationTarget, request,
      receipt: { status: 'passed', channel: 'prerelease', repository: 'titanxxh/open-agricola', sha: buildId,
        configuration: 'e'.repeat(64), producerConfiguration: 'f'.repeat(64), tasks: FULL_TASK_IDS.map((id, index) => ({ id, status: 'passed', runId: 1, jobId: index + 1 })) } }),
    encoding: 'utf8', timeout: 30000, env: { ...replacement.env, SSH_CONNECTION: 'owner fixture' },
  })
  if (completion === 'normal') {
    const changedProxy = invoke({ ...target, proxyNetwork: 'another-proxy' })
    expect(changedProxy.status).not.toBe(0)
    expect(changedProxy.stderr).toContain('fixed origin')
    expect(replacement.calls()).toBe('')
  }
  const staging = join(directory, 'backups', `restore-${operationId}`)
  if (completion === 'migration-retry') writeFileSync(join(replacement.temporary, 'restore-fail'), '')
  if (completion === 'startup-retry') writeFileSync(join(replacement.temporary, 'startup-fail'), '')
  let result = invoke()
  if (completion !== 'normal') {
    expect(result.status).not.toBe(0)
    expect(readRuntime(target)).toMatchObject({ mode: 'maintenance', operation: { stage: completion === 'migration-retry' ? 'migration' : 'startup' } })
    if (completion === 'migration-retry') {
      expect(readFileSync(join(staging, 'database.dump'), 'utf8')).toBe('fixture database snapshot')
      expect(JSON.parse(readFileSync(`${staging}.retention.json`, 'utf8')).createdAt)
        .toBe(JSON.parse(readFileSync(join(source.root, 'backups', `${stem}.manifest.json`), 'utf8')).createdAt)
    } else expect(existsSync(staging)).toBe(false)
    rmSync(join(replacement.temporary, completion === 'migration-retry' ? 'restore-fail' : 'startup-fail'))
    result = invoke()
  }
  expect(result.status, result.stderr).toBe(0)
  expect(readRuntime(target)).toMatchObject({ mode: 'maintenance', generation: next, operation: { stage: 'acceptance' } })
  const replacementApp = renderCompose(target, readRuntime(target)).services.app
  if (!replacementApp) throw new Error('Expected an installed replacement app')
  expect(replacementApp.networks).toEqual({ default: { aliases: ['prerelease-replacement-app'] }, dependencies: {} })
  expect(existsSync(staging)).toBe(false)
  expect(existsSync(`${staging}.retention.json`)).toBe(false)
  expect(readFileSync(join(source.root, 'backups', `${stem}.tgz`))).toEqual(point)
  expect(source.state().generation).toBe(source.generation)
  expect(replacement.calls()).not.toContain('up -d --no-build gateway')
  if (completion === 'normal') {
    request.action = 'activate-recovery'
    request.expectedCurrent = buildId
    expect(invoke().status).not.toBe(0)
    expect(replacement.calls()).not.toContain('up -d --no-build gateway')

    const previous = source.state()
    if (!previous.operation) throw new Error('Expected an installed source operation')
    writeRuntime(parsePrereleaseTarget(source.config), { ...previous, mode: 'closed', installed: null,
      operation: { ...previous.operation, kind: 'reset' } })
    const purge = Buffer.from('{}\n')
    writeFileSync(join(source.root, 'backups', `purge-${previous.operation.id}.json`), purge)
    request.retirementFile = join(replacement.temporary, 'retirement.json')
    writeFileSync(request.retirementFile, JSON.stringify({ action: 'retire', generationId: source.generation,
      targetOrigin: target.origin, targetId: source.config.targetId, completedAt: Date.now(),
      purgeReceiptSha256: createHash('sha256').update(purge).digest('hex') }))
    writeFileSync(join(replacement.temporary, 'gateway-stop-fail'), '')
    expect(invoke().status).not.toBe(0)
    expect(replacement.calls()).not.toContain('up -d --no-build gateway')
    rmSync(join(replacement.temporary, 'gateway-stop-fail'))
    const before = replacement.calls()
    const activated = invoke()
    expect(activated.status, activated.stderr).toBe(0)
    const activation = replacement.calls().slice(before.length).trim().split('\n')
    expect(activation).toHaveLength(2)
    expect(activation[0]).toContain(`-p ${source.config.project} stop --timeout 30 gateway`)
    expect(activation[1]).toContain(`-p ${target.project} up -d --no-build gateway`)
  }
}, 15000)

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


it.each(['CI', 'GITHUB_ACTIONS'])('refuses owner initialization in %s before state, Docker, SSH or GitHub effects', flag => {
  const value = fixture()
  value.env[flag] = 'true'
  for (const tool of ['ssh', 'gh']) writeFileSync(join(value.bin, tool), `#!/bin/sh
printf '${tool}\\n' >> '${value.temporary}/calls'
exit 42
`, { mode: 0o700 })
  const result = value.invoke('initialize', '--expected-current', 'empty', '--generation', 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', '--ssh', 'fixture-owner')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('owner-controlled machine, outside CI')
  expect(existsSync(join(value.root, 'control'))).toBe(false)
  expect(value.calls()).toBe('')
})

it.each(['https://sibling.agricola.test', 'https://nested.app.agricola.test'])('plans a distinct same-site pre %s without opening it', origin => {
  const value = fixture(); value.config.origin = origin; value.save()
  const result = value.invoke('plan')
  expect(result.status, result.stderr).toBe(0)
  expect(value.calls()).toBe('')
  expect(existsSync(join(value.root, 'control'))).toBe(false)
})
it('rejects a shared hostname even when the port or final DNS dot differs', () => {
  const value = fixture()
  for (const origin of ['https://app.agricola.test', 'https://api.agricola.test:8443', 'https://api.agricola.test.:8443']) {
    expect(() => parsePrereleaseTarget({ ...value.config, origin })).toThrow('different hostname')
  }
  expect(() => parsePrereleaseTarget({ ...value.config, origin: 'https://api.agricola.test',
    formal: { ...value.config.formal, apiOrigin: 'https://api.agricola.test.' } })).toThrow('different hostname')
})

function ownerBackupFixture() {
  const value = fixture(), target = parsePrereleaseTarget(value.config)
  const buildId = 'a'.repeat(40), image = `sha256:${'d'.repeat(64)}`, generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5'
  writeRuntime(target, { ...readRuntime(target), generation, buildId, installed: { buildId, image, installedAt: 1 }, mode: 'open' })
  const tools = [
    { id: 'e'.repeat(64), environment: target.targetId, run: 'abandoned-run', deadline: String(Date.now() - 60_000), service: 'tools', oneoff: 'True', removed: false },
    { id: 'f'.repeat(64), environment: 'stable', run: 'foreign-run', deadline: '0', service: 'app', oneoff: 'True', removed: false },
  ]
  const state = { tools, failRemove: false, retainAfterRemove: false }
  const statePath = join(value.temporary, 'tools.json'), completed = join(value.temporary, 'backup-completed')
  const save = () => writeFileSync(statePath, JSON.stringify(state))
  save()
  writeFileSync(join(value.bin, 'bash'), `#!/bin/sh
if [ "$1" = '${process.cwd()}/backup-offsite.sh' ]; then printf complete > '${completed}'; else exec /bin/bash "$@"; fi
`, { mode: 0o700 })
  writeFileSync(join(value.bin, 'docker'), String.raw`#!${process.execPath}
const fs=require('node:fs'), args=process.argv.slice(2), line=args.join(' '), file=${JSON.stringify(statePath)};
const state=JSON.parse(fs.readFileSync(file,'utf8'));
fs.appendFileSync(${JSON.stringify(join(value.temporary, 'calls'))},line+'\n');
const output=value=>process.stdout.write(typeof value==='string'?value:JSON.stringify(value));
if(args[0]==='ps') {
  if(line.includes('com.docker.compose.service=app'))output('${'c'.repeat(64)}');
  else {
    const filters=args.filter((_,i)=>args[i-1]==='--filter');
    const selected=state.tools.filter(t=>!t.removed && filters.every(f=>{
      if(f.startsWith('id='))return t.id===f.slice(3);
      if(f.startsWith('label=org.open-agricola.backup.environment='))return t.environment===f.split('=').slice(2).join('=');
      if(f==='label=org.open-agricola.backup.run')return t.run!=='';
      if(f.startsWith('label=org.open-agricola.backup.run='))return t.run===f.split('=').slice(2).join('=');
      return false;
    })); output(selected.map(t=>t.id).join('\n'));
  }
} else if(args[0]==='inspect') {
  const tool=state.tools.find(t=>t.id===args.at(-1)), format=args[2];
  if(tool) {
    const labels={'org.open-agricola.backup.environment':tool.environment,'org.open-agricola.backup.run':tool.run,'org.open-agricola.backup.deadline':tool.deadline,'com.docker.compose.service':tool.service,'com.docker.compose.oneoff':tool.oneoff};
    if(format==='{{json .Config.Labels}}')output(labels);
    else {const match=format.match(/index .Config.Labels "([^"]+)"/);if(match)output(labels[match[1]]??'<no value>');}
  } else if(format==='{{.Image}}')output(${JSON.stringify(image)});
  else if(format==='{{json .}}')output({Image:${JSON.stringify(image)},State:{Running:true},HostConfig:{Memory:536870912},Config:{Labels:{'com.docker.compose.project':${JSON.stringify(target.project)},'com.docker.compose.service':'app'}}});
  else if(format.includes('com.docker.compose.project'))output(${JSON.stringify(target.project)});
} else if(args[0]==='rm') {
  if(state.failRemove)process.exit(42);
  if(!state.retainAfterRemove)for(const tool of state.tools)if(args.includes(tool.id))tool.removed=true;
  fs.writeFileSync(file,JSON.stringify(state));
} else if(args[0]==='compose' && line.endsWith('ps -a -q app'))output('${'c'.repeat(64)}');
else if(line.includes('exec -T app node'))output({buildId:${JSON.stringify(buildId)},channel:'prerelease',generation:${JSON.stringify(generation)}});
`, { mode: 0o700 })
  return { ...value, target, state, save, completed, backup: () => value.invoke('backup', '--expected-current', buildId),
    remaining: () => JSON.parse(readFileSync(statePath, 'utf8')).tools.filter((tool: { removed: boolean }) => !tool.removed) }
}

it('reaps an expired owned tool before public online backup capacity admission', () => {
  const value = ownerBackupFixture()
  const result = value.backup()
  expect(result.status, result.stderr).toBe(0)
  expect(existsSync(value.completed)).toBe(true)
  expect(value.remaining()).toEqual([value.state.tools[1]])
  expect(value.calls()).toContain(`rm -f ${'e'.repeat(64)}`)
  expect(value.calls()).not.toMatch(/stop.*app|restart.*app|rm -f c{64}|rm -f f{64}/)
})


it.each(['live', 'missing-run', 'bad-run', 'missing-deadline', 'bad-deadline', 'oversized-deadline', 'managed-app'])('preserves a %s container and refuses public backup overlap', kind => {
  const value = ownerBackupFixture(), tool = value.state.tools[0]
  if (kind === 'live') tool.deadline = String(Date.now() + 60_000)
  if (kind === 'missing-run') tool.run = ''
  if (kind === 'bad-run') tool.run = 'invalid run'
  if (kind === 'missing-deadline') tool.deadline = ''
  if (kind === 'bad-deadline') tool.deadline = 'invalid'
  if (kind === 'oversized-deadline') tool.deadline = '999999999999999999999'
  if (kind === 'managed-app') { tool.service = 'app'; tool.oneoff = 'False' }
  value.save()
  const result = value.backup()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('builder and other tools to be stopped')
  expect(existsSync(value.completed)).toBe(false)
  expect(value.remaining()).toEqual(value.state.tools)
  expect(value.calls()).not.toMatch(/rm -f|stop.*app|restart.*app/)
})

it('leaves foreign expired tools untouched when public backup has no owned overlap', () => {
  const value = ownerBackupFixture()
  value.state.tools[0].environment = 'prerelease-other'; value.save()
  const result = value.backup()
  expect(result.status, result.stderr).toBe(0)
  expect(existsSync(value.completed)).toBe(true)
  expect(value.remaining()).toEqual(value.state.tools)
  expect(value.calls()).not.toMatch(/rm -f|stop.*app|restart.*app/)
})

it.each(['failed-remove', 'still-present'])('fails public backup closed after %s expired tool cleanup', failure => {
  const value = ownerBackupFixture()
  if (failure === 'failed-remove') value.state.failRemove = true
  else value.state.retainAfterRemove = true
  value.save()
  const result = value.backup()
  expect(result.status).not.toBe(0)
  expect(existsSync(value.completed)).toBe(false)
  expect(value.remaining()).toEqual(value.state.tools)
  expect(value.calls()).toContain(`rm -f ${'e'.repeat(64)}`)
  expect(value.calls()).not.toMatch(/scripts\/prerelease\/storage.ts inspect|stop.*app|restart.*app|rm -f c{64}|rm -f f{64}/)
})
