import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
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

/** Runs local-services.mjs with only git, and optionally a recording docker, on PATH. */
const runServices = (env: Record<string, string>, { docker }: { docker: boolean }) => {
  const root = mkdtempSync(join(tmpdir(), 'oa-local-services-'))
  roots.push(root)
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const git = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
  symlinkSync(git, join(bin, 'git'))
  const calls = join(root, 'docker-calls')
  if (docker) {
    // `network inspect` fails, as for a missing network; every other call succeeds.
    writeFileSync(join(bin, 'docker'), `#!/bin/sh\nprintf '%s\\n' "$*" >> "${calls}"\n[ "$1 $2" = "network inspect" ] && exit 1\nexit 0\n`)
    chmodSync(join(bin, 'docker'), 0o755)
  }
  const data = join(root, 'data')
  const result = spawnSync(process.execPath, ['scripts/local-services.mjs'], {
    cwd: repository, encoding: 'utf8', timeout: 30_000,
    env: { PATH: bin, HOME: root, SHARED_DATA_DIR: data, LOCAL_SERVICES_DIR: join(root, 'services'), ...env },
  })
  return {
    status: result.status,
    output: `${result.stdout}\n${result.stderr}`,
    dockerCalls: existsSync(calls) ? readFileSync(calls, 'utf8').trim().split('\n') : [],
    monitoringPrepared: existsSync(join(data, 'observability', 'prometheus.local.yml')),
    dependencies: existsSync(join(data, 'dependencies.local')) ? readFileSync(join(data, 'dependencies.local'), 'utf8') : '',
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
})
