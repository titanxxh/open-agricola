// @covers docker-compose.prod.yml
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { dockerFixtureEnvironment } from './_helpers/docker-fixture-environment'

// The candidate's own docker-compose.prod.yml is what ordinary Compose maintenance reads in production, so these
// checks stay in release verification; the maintenance flow that writes the binding is covered in the tooling project
// (backend-image-maintenance-compose-binding.test.ts).
const repository = resolve(import.meta.dirname, '../..'), roots: string[] = []
const image = `sha256:${'8'.repeat(64)}`
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function deployment(env: string) {
  const directory = mkdtempSync(join(tmpdir(), 'oa-compose-binding-')); roots.push(directory)
  cpSync(join(repository, 'docker-compose.prod.yml'), join(directory, 'docker-compose.prod.yml'))
  mkdirSync(join(directory, 'data'))
  writeFileSync(join(directory, 'data/dependencies.compose.env'), 'DATABASE_URL=private-fixture\n')
  writeFileSync(join(directory, '.env'), `ACCOUNT_REGISTRATION_POLICY=invite_only\nPUBLIC_API_BASE=https://api.example.test\n${env}`, { mode: 0o600 })
  return directory
}

function nativeCompose(directory: string, explicitEnvFile = false) {
  const { BACKEND_IMAGE: _image, COMPOSE_ENV_FILES: _files, COMPOSE_DISABLE_ENV_FILE: _disabled, CADDY_IMAGE: _caddy, ...env } = dockerFixtureEnvironment()
  return spawnSync('docker', ['compose', ...(explicitEnvFile ? ['--env-file', '.env'] : []), '-f', 'docker-compose.prod.yml', 'config', '--format', 'json'],
    { cwd: directory, env, encoding: 'utf8', timeout: 30_000 })
}

it('pins Compose run/up to the installed image in .env with default and explicit .env selection', () => {
  const directory = deployment(`BACKEND_IMAGE=${image}\nCADDY_IMAGE=sha256:${'9'.repeat(64)}\n`)
  for (const explicitEnvFile of [false, true]) {
    const config = nativeCompose(directory, explicitEnvFile)
    expect(config.status, config.stderr).toBe(0)
    expect(JSON.parse(config.stdout).services.app.image).toBe(image)
  }
})

it('rejects ordinary Compose maintenance without the installed image binding instead of selecting a legacy tag', () => {
  const result = nativeCompose(deployment(`CADDY_IMAGE=sha256:${'9'.repeat(64)}\n`))
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('BACKEND_IMAGE')
})
