import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, linkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { taskCommands } from '../ci/verification-tasks'
import { collectCandidateDiagnostics, displayCandidateLog, verifyCandidateSources, escapeWorkflowCommands, candidateEnvironment } from '../ci/candidate-isolation'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-ci-isolation-')); roots.push(root)
  const source = join(root, 'source'), work = join(root, 'work'), output = join(root, 'private')
  for (const path of [source, work, output]) mkdirSync(path, { mode: 0o700 })
  const git = (...args: string[]) => execFileSync('git', args, { cwd: source, encoding: 'utf8', stdio: 'pipe' }).trim()
  git('init'); git('config', 'user.name', 'Isolation'); git('config', 'user.email', 'isolation@example.test')
  writeFileSync(join(source, 'source.txt'), 'fixed source\n'); writeFileSync(join(source, '.gitignore'), 'output/\nnode_modules/\n')
  git('add', '.'); git('commit', '-m', 'source')
  execFileSync('cp', ['-a', source + '/.', work])
  return { root, source, work, output, sha: git('rev-parse', 'HEAD') }
}
it('checks fixed source bytes without consuming writable candidate Git callbacks', () => {
  const value = fixture(), marker = join(value.root, 'inert-marker')
  writeFileSync(join(value.work, '.git/config'), `[core]\nfsmonitor = touch ${marker}\n`)
  verifyCandidateSources(value.source, value.work, value.sha)
  expect(() => readFileSync(marker)).toThrow()
  writeFileSync(join(value.work, 'source.txt'), 'changed\n')
  expect(() => verifyCandidateSources(value.source, value.work, value.sha)).toThrow(/source.txt/)
})
it('collects only regular independent diagnostics, refusing symlink directories and hardlinks', () => {
  const value = fixture()
  mkdirSync(join(value.work, 'output/verification'), { recursive: true })
  const sentinel = join(value.root, 'sentinel'); writeFileSync(sentinel, 'private inert bytes')
  writeFileSync(join(value.work, 'output/verification/result.json'), '{"completed":true}')
  symlinkSync(sentinel, join(value.work, 'output/verification/link.json'))
  linkSync(sentinel, join(value.work, 'output/verification/hard.json'))
  symlinkSync(value.root, join(value.work, 'output/playwright'))
  collectCandidateDiagnostics(value.work, value.output)
  expect(readFileSync(join(value.output, 'output/verification/result.json'), 'utf8')).toBe('{"completed":true}')
  for (const path of ['output/verification/link.json', 'output/verification/hard.json', 'output/playwright/sentinel']) expect(() => readFileSync(join(value.output, path))).toThrow()
  expect(readFileSync(sentinel, 'utf8')).toBe('private inert bytes')
})
it('renders captured output without inline workflow commands or carriage-return commands', () => {
  const value = fixture(), log = join(value.root, 'task.log')
  writeFileSync(log, 'text ::error::inert\r::set-output name=x::inert\n##[error]inert\n')
  expect(displayCandidateLog(log)).toBe('text %3A%3Aerror%3A%3Ainert%0D%3A%3Aset-output name=x%3A%3Ainert\n%23%23[error]inert\n')
})

it('escapes a candidate-derived public CLI error before writing runner stderr', () => {
  const value = fixture()
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../ci/candidate-verification.ts'),
    'run-task', 'unknown\n::error::inert\r##[error]inert', '--sha', value.sha], {
    cwd: value.source, encoding: 'utf8', env: { ...process.env, GITHUB_SHA: '', GITHUB_ACTIONS: '', CI: '' },
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toBe('Unknown complete verification task: unknown\n%3A%3Aerror%3A%3Ainert%0D%23%23[error]inert\n')
})

it('escapes the actual untracked filename error from a temporary candidate tree', () => {
  const value = fixture()
  writeFileSync(join(value.work, 'extra\n::error::inert\r##[error]inert'), 'inert bytes')
  let failure: unknown
  try { verifyCandidateSources(value.source, value.work, value.sha) } catch (error) { failure = error }
  expect(failure).toBeInstanceOf(Error)
  if (!(failure instanceof Error)) throw new Error('Expected candidate filename error')
  expect(escapeWorkflowCommands(failure.message)).toBe('Untracked candidate source: extra\n%3A%3Aerror%3A%3Ainert%0D%23%23[error]inert')
})

it.each([
  { variable: 'fingerprint', command: 'gpg', first: 'fpr:::::::::9DC858229FC7DD38854AE2D88D81803C0EBFCD88:\n', later: 'fpr:::::::::0000000000000000000000000000000000000000:\n', expected: '9DC858229FC7DD38854AE2D88D81803C0EBFCD88' },
  { variable: 'version', command: 'apt-cache', first: 'docker-ce | 5:29.9.3-1~ubuntu.26.04~resolute | public\n', later: 'docker-ce | 5:29.9.3-2~ubuntu.26.04~resolute | public\n', expected: '5:29.9.3-1~ubuntu.26.04~resolute' },
])('consumes large public $command metadata under pipefail and keeps the first match', ({ variable, command, first, later, expected }) => {
  const root = mkdtempSync(join(tmpdir(), 'oa-ci-metadata-')); roots.push(root)
  const bin = join(root, 'bin'); mkdirSync(bin)
  const metadata = join(root, 'public-metadata.txt')
  writeFileSync(metadata, first + later + 'public metadata with no matching fields\n'.repeat(100000))
  writeFileSync(join(bin, command), '#!/bin/bash\nexec /bin/cat "$OA_PUBLIC_METADATA"\n', { mode: 0o700 })
  const setup = readFileSync(resolve(import.meta.dirname, '../ci/setup-candidate-isolation.sh'), 'utf8')
  const assignment = setup.split('\n').find(line => line.startsWith(`${variable}=`))
  if (!assignment) throw new Error('Missing setup metadata selection')
  const result = spawnSync('/bin/bash', ['-c', `set -euo pipefail\n${assignment}\nprintf '%s\\n' "$${variable}"`], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, OA_PUBLIC_METADATA: metadata },
  })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toBe(expected + '\n')
})

it('creates a private candidate home without inherited host ACLs and allocates subordinate IDs', () => {
  const setup = readFileSync(resolve(import.meta.dirname, '../ci/setup-candidate-isolation.sh'), 'utf8')
  const before = setup.indexOf('# Candidate identity and automatic subordinate IDs.')
  const after = setup.indexOf('cp -a "$source_directory"', before)
  if (before < 0 || after < 0) throw new Error('Missing identity setup stage')
  const result = spawnSync('docker', ['run', '--rm', '--network', 'bridge', '-i',
    'ubuntu:26.04@sha256:065aa8626841f16057b78b027b464cd59c4fac36c204c72dcbf48d66f5fa8a96',
    'timeout', '--signal=TERM', '--kill-after=5s', '60s', 'bash', '-s'], {
    encoding: 'utf8', timeout: 90000,
    input: `set -euo pipefail
acl_fixture_apt=(-o Acquire::Retries=1 -o Acquire::http::Timeout=10 -o Acquire::https::Timeout=10)
apt-get "\${acl_fixture_apt[@]}" update >/dev/null
DEBIAN_FRONTEND=noninteractive apt-get "\${acl_fixture_apt[@]}" install -y --no-install-recommends acl >/dev/null
setfacl -m d:u:1001:rwx /home
${setup.slice(before, after)}
id -u oa-candidate
id -g oa-candidate
grep '^oa-candidate:' /etc/subuid
grep '^oa-candidate:' /etc/subgid
mkdir -p /home/oa-candidate/.local/share/docker
touch /home/oa-candidate/.local/share/docker/inert-file
stat -c '%a' /home/oa-candidate
getfacl -cpn /home/oa-candidate /home/oa-candidate/.local/share/docker/inert-file
getfacl -cpn /home | grep '^default:user:1001:rwx$'
`,
  })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toBe('61000\n61000\noa-candidate:165536:65536\noa-candidate:165536:65536\n'
    + '700\nuser::rwx\ngroup::---\nother::---\n\nuser::rw-\ngroup::r--\nother::r--\n\ndefault:user:1001:rwx\n')
}, 95_000)

it('reports a failing setup stage and line without dumping its environment', () => {
  const setup = readFileSync(resolve(import.meta.dirname, '../ci/setup-candidate-isolation.sh'), 'utf8')
  const prefix = setup.slice(0, setup.indexOf('export PATH='))
  const result = spawnSync('/bin/bash', ['-s'], {
    encoding: 'utf8', input: prefix + '\nisolation_stage=identity\nfalse\n',
    env: { ...process.env, OA_INERT_ENV_MARKER: 'inert environment bytes must remain private' },
  })
  expect(result.status).toBe(1)
  expect(result.stdout).toBe('')
  expect(result.stderr).toMatch(/^Candidate isolation setup failed: stage=identity line=\d+ status=1\n$/)
})

it.each([false, true])('starts candidate processes with private paths after a poisoned runner environment (manager=%s)', manager => {
  const wrapper = resolve(import.meta.dirname, '../ci/candidate-user-environment.sh')
  const result = spawnSync('/bin/bash', ['-p', wrapper, ...(manager ? ['--user-manager'] : []), '/usr/bin/env'], {
    encoding: 'utf8', env: { ...process.env,
      HOME: '/tmp/inert-runner-home', XDG_CONFIG_HOME: '/tmp/inert-runner-config', XDG_RUNTIME_DIR: '/tmp/inert-runner-runtime',
      XDG_DATA_HOME: '/tmp/inert-runner-data', XDG_CACHE_HOME: '/tmp/inert-runner-cache', DOCKER_CONFIG: '/tmp/inert-runner-docker',
      DBUS_SESSION_BUS_ADDRESS: 'unix:path=/tmp/inert-runner-bus', SYSTEMD_UNIT_PATH: '/tmp/inert-runner-units',
      NOTIFY_SOCKET: '/tmp/inert-systemd-notify', OA_INERT_ENV_MARKER: 'inert host environment must be removed',
    },
  })
  expect(result.status, result.stderr).toBe(0)
  const values = Object.fromEntries(result.stdout.trim().split('\n').map(line => { const split = line.indexOf('='); return [line.slice(0, split), line.slice(split + 1)] }))
  expect(values).toMatchObject({ HOME: '/home/oa-candidate', XDG_CONFIG_HOME: '/home/oa-candidate/.config',
    XDG_CACHE_HOME: '/home/oa-candidate/.cache', XDG_DATA_HOME: '/home/oa-candidate/.local/share',
    XDG_RUNTIME_DIR: '/run/user/61000', DOCKER_CONFIG: '/home/oa-candidate/.docker', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/61000/bus',
    SYSTEMD_ENVIRONMENT_GENERATOR_PATH: '/run/oa-ci-isolation/environment-generators' })
  expect(values).not.toHaveProperty('SYSTEMD_UNIT_PATH')
  expect(values).not.toHaveProperty('OA_INERT_ENV_MARKER')
  expect(values.NOTIFY_SOCKET).toBe(manager ? '/tmp/inert-systemd-notify' : undefined)
})

it.each([true, false])('waits for recursive cgroup emptiness and rejects a populated timeout (clears=%s)', clears => {
  const root = mkdtempSync(join(tmpdir(), 'oa-cgroup-events-')); roots.push(root)
  writeFileSync(join(root, 'cgroup.events'), 'populated 1\nfrozen 0\n')
  const source = readFileSync(resolve(import.meta.dirname, '../ci/stop-candidate-isolation.sh'), 'utf8')
  const prefix = source.slice(0, source.indexOf('[[ $EUID'))
  const result = spawnSync('/bin/bash', ['-s', root], { encoding: 'utf8',
    input: prefix + (clears ? '\n(sleep 0.2; printf "populated 0\\nfrozen 0\\n" > "$1/cgroup.events") &\n' : '\n')
      + `wait_candidate_cgroup "$1" ${clears ? 3 : 1}\ncat "$1/cgroup.events"\n`,
  })
  expect(result.status).toBe(clears ? 0 : 1)
  expect(result.stdout).toBe(clears ? 'populated 0\nfrozen 0\n' : '')
})

it.each(['package', 'suite-root', 'suite-entry'])('rejects candidate %s links before reading outside inert data', kind => {
  const value = fixture(), outside = join(value.root, 'outside')
  mkdirSync(outside)
  writeFileSync(join(outside, 'metadata.json'), 'outside inert bytes')
  writeFileSync(join(outside, 'outside.spec.ts'), 'inert public fixture bytes')
  writeFileSync(join(value.source, 'package.json'), '{"scripts":{"check:architecture":"pnpm run lint"}}')
  if (kind === 'package') {
    rmSync(join(value.source, 'package.json')); symlinkSync(join(outside, 'metadata.json'), join(value.source, 'package.json'))
    expect(() => taskCommands(value.source, 'quality')).toThrow('Candidate package.json must be a regular file')
  } else {
    if (kind === 'suite-root') symlinkSync(outside, join(value.source, 'e2e-tests'))
    else { mkdirSync(join(value.source, 'e2e-tests')); symlinkSync(outside, join(value.source, 'e2e-tests/nested')) }
    expect(() => taskCommands(value.source, 'chromium-1')).toThrow('Candidate browser suite must contain only regular files and directories')
  }
})

it('shares the public dependency file between CI service preparation and existing test readers', () => {
  const value = fixture(), repository = resolve(import.meta.dirname, '../..'), bin = join(value.root, 'bin')
  mkdirSync(bin); symlinkSync(execFileSync('which', ['git'], { encoding: 'utf8' }).trim(), join(bin, 'git'))
  const env = candidateEnvironment({ uid: 61000, gid: 61000, home: value.root, work: value.work, node: process.execPath,
    socket: join(value.root, 'inert-socket'), privateDirectory: value.output }, { PATH: bin })
  const prepared = spawnSync(process.execPath, [join(repository, 'scripts/local-services.mjs'), '--skip-observability'], {
    cwd: value.work, encoding: 'utf8', env: { ...env, DATABASE_URL: 'postgres://inert@127.0.0.1/inert',
      TEST_DATABASE_URL: 'postgres://inert@127.0.0.1/inert_test', S3_ENDPOINT: 'https://inert.example.invalid',
      S3_BUCKET: 'inert', S3_REGION: 'us-east-1', S3_ACCESS_KEY_ID: 'inert', S3_SECRET_ACCESS_KEY: 'inert' },
  })
  expect(prepared.status, prepared.stderr).toBe(0)
  const read = spawnSync(process.execPath, [join(repository, 'node_modules/tsx/dist/cli.mjs'), '-e',
    `import {getTestDatabaseUrl} from ${JSON.stringify(join(repository, 'server/__tests__/_helpers/postgres.ts'))}; import {testStorageEnvironment} from ${JSON.stringify(join(repository, 'server/__tests__/_helpers/objects.ts'))}; console.log(JSON.stringify({database:getTestDatabaseUrl(),bucket:testStorageEnvironment().S3_BUCKET}))`], {
    cwd: value.work, encoding: 'utf8', env,
  })
  expect(read.status, read.stderr).toBe(0)
  expect(JSON.parse(read.stdout)).toEqual({ database: 'postgres://inert@127.0.0.1/inert_test', bucket: 'agricola-test' })
})

it('keeps a temporary launcher from overwriting its parent candidate dependency file', () => {
  const value = fixture(), repository = resolve(import.meta.dirname, '../..')
  const launcher = join(value.root, 'launcher'), bin = join(launcher, 'node_modules/.bin')
  mkdirSync(bin, { recursive: true }); mkdirSync(join(launcher, 'scripts'))
  execFileSync('git', ['init', '-q', launcher])
  writeFileSync(join(launcher, 'restart-local.sh'), readFileSync(join(repository, 'restart-local.sh')))
  for (const name of ['tsx', 'vite', 'lsof']) writeFileSync(join(bin, name), '#!/bin/sh\nexit 42\n', { mode: 0o700 })
  writeFileSync(join(launcher, 'scripts/local-services.mjs'), `
    import { mkdirSync, writeFileSync } from 'node:fs'
    import { join } from 'node:path'
    mkdirSync(process.env.SHARED_DATA_DIR, { recursive: true })
    writeFileSync(join(process.env.SHARED_DATA_DIR, 'dependencies.local'), 'OBSERVABILITY_ENABLED=false\\n')
  `)
  const parent = join(value.work, 'data/dependencies.local')
  mkdirSync(join(value.work, 'data'))
  writeFileSync(parent, 'inert parent dependency sentinel\n')
  const env = candidateEnvironment({ uid: 61000, gid: 61000, home: value.root, work: value.work, node: process.execPath,
    socket: join(value.root, 'inert-socket'), privateDirectory: value.output })
  const result = spawnSync('/bin/bash', [join(launcher, 'restart-local.sh')], { cwd: launcher, encoding: 'utf8', env: {
    ...env, PATH: `${bin}:${env.PATH}`, PNPM_BIN: join(bin, 'tsx'), REPLAY_VIEWER_BUILD_ID: 'inert-viewer', GAME_BUILD_ID: 'inert-game',
  } })
  expect(result.status, result.stderr).toBe(42)
  expect(readFileSync(parent, 'utf8')).toBe('inert parent dependency sentinel\n')
  expect(readFileSync(join(launcher, 'data/dependencies.local'), 'utf8')).toBe('OBSERVABILITY_ENABLED=false\n')
})
