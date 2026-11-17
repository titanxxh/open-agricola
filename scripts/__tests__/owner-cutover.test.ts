import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ownerCutover, parseOwnerRequest, type CutoverIo, type CutoverTarget, type OwnerRequest } from '../release/owner-cutover'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const target: CutoverTarget = { directory: '/srv/oa', stage: '/srv/oa/backups/.backend-image-op', sourceSha: 'f'.repeat(40), targetImage: `sha256:${'c'.repeat(64)}`, operationId: 'op' }
const request: OwnerRequest = {
  format: 1, nonce: '11111111-2222-4333-8444-555555555555', capture: '/srv/oa/backups/.pending-20261117T000000Z-1/capture', ledger: '/srv/oa/backups/replay-removals.latest.json',
  sourceBuildId: 'a'.repeat(40), targetBuildId: target.sourceSha, targetImage: target.targetImage, createdAt: '2026-11-17T00:00:00.000Z',
  database: { sha256: 'd'.repeat(64), size: 10 }, reportDeadlineEpochMs: 10_000,
}
const counts = { formatVersion: 2, roomCount: 1, replayCount: 1, replayHeadCount: 1, replayStepCount: 4, replaySegmentCount: 1, retainedObjectCount: 3, replaySchemaVersions: [1] }

function io(files: Record<string, string>, overrides: Partial<CutoverIo> = {}) {
  const uploads: Record<string, unknown>[] = [], kept: string[] = []
  let clock = 0, finished = false
  const value: CutoverIo = {
    read: path => files[path.slice(target.stage.length + 1)] ?? null,
    pull: (_request, local) => ({ capture: join(local, 'capture'), ledger: join(local, 'ledger.json') }),
    verify: async () => ({ createdAt: request.createdAt, database: request.database }),
    validate: () => ({ ...counts, sourceBuildId: request.sourceBuildId, targetBuildId: request.targetBuildId, createdAt: request.createdAt, database: request.database }),
    upload: report => { uploads.push(report) },
    keep: local => { kept.push(local) },
    sleep: ms => { clock += ms; if (clock > 20_000) finished = true },
    now: () => clock,
    finished: () => finished,
    ...overrides,
  }
  return { value, uploads, kept }
}
const root = () => { const path = mkdtempSync(join(tmpdir(), 'oa-owner-cutover-')); roots.push(path); return path }
const owner = { 'validation-mode.json': JSON.stringify({ format: 1, mode: 'owner', reason: 'both' }), 'owner-request.json': JSON.stringify(request) }

describe('owner cutover', () => {
  it('does nothing when the host validates itself', async () => {
    const fake = io({ 'validation-mode.json': JSON.stringify({ format: 1, mode: 'host', reason: 'source image cannot export a directory dump' }) })
    expect(await ownerCutover(target, fake.value, root())).toBe('host')
    expect(fake.uploads).toEqual([])
  })

  it('uploads a report bound to the request nonce and candidate image, then keeps the validated copy', async () => {
    const directory = root(), fake = io(owner)
    expect(await ownerCutover(target, fake.value, directory)).toBe('reported')
    expect(fake.uploads).toEqual([expect.objectContaining({ ...counts, validator: 'owner-local', image: target.targetImage, nonce: request.nonce, database: request.database })])
    expect(fake.kept).toHaveLength(1)
    expect(readdirSync(directory)).toEqual([])
  })

  it.each([
    ['a request for another candidate', { 'owner-request.json': JSON.stringify({ ...request, targetBuildId: 'e'.repeat(40) }) }, {}],
    ['a capture outside this deployment', { 'owner-request.json': JSON.stringify({ ...request, capture: '/etc/capture' }) }, {}],
    ['a pulled capture that differs from the request', {}, { verify: async () => ({ createdAt: request.createdAt, database: { sha256: 'e'.repeat(64), size: 10 } }) }],
    ['a failed local validation', {}, { validate: () => { throw new Error('replay segment integrity failed at room-1 step 5') } }],
  ] as const)('answers %s with an explicit failure so the host restarts the source at once', async (_name, files, overrides) => {
    const fake = io({ ...owner, ...files }, overrides)
    expect(await ownerCutover(target, fake.value, root())).toBe('failed')
    expect(fake.uploads).toEqual([expect.objectContaining({ ok: false })])
    expect(fake.kept).toEqual([])
  })

  it('uploads nothing once the host deadline passed', async () => {
    const fake = io(owner, { now: () => request.reportDeadlineEpochMs + 1 })
    expect(await ownerCutover(target, fake.value, root())).toBe('failed')
    expect(fake.uploads).toEqual([])
  })

  it('stops waiting when maintenance ended before publishing a request', async () => {
    const fake = io({ 'validation-mode.json': owner['validation-mode.json'] })
    expect(await ownerCutover(target, fake.value, root())).toBe('ended')
    expect(fake.uploads).toEqual([])
  })

  it('accepts only a request that names this cutover', () => {
    expect(parseOwnerRequest(JSON.stringify(request), target)).toEqual(request)
    for (const change of [{ targetImage: `sha256:${'e'.repeat(64)}` }, { ledger: '/tmp/ledger.json' }, { capture: '/srv/oa/backups/.pending-x/../../etc/capture' }, { nonce: 'x' }]) {
      expect(() => parseOwnerRequest(JSON.stringify({ ...request, ...change }), target)).toThrow('does not match this cutover')
    }
  })
})
