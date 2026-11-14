import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseEnv } from 'node:util'
import { allocateTestPort } from '../test-ports'

const repository = resolve(import.meta.dirname, '../..')
const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const external = {
  DATABASE_URL: 'postgresql://user:secret@db.example.invalid:5432/agricola',
  S3_ENDPOINT: 'https://objects.example.invalid',
  S3_BUCKET: 'agricola',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'access',
  S3_SECRET_ACCESS_KEY: 'secret',
}

type OverrideFixture = 'private' | 'public' | 'symlink' | 'dangling'
/** Runs local-services.mjs with only git, and optionally a recording docker, on PATH. */
const runServices = (env: Record<string, string>, { docker, override, stopCompose = false }: {
  docker: boolean; override?: OverrideFixture; stopCompose?: boolean
}) => {
  const root = mkdtempSync(join(tmpdir(), 'oa-local-services-'))
  roots.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const git = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
  symlinkSync(git, join(bin, 'git'))
  const calls = join(root, 'docker-calls')
  if (docker) {
    // Stop selected Compose calls after recording so no database/S3 connection follows.
    writeFileSync(join(bin, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\n[ "$1 $2" = "network inspect" ] && exit 1\n${stopCompose ? '[ "$1" = compose ] && exit 42\n' : ''}exit 0\n`)
    chmodSync(join(bin, 'docker'), 0o755)
  }
  const data = join(root, 'data')
  const services = join(root, 'services')
  const overridePath = join(services, 'local-services.compose.override.yml')
  if (override) {
    mkdirSync(services)
    if (override === 'symlink' || override === 'dangling') {
      const target = join(root, 'override.yml')
      if (override === 'symlink') writeFileSync(target, 'services: {}\n', { mode: 0o600 })
      symlinkSync(target, overridePath)
    } else writeFileSync(overridePath, 'services: {}\n', { mode: override === 'private' ? 0o600 : 0o644 })
  }
  const result = spawnSync(process.execPath, ['scripts/local-services.mjs'], {
    cwd: repository, encoding: 'utf8', timeout: 30_000,
    env: { PATH: bin, HOME: root, SHARED_DATA_DIR: data, LOCAL_SERVICES_DIR: services, ...env },
  })
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
    dockerCalls: existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [],
    monitoringPrepared: existsSync(join(data, 'observability', 'prometheus.local.yml')),
    dependencies: existsSync(join(data, 'dependencies.local')) ? readFileSync(join(data, 'dependencies.local'), 'utf8') : '',
    overridePath,
  }
}

describe('local-services Docker use', () => {
  it('prepares external dependencies without Docker installed', () => {
    const result = runServices(external, { docker: false })

    expect(result.status, result.output).toBe(0)
    expect(result.output).toContain('Docker is not installed; skipping the shared container network.')
    expect(result.dependencies).toContain(`DATABASE_URL='${external.DATABASE_URL}'`)
    expect(result.dependencies).toContain(`S3_ENDPOINT='${external.S3_ENDPOINT}'`)
    expect(result.monitoringPrepared).toBe(true)
  })

  it('keeps an ephemeral test database override out of the persistent shared default', () => {
    const privateDatabase = 'postgresql://qualifier:private@127.0.0.1:55432/temporary_qualification'
    const result = runServices({ ...external, TEST_DATABASE_URL: privateDatabase }, { docker: false })
    expect(result.status, result.output).toBe(0)
    const saved = new URL(parseEnv(result.dependencies).TEST_DATABASE_URL)
    expect({ hostname: saved.hostname, port: saved.port, username: saved.username, pathname: saved.pathname })
      .toEqual({ hostname: '127.0.0.1', port: '55432', username: 'agricola', pathname: '/agricola_test' })
    expect(result.dependencies).not.toContain('temporary_qualification')
  })

  it('keeps the shared container network and monitoring configuration when Docker is installed', () => {
    const result = runServices(external, { docker: true })

    expect(result.status, result.output).toBe(0)
    expect(result.dockerCalls).toEqual([
      '--version',
      'network inspect open-agricola-local_default',
      'network create open-agricola-local_default',
    ])
    expect(result.monitoringPrepared).toBe(true)
  })

  it('still starts the local database with Compose when no external database is configured', async () => {
    // Compose is recorded, not run, so the follow-up connection is refused.
    const unused = await allocateTestPort()
    const { DATABASE_URL: _database, ...objectsOnly } = external
    const result = runServices({ ...objectsOnly, LOCAL_POSTGRES_PORT: String(unused) }, { docker: true })

    expect(result.status).not.toBe(0)
    expect(result.dockerCalls[0]).toMatch(/^compose --env-file .+ -f .+docker-compose\.local\.yml up -d --wait postgres$/)
  })

  it('loads the owner override when starting PostgreSQL', () => {
    const { DATABASE_URL: _database, ...objectsOnly } = external
    const result = runServices(objectsOnly, { docker: true, override: 'private', stopCompose: true })

    expect(result.dockerCalls).toHaveLength(1)
    expect(result.dockerCalls[0]).toContain(`-f ${repository}/docker-compose.local.yml -f ${result.overridePath} up -d --wait postgres`)
  })

  it('loads the same owner override when starting object storage', () => {
    const { S3_ENDPOINT: _endpoint, ...databaseOnly } = external
    const result = runServices(databaseOnly, { docker: true, override: 'private', stopCompose: true })

    expect(result.dockerCalls).toHaveLength(1)
    expect(result.dockerCalls[0]).toContain(`-f ${repository}/docker-compose.local.yml -f ${result.overridePath} up -d objects`)
  })

  it.each(['public', 'symlink', 'dangling'] satisfies OverrideFixture[])('rejects a %s override before starting dependencies', (override) => {
    const { DATABASE_URL: _database, ...objectsOnly } = external
    const result = runServices(objectsOnly, { docker: true, override, stopCompose: true })

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('Local services Compose override must be an owner-private regular file')
    expect(result.dockerCalls).toEqual([])
    expect(result.dependencies).toBe('')
  })
})

it('initializes a fresh persistent RustFS volume without copying image metadata or changing the service user', () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-rustfs-volume-')); roots.push(root)
  const project = 'oa-volume-fixture-' + basename(root).slice('oa-rustfs-volume-'.length).toLowerCase()
  const args = ['compose', '-p', project, '-f', join(repository, 'docker-compose.local.yml')]
  const env = { ...process.env, LOCAL_POSTGRES_PASSWORD: 'inert-postgres', LOCAL_S3_ACCESS_KEY: 'inert-access', LOCAL_S3_SECRET_KEY: 'inert-secret' }
  const run = (...tail: string[]) => spawnSync('docker', [...args, ...tail], { env, encoding: 'utf8', timeout: 60000 })
  try {
    const initialized = run('run', '--rm', '--no-deps', 'objects-volume-init')
    expect(initialized.status, initialized.stderr).toBe(0)
    const writable = run('run', '--rm', '--no-deps', '--entrypoint', '/bin/sh', 'objects', '-ec',
      'id -u; id -g; test -w /data; printf "inert persistent bytes" > /data/fixture; cat /data/fixture')
    expect(writable.status, writable.stderr).toBe(0)
    expect(writable.stdout).toBe('10001\n10001\ninert persistent bytes')
    const persisted = run('run', '--rm', '--no-deps', '--entrypoint', '/bin/sh', 'objects', '-ec', 'id -u; cat /data/fixture')
    expect(persisted.status, persisted.stderr).toBe(0)
    expect(persisted.stdout).toBe('10001\ninert persistent bytes')
  } finally {
    const cleaned = run('down', '--volumes')
    expect(cleaned.status, cleaned.stderr).toBe(0)
  }
}, 120000)
