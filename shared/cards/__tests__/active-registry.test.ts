import { describe, it, expect, beforeEach } from 'vitest'
import { CardRegistry } from '../registry'
import { setActiveCardRegistry, getActiveCardRegistry, withActiveRegistry } from '../active-registry'

describe('active-registry', () => {
  beforeEach(() => setActiveCardRegistry(null))

  it('returns null when no active registry is set', () => {
    expect(getActiveCardRegistry()).toBeNull()
  })

  it('returns the registry after setActiveCardRegistry', () => {
    const r = new CardRegistry()
    setActiveCardRegistry(r)
    expect(getActiveCardRegistry()).toBe(r)
  })

  it('withActiveRegistry scopes the active registry and restores previous', () => {
    const outer = new CardRegistry()
    const inner = new CardRegistry()
    setActiveCardRegistry(outer)
    withActiveRegistry(inner, () => {
      expect(getActiveCardRegistry()).toBe(inner)
    })
    expect(getActiveCardRegistry()).toBe(outer)
  })
})
