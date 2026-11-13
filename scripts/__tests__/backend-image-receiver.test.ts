import { chmodSync, existsSync, linkSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createBackendImageFixture } from './_helpers/backend-image-fixture'

const roots: string[] = []
afterEach(() => { for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true }) })

function fixture(...args: Parameters<typeof createBackendImageFixture>) {
  const value = createBackendImageFixture(...args); roots.push(value.root); return value
}

it('imports a fixed formal image through bounded intake without stopping the application', () => {
  const value = fixture(), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout.trim()).toBe(value.imageId)
  const report: unknown = JSON.parse(readFileSync(join(value.stage, 'image.json'), 'utf8'))
  expect(report).toMatchObject({ sourceSha: value.request.sourceSha, producerSha: value.request.producerSha, nativeImageId: value.imageId })
  const intake: string[] = JSON.parse(readFileSync(join(value.root, 'intake.json'), 'utf8'))
  expect(intake).toEqual(expect.arrayContaining(['--property=MemoryMax=402653184', '--property=MemorySwapMax=0', '--property=CPUQuota=100%', '--property=TasksMax=64']))
  expect(value.calls().some(args => ['compose', 'stop', 'start', 'build', 'tag'].includes(args[0]))).toBe(false)
  expect(readdirSync(value.stage).some(name => name.endsWith('.snapshot.tar'))).toBe(false)
})


it.each([
  ['digest', 'Image transfer digest differs'],
  ['purpose', 'Formal deployment requires a formal-candidate image'],
  ['channel', 'Image purpose and channel do not match'],
  ['truncated', 'Image transfer is incomplete'],
  ['source', 'Imported image differs from the fixed source or policy'],
  ['producer', 'Imported image differs from the fixed source or policy'],
  ['budget', 'Image intake cap exceeds import admission headroom'],
  ['expired', 'Formal image authorization is expired or invalid'],
  ['cgroup', 'Native image intake limits differ from the target budget'],
  ['memory', 'Formal image intake would cross the configured host memory reserve'],
  ['frontend', 'Hosted frontend does not match the image receipt'],
])('rejects %s before installing an application', (failure, message) => {
  const value = fixture()
  if (failure === 'digest') value.request.transfer.archive.sha256 = 'f'.repeat(64)
  if (failure === 'purpose') {
    value.request.transfer.receipt.purpose = 'candidate'; value.request.transfer.receipt.channel = 'prerelease'; value.request.transfer.receipt.verification.kind = 'prerelease'
  }
  if (failure === 'channel') value.request.transfer.receipt.channel = 'prerelease'
  if (failure === 'truncated') writeFileSync(value.archivePath, readFileSync(value.archivePath).subarray(0, -512))
  if (failure === 'source') value.request.sourceSha = 'd'.repeat(40)
  if (failure === 'producer') value.request.producerSha = 'd'.repeat(40)
  if (failure === 'budget') value.request.budget.import.memoryHeadroomMiB = 32
  if (failure === 'expired') value.request.expiresAt = Date.now() - 1
  if (failure === 'cgroup') value.state.wrongLimit = true
  if (failure === 'memory') value.state.lowMemory = true
  if (failure === 'frontend') value.state.badFrontend = true
  value.save()
  const result = value.invoke()
  expect(result.status, result.stdout).not.toBe(0)
  expect(result.stderr).toContain(message)
  expect(existsSync(join(value.stage, 'image.json'))).toBe(false)
  expect(value.calls().some(args => ['compose', 'stop', 'start', 'build', 'tag'].includes(args[0]))).toBe(false)
  if (failure !== 'frontend') expect(value.calls().some(args => args[0] === 'load')).toBe(false)
  if (failure === 'truncated') expect(existsSync(join(value.root, 'copied.json'))).toBe(false)
})

it('loads an independent snapshot when the uploaded archive changes during Docker intake', () => {
  const value = fixture(); value.state.mutateUpload = true; value.save()
  const result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  const loaded: unknown = JSON.parse(readFileSync(join(value.root, 'loaded.json'), 'utf8'))
  expect(loaded).toEqual({ path: expect.stringMatching(/\.snapshot\.tar$/), sha256: value.request.transfer.archive.sha256 })
  expect(readFileSync(value.archivePath, 'utf8')).toBe('replaced SCP input')
})

it('rechecks the same immutable image before maintenance and allows only the authorization deadline to refresh', () => {
  const value = fixture()
  expect(value.invoke().status).toBe(0)
  value.request.expiresAt = Date.now() + 300_000; value.save()
  const confirmed = value.invoke('check')
  expect(confirmed.status, confirmed.stderr).toBe(0)
  expect(confirmed.stdout.trim()).toBe(value.imageId)
  const before = value.calls().length
  value.request.budget.reserveMemoryMiB += 1; value.save()
  const changed = value.invoke('check')
  expect(changed.status).not.toBe(0)
  expect(changed.stderr).toContain('Imported formal image belongs to another input or operation')
  expect(value.calls()).toHaveLength(before)
})


it.each([
  ['arm64', 'c'.repeat(40), 'Archive config ID or platform differs from receipt'],
  ['amd64', 'd'.repeat(40), 'Image source or channel differs from the receipt'],
])('rejects actual archive architecture %s and revision %s before Docker load', (architecture, revision, error) => {
  const value = fixture(architecture, revision), result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain(error)
  expect(value.calls().some(args => args[0] === 'load')).toBe(false)
  expect(existsSync(join(value.stage, 'image.json'))).toBe(false)
})

it.each(['public-request', 'hard-linked-upload'])('refuses aliased or public private input: %s', failure => {
  const value = fixture()
  if (failure === 'public-request') chmodSync(join(value.stage, 'request.json'), 0o644)
  else linkSync(value.archivePath, join(value.stage, 'image-alias.tar'))
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Formal image input must be an owner-private regular file or directory')
  expect(value.calls().some(args => args[0] === 'load')).toBe(false)
})

it('binds explicit bootstrap inputs into the existing image intake authority', () => {
  const value = fixture()
  expect(value.invoke().status).toBe(0)
  const before = value.calls().length
  writeFileSync(value.requestPath, JSON.stringify({ ...value.request, installation: { kind: 'bootstrap', caddyImage: `caddy@sha256:${'d'.repeat(64)}` } }))
  const result = value.invoke('check')
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('Imported formal image belongs to another input or operation')
  expect(value.calls()).toHaveLength(before)
})

it('rejects a mutable Caddy tag as bootstrap authorization before importing an application', () => {
  const value = fixture()
  writeFileSync(value.requestPath, JSON.stringify({ ...value.request, installation: { kind: 'bootstrap', caddyImage: 'caddy:alpine' } }))
  expect(value.invoke().status).not.toBe(0)
  expect(value.calls()).toEqual([])
})
