import { expect, it } from 'vitest'
import type { PublicCardReference } from '../../shared/contract/public-card-input'
import { FormalPublicCards } from '../prerelease-public-cards'
import { PrereleasePublicSandbox } from '../prerelease-public-sandbox'

const reference = (number: number): PublicCardReference => ({
  sha256: number.toString(16).padStart(64, '0'),
  source: { kind: 'workshop-public', authority: 'titanxxh/open-agricola', workshopCardId: 'public-card', versionId: `version-${number}` },
})
const response = (hash: string, now: number, allowed: boolean) => Response.json({
  ok: true, protocolVersion: 1, sha256: hash, checkedAt: now, validUntil: now + 30_000,
  access: allowed ? { kind: 'current', allowNew: true, allowExisting: true }
    : { kind: 'not_public', allowNew: false, allowExisting: false },
})

function fixture() {
  let now = 1_000, monotonic = 1_000
  const allowed = new Set<string>(), requests: string[] = []
  let read = async (hash: string) => response(hash, now, allowed.has(hash))
  const source = new FormalPublicCards('https://formal.example.test', async url => {
    const hash = new URL(String(url)).searchParams.get('sha256')
    if (!hash) throw new Error('Missing fixed input hash')
    requests.push(hash)
    return read(hash)
  }, { now: () => now, monotonic: () => monotonic })
  return { service: new PrereleasePublicSandbox(source, { buildId: 'a'.repeat(40), generationId: 'lease-cache-fixture' }),
    allowed, requests, now: () => now, advance: (milliseconds: number) => { now += milliseconds; monotonic += milliseconds },
    advanceWall: (milliseconds: number) => { now += milliseconds }, advanceMonotonic: (milliseconds: number) => { monotonic += milliseconds },
    read: (reader: typeof read) => { read = reader } }
}

function pendingResponse() {
  let complete: ((value: Response) => void) | undefined
  const promise = new Promise<Response>(resolve => { complete = resolve })
  return { promise, finish: (value: Response) => {
    if (!complete) throw new Error('Response has not started')
    complete(value)
  } }
}

it('does not let 256 rejected fixed inputs block a legitimate new public input', async () => {
  const f = fixture()
  for (let number = 0; number < 256; number++) {
    await expect(f.service.inspect([reference(number)])).rejects.toThrow('Public card execution paused')
  }
  const valid = reference(256); f.allowed.add(valid.sha256)
  const scope = await f.service.inspect([valid])
  expect(scope.remainingMs()).toBe(30_000)
  expect(() => scope.assert()).not.toThrow()
})

it('reclaims expired version entries before enforcing the bounded live-input capacity', async () => {
  const f = fixture()
  for (let number = 0; number <= 256; number++) {
    const ref = reference(number); f.allowed.add(ref.sha256)
    const scope = await f.service.inspect([ref])
    expect(() => scope.assert()).not.toThrow()
    f.advance(30_001)
  }
})

it('keeps 256 live inputs bounded and preserves an unexpired scope during collection', async () => {
  const f = fixture(), active = reference(0)
  f.allowed.add(active.sha256)
  const scope = await f.service.inspect([active])
  for (let number = 1; number < 256; number++) {
    const ref = reference(number); f.allowed.add(ref.sha256)
    await f.service.inspect([ref])
  }
  const next = reference(256); f.allowed.add(next.sha256)
  await expect(f.service.inspect([next])).rejects.toThrow('Public sandbox input capacity reached')
  f.advance(20_000)
  await scope.check()
  f.advance(10_001)
  await f.service.inspect([next])
  expect(() => scope.assert()).not.toThrow()
  expect(scope.remainingMs()).toBe(19_999)
})

it('recovers a collected scope only after its central fixed reference has a fresh positive status', async () => {
  const f = fixture(), ref = reference(0)
  f.allowed.add(ref.sha256)
  const expired = await f.service.inspect([ref])
  f.advance(30_001)
  const next = reference(1); f.allowed.add(next.sha256)
  await f.service.inspect([next])
  expect(() => expired.assert()).toThrow('Public card execution paused')
  expect(expired.remainingMs()).toBe(0)
  const replacement = await f.service.inspect([ref])
  expect(() => expired.assert()).toThrow('Public card execution paused')
  const requests = f.requests.length
  await expired.check()
  expect(f.requests.slice(requests)).toEqual([ref.sha256])
  expect(expired.remainingMs()).toBe(30_000)
  expect(() => expired.assert()).not.toThrow()
  expect(() => replacement.assert()).not.toThrow()
})

it('does not recover an expired fixed scope from a network failure or a continued denial', async () => {
  const f = fixture(), ref = reference(0)
  f.allowed.add(ref.sha256)
  const scope = await f.service.inspect([ref])
  f.advance(30_001)
  const next = reference(1); f.allowed.add(next.sha256)
  await f.service.inspect([next])
  f.read(async () => { throw new Error('offline') })
  await expect(scope.check()).rejects.toThrow('Public card execution paused')
  expect(scope.remainingMs()).toBe(0)
  f.read(async hash => response(hash, f.now(), false))
  await expect(scope.check()).rejects.toThrow('Public card execution paused')
  expect(() => scope.assert()).toThrow('Public card execution paused')
  f.read(async hash => response(hash, f.now(), true))
  await scope.check()
  expect(scope.remainingMs()).toBe(30_000)
  expect(f.requests.every(hash => hash === ref.sha256 || hash === next.sha256)).toBe(true)
})

it('restores existing execution after admin re-enable without changing the fixed reference', async () => {
  const f = fixture(), ref = reference(0)
  f.allowed.add(ref.sha256)
  const scope = await f.service.inspect([ref])
  f.allowed.delete(ref.sha256)
  await expect(f.service.inspect([ref])).rejects.toThrow('Public card execution paused')
  expect(() => scope.assert()).toThrow('Public card execution paused')
  f.allowed.add(ref.sha256)
  await f.service.inspect([ref])
  expect(() => scope.assert()).toThrow('Public card execution paused')
  const requests = f.requests.length
  await scope.check()
  expect(f.requests.slice(requests)).toEqual([ref.sha256])
  expect(() => scope.assert()).not.toThrow()
})

it('still requires strict new-game freshness after rebinding to a current central lease', async () => {
  const f = fixture(), ref = reference(0)
  f.allowed.add(ref.sha256)
  const scope = await f.service.inspect([ref])
  f.advance(30_001)
  const next = reference(1); f.allowed.add(next.sha256)
  await f.service.inspect([next])
  await f.service.inspect([ref])
  const requests = f.requests.length
  f.read(async () => { throw new Error('offline') })
  await expect(scope.checkNew()).rejects.toThrow('offline')
  expect(f.requests.slice(requests)).toEqual([ref.sha256, ref.sha256])
})

it('requires a fresh positive for new execution even while its current scope remains authorized', async () => {
  const f = fixture(), ref = reference(0)
  f.allowed.add(ref.sha256)
  const scope = await f.service.inspect([ref])
  f.read(async () => { throw new Error('offline') })
  await expect(scope.checkNew()).rejects.toThrow('offline')
  expect(() => scope.assert()).not.toThrow()
  expect(scope.remainingMs()).toBe(30_000)
})

it.each(['wall', 'monotonic'] as const)('does not extend a restored scope past its %s deadline', async clock => {
  const f = fixture(), ref = reference(0)
  f.allowed.add(ref.sha256)
  const scope = await f.service.inspect([ref])
  f.advance(30_001)
  const next = reference(1); f.allowed.add(next.sha256)
  await f.service.inspect([next])
  await scope.check()
  expect(scope.remainingMs()).toBe(30_000)
  if (clock === 'wall') f.advanceWall(30_000)
  else { f.advanceWall(-60_000); f.advanceMonotonic(30_000) }
  expect(scope.remainingMs()).toBe(0)
  expect(() => scope.assert()).toThrow('Public card execution paused')
})

it('pins an expired lease until its pending refresh settles, then reclaims it without bypassing live capacity', async () => {
  const f = fixture(), first = reference(0)
  f.allowed.add(first.sha256)
  const scope = await f.service.inspect([first])
  f.advance(19_000)
  for (let number = 1; number < 256; number++) {
    const ref = reference(number); f.allowed.add(ref.sha256)
    await f.service.inspect([ref])
  }
  f.advance(11_001)
  const refresh = pendingResponse()
  f.read(async hash => hash === first.sha256 ? refresh.promise : response(hash, f.now(), f.allowed.has(hash)))
  const checking = expect(scope.check()).rejects.toThrow('Public card execution paused')
  expect(f.requests.at(-1)).toBe(first.sha256)
  const next = reference(256); f.allowed.add(next.sha256)
  await expect(f.service.inspect([next])).rejects.toThrow('Public sandbox input capacity reached')
  refresh.finish(response(first.sha256, f.now(), false))
  await checking
  await f.service.inspect([next])
  const requests = f.requests.length
  await expect(scope.check()).rejects.toThrow('Public card execution paused')
  expect(f.requests).toHaveLength(requests)
})

it('keeps a late positive refresh from undoing a newer denial while capacity collection runs', async () => {
  const f = fixture(), first = reference(0)
  f.allowed.add(first.sha256)
  const scope = await f.service.inspect([first])
  for (let number = 1; number < 256; number++) {
    const ref = reference(number); f.allowed.add(ref.sha256)
    await f.service.inspect([ref])
  }
  const refresh = pendingResponse()
  f.read(async () => refresh.promise)
  const older = expect(scope.checkNew()).rejects.toThrow('Public card execution paused')
  f.allowed.delete(first.sha256)
  f.read(async hash => response(hash, f.now(), f.allowed.has(hash)))
  await expect(f.service.inspect([first])).rejects.toThrow('Public card execution paused')
  const next = reference(256); f.allowed.add(next.sha256)
  await expect(f.service.inspect([next])).rejects.toThrow('Public sandbox input capacity reached')
  refresh.finish(response(first.sha256, f.now(), true))
  await older
  expect(() => scope.assert()).toThrow('Public card execution paused')
  await f.service.inspect([next])
  const requests = f.requests.length
  await expect(scope.checkNew()).rejects.toThrow('Public card execution paused')
  expect(f.requests).toHaveLength(requests)
})

it('deduplicates initial loads and includes their reservations in the same capacity limit', async () => {
  const f = fixture(), loading = pendingResponse()
  f.read(async hash => { await loading.promise; return response(hash, f.now(), false) })
  const requests = Array.from({ length: 256 }, (_, number) => f.service.inspect([reference(number)]))
  const duplicate = f.service.inspect([reference(0)])
  expect(f.requests).toHaveLength(256)
  await expect(f.service.inspect([reference(256)])).rejects.toThrow('Public sandbox input capacity reached')
  const rejected = expect(Promise.all([...requests, duplicate])).rejects.toThrow('Public card execution paused')
  loading.finish(Response.json({}))
  await rejected
  await Promise.allSettled([...requests, duplicate])
  const valid = reference(256); f.allowed.add(valid.sha256)
  f.read(async hash => response(hash, f.now(), f.allowed.has(hash)))
  const scope = await f.service.inspect([valid])
  expect(() => scope.assert()).not.toThrow()
})
