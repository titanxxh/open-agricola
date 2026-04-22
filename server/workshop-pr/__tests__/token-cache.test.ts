import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TokenCache } from '../token-cache.ts'

describe('TokenCache', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('allocateHandshakeId returns a non-empty string', () => {
    const c = new TokenCache(60_000)
    const id = c.allocateHandshakeId('u1')
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(10)
  })

  it('bind + get yields the token for an allocated handshakeId', () => {
    const c = new TokenCache(60_000)
    const hs = c.allocateHandshakeId('u1')
    c.bind(hs, 'ghp_abc')
    const got = c.get(hs)
    expect(got).toEqual({ token: 'ghp_abc', userId: 'u1' })
  })

  it('hasPending returns true for allocated but not-yet-bound ids, false after bind', () => {
    const c = new TokenCache(60_000)
    const hs = c.allocateHandshakeId('u1')
    expect(c.hasPending(hs)).toBe(true)
    c.bind(hs, 'ghp_abc')
    expect(c.hasPending(hs)).toBe(false)
  })

  it('get returns undefined after TTL expires (bound)', () => {
    const c = new TokenCache(60_000)
    const hs = c.allocateHandshakeId('u1')
    c.bind(hs, 'ghp_abc')
    vi.advanceTimersByTime(61_000)
    expect(c.get(hs)).toBeUndefined()
  })

  it('hasPending returns false after TTL expires', () => {
    const c = new TokenCache(60_000)
    const hs = c.allocateHandshakeId('u1')
    vi.advanceTimersByTime(61_000)
    expect(c.hasPending(hs)).toBe(false)
  })

  it('delete clears both pending and bound state', () => {
    const c = new TokenCache(60_000)
    const hs = c.allocateHandshakeId('u1')
    c.bind(hs, 'ghp_x')
    c.delete(hs)
    expect(c.get(hs)).toBeUndefined()
    expect(c.hasPending(hs)).toBe(false)
  })

  it('bind on unknown handshakeId is a no-op (silent)', () => {
    const c = new TokenCache(60_000)
    c.bind('not-a-real-hs', 'ghp_x')
    expect(c.get('not-a-real-hs')).toBeUndefined()
  })

  it('bind on expired pending is a no-op', () => {
    const c = new TokenCache(60_000)
    const hs = c.allocateHandshakeId('u1')
    vi.advanceTimersByTime(61_000)
    c.bind(hs, 'ghp_x')
    expect(c.get(hs)).toBeUndefined()
  })
})
