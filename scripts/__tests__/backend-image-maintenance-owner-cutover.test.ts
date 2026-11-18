import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { dockerFixtureEnvironment } from './_helpers/docker-fixture-environment'
import { backendImageMaintenanceFixture as fixture, removeBackendImageMaintenanceRoots } from './_helpers/backend-image-maintenance-fixture'

// These integration cases launch multiple helper processes; low-core CI needs a file-local test budget.
vi.setConfig({ testTimeout: 15_000 })

afterEach(removeBackendImageMaintenanceRoots)

// ADR 0045: the owner machine validates the stopped cutover; the host seals only a bound report.
const ownerReport = (changes: Record<string, unknown> = {}) => (request: Record<string, unknown>) => ({
  formatVersion: 2, validator: 'owner-local', nonce: request.nonce, sourceBuildId: request.sourceBuildId, targetBuildId: request.targetBuildId,
  image: request.targetImage, validatorImage: `sha256:${'b'.repeat(64)}`, validatorPlatform: 'linux/arm64',
  createdAt: request.createdAt, database: request.database, validatedAt: new Date().toISOString(),
  roomCount: 0, replayCount: 0, replayHeadCount: 0, replayStepCount: 0, replaySegmentCount: 0, retainedObjectCount: 0, replaySchemaVersions: [], ...changes,
})
const commandsOf = (value: ReturnType<typeof fixture>) => value.calls().map(call => call.args.join(' '))
const sourceRestarted = (value: ReturnType<typeof fixture>) => value.calls().some(call => call.kind === 'docker' && call.args[0] === 'start' && call.args.includes(value.oldId))

it('hands cutover validation to the owner machine when both images support it, then checks live data by counts', async () => {
  const value = fixture()
  const result = await value.invokeWithOwner(ownerReport())
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(readFileSync(join(value.stage, 'validation-mode.json'), 'utf8'))).toMatchObject({ mode: 'owner', reason: 'both images support Owner-local Validation' })
  expect(result.request).toMatchObject({ sourceBuildId: value.sourceBuild, targetBuildId: value.request.sourceSha, targetImage: value.request.transfer.receipt.imageId })
  expect(String(result.request?.capture)).toMatch(/\/backups\/\.pending-[^/]+\/capture$/)
  const commands = commandsOf(value)
  expect(commands.some(command => command.includes(' export ') && command.includes('--directory-database'))).toBe(true)
  expect(commands.some(command => command.includes(' validate /backup/'))).toBe(false)
  expect(commands.find(command => command.includes('check-live'))).toContain('--counted')
  const manifest = JSON.parse(readFileSync(join(value.directory, 'backups', `pre-${value.request.sourceSha.slice(0, 12)}-${value.request.operationId}.manifest.json`), 'utf8'))
  // ADR 0047: the sealed evidence keeps the owner's arm64 validator beside the deployed image it stands in for.
  expect(manifest).toMatchObject({ formatVersion: 2, validator: 'owner-local', targetBuildId: value.request.sourceSha, sourceBuildId: value.sourceBuild,
    image: value.request.transfer.receipt.imageId, validatorImage: `sha256:${'b'.repeat(64)}`, validatorPlatform: 'linux/arm64' })
  expect(value.current()).toMatchObject({ started: true, counted: true })
  expect(sourceRestarted(value)).toBe(false)
  const status = value.operation('status')
  expect(JSON.parse(status.stdout)).toMatchObject({ state: 'accepted', phase: 'accepted' })
}, 30_000)

it.each([
  ['a failed owner validation', ownerReport({ ok: false, error: 'replay segment integrity failed' }), {}],
  ['a report bound to another dump', ownerReport({ database: { sha256: 'e'.repeat(64), size: 11 } }), {}],
  ['a report bound to another image', ownerReport({ image: `sha256:${'e'.repeat(64)}` }), {}],
  ['a report without its validator image', ownerReport({ validatorImage: undefined }), {}],
  ['a report from a malformed validator image', ownerReport({ validatorImage: 'validator' }), {}],
  ['a report from another validator platform', ownerReport({ validatorPlatform: 'linux/amd64' }), {}],
  ['a missing report', null, { BACKEND_OWNER_WAIT_MS: '1500' }],
] as const)('restarts the unchanged source before migration after %s', async (_name, answer, env) => {
  const value = fixture()
  const result = await value.invokeWithOwner(answer, env)
  expect(result.status).not.toBe(0)
  expect(sourceRestarted(value)).toBe(true)
  expect(commandsOf(value).some(command => command.includes('check-live'))).toBe(false)
  expect(readFileSync(join(value.directory, '.env'), 'utf8')).toBe(value.originalEnv)
  expect(existsSync(join(value.directory, 'backups', `pre-${value.request.sourceSha.slice(0, 12)}-${value.request.operationId}.manifest.json`))).toBe(false)
}, 30_000)

it('keeps maintenance after migration when counted live data differs from the owner report', async () => {
  const value = fixture('owner-live-counts')
  const result = await value.invokeWithOwner(ownerReport())
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Counted live validation differs from the Owner-local Validation')
  expect(sourceRestarted(value)).toBe(false)
  expect(value.current()).toMatchObject({ started: false })
}, 30_000)

it.each([
  ['owner-source-old', 'source image cannot export a directory dump'],
  ['owner-target-old', 'target image cannot run a counted live check'],
  ['owner-probe-error', 'source image cannot export a directory dump'],
])('falls back to host validation when %s', async (failure, reason) => {
  const value = fixture(failure)
  const result = await value.invokeWithOwner(ownerReport())
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(readFileSync(join(value.stage, 'validation-mode.json'), 'utf8'))).toEqual({ format: 1, mode: 'host', reason })
  expect(result.request).toBeUndefined()
  const commands = commandsOf(value)
  expect(commands.some(command => command.includes(' validate /backup/'))).toBe(true)
  expect(commands.find(command => command.includes('check-live'))).not.toContain('--counted')
}, 30_000)

it('does not probe images or wait for the owner unless the owner asked for it', () => {
  const value = fixture(), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(readFileSync(join(value.stage, 'validation-mode.json'), 'utf8'))).toEqual({ format: 1, mode: 'host', reason: 'host validation requested' })
  expect(value.calls().some(call => call.kind === 'docker' && call.args[0] === 'run')).toBe(false)
})

it('restores the stopped source only before migration when maintenance died waiting for the owner', async () => {
  const value = fixture()
  const child = spawn(process.execPath, [join(value.stage, 'policy/scripts/release/backend-image-maintenance.ts'), 'maintain', value.requestPath, value.directory, value.request.sourceSha, value.request.producerSha],
    { detached: true, stdio: 'ignore', env: dockerFixtureEnvironment({ CI: '', GITHUB_ACTIONS: '', PATH: `${value.bin}:${process.env.PATH}`, BACKEND_VALIDATION: 'owner' }) })
  const closed = new Promise(done => child.once('close', done))
  for (let waited = 0; !existsSync(join(value.stage, 'owner-request.json')); waited += 50) {
    if (waited > 20_000) throw new Error('owner request was not published')
    await new Promise(done => setTimeout(done, 50))
  }
  process.kill(-child.pid!, 'SIGKILL'); await closed
  expect(value.current()).toMatchObject({ running: false })
  const restored = value.operation('restore-source')
  expect(restored.status, restored.stderr).toBe(0)
  expect(JSON.parse(restored.stdout)).toEqual({ restored: value.oldId })
  expect(value.current()).toMatchObject({ running: true })

  const migrated = fixture(), accepted = migrated.invoke()
  expect(accepted.status, accepted.stderr).toBe(0)
  const refused = migrated.operation('restore-source')
  expect(refused.status).not.toBe(0)
  expect(refused.stderr).toContain('Source restore was refused')
}, 30_000)
