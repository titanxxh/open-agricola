// @covers docker-compose.prod.yml
import { readFileSync, renameSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { backendImageMaintenanceFixture as fixture, nativeCompose, removeBackendImageMaintenanceRoots } from './_helpers/backend-image-maintenance-fixture'

// These integration cases launch multiple helper processes; low-core CI needs a file-local test budget.
vi.setConfig({ testTimeout: 15_000 })
// The Compose-only checks of the candidate's docker-compose.prod.yml stay in release verification:
// docker-compose-prod-binding.test.ts.

afterEach(removeBackendImageMaintenanceRoots)

it('pins subsequent documented Compose run/up to the installed image with default and explicit .env selection', () => {
  const value = fixture(), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  for (const explicitEnvFile of [false, true]) {
    const config = nativeCompose(value.directory, explicitEnvFile)
    expect(config.status, config.stderr).toBe(0)
    expect(JSON.parse(config.stdout).services.app.image).toBe(value.imageId)
  }
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv.replace(value.sourceImage, value.imageId))
  expect(statSync(join(value.directory, '.env')).mode & 0o777).toBe(0o600)
  expect(JSON.parse(readFileSync(join(value.directory, 'data/deployed-image.json'), 'utf8')).nativeImageId).toBe(value.imageId)
})

it.each(['fetch', 'backup', 'report-target'])('preserves the previous binding for %s before live migration', failure => {
  const value = fixture(failure)
  expect(value.invoke().status).not.toBe(0)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv)
})

it.each(['live', 'up', 'up-identity'])('disables ordinary Compose after %s without restoring an old executable on migrated data', failure => {
  const value = fixture(failure)
  expect(value.invoke().status).not.toBe(0)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv.replace(value.sourceImage, ''))
  expect(nativeCompose(value.directory).status).not.toBe(0)
})

it.each(['duplicate', 'quoted', 'tag', 'symlink'])('rejects %s installed-image configuration before source changes', form => {
  const value = fixture(), path = join(value.directory, '.env')
  if (form === 'symlink') { renameSync(path, path + '.outside'); symlinkSync(path + '.outside', path) }
  else writeFileSync(path, form === 'duplicate' ? value.originalEnv + `BACKEND_IMAGE=${value.sourceImage}\n`
    : value.originalEnv.replace(value.sourceImage, form === 'tag' ? 'open-agricola:backend' : `"${value.sourceImage}"`))
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.kind === 'git')).toBe(false)
})

it('initializes the binding for an existing deployment that predates fixed image delivery', () => {
  const value = fixture(), before = value.originalEnv.replace(`BACKEND_IMAGE=${value.sourceImage}\n`, '')
  writeFileSync(join(value.directory, '.env'), before)
  const result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(before + `BACKEND_IMAGE=${value.imageId}\n`)
  expect(JSON.parse(nativeCompose(value.directory).stdout).services.app.image).toBe(value.imageId)
})

it('rejects an installed selector that conflicts with the retained native application before stopping it', () => {
  const value = fixture()
  writeFileSync(join(value.directory, '.env'), value.originalEnv.replace(value.sourceImage, `sha256:${'e'.repeat(64)}`))
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls().some(call => call.args[0] === 'stop' || call.args[0] === 'checkout')).toBe(false)
})
