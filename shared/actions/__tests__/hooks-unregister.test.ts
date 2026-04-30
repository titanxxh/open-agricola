import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerActionHook,
  unregisterActionHook,
  clearActionHooks,
  getRegisteredActionHooks,
} from '../hooks'

describe('unregisterActionHook', () => {
  beforeEach(() => {
    clearActionHooks()
  })

  it('removes a hook by id', () => {
    registerActionHook({
      id: 'test-hook-1',
      phases: ['after'],
      handler: () => undefined,
    })
    registerActionHook({
      id: 'test-hook-2',
      phases: ['after'],
      handler: () => undefined,
    })
    expect(getRegisteredActionHooks()).toHaveLength(2)

    unregisterActionHook('test-hook-1')

    const remaining = getRegisteredActionHooks()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.id).toBe('test-hook-2')
  })

  it('is a no-op when id is not found', () => {
    registerActionHook({
      id: 'test-hook-x',
      phases: ['after'],
      handler: () => undefined,
    })
    expect(getRegisteredActionHooks()).toHaveLength(1)

    expect(() => unregisterActionHook('does-not-exist')).not.toThrow()

    expect(getRegisteredActionHooks()).toHaveLength(1)
  })

  it('removes only the first match if multiple registered with same id (defensive)', () => {
    registerActionHook({ id: 'dup', phases: ['after'], handler: () => undefined })
    registerActionHook({ id: 'dup', phases: ['after'], handler: () => undefined })
    expect(getRegisteredActionHooks()).toHaveLength(2)

    unregisterActionHook('dup')

    expect(getRegisteredActionHooks()).toHaveLength(1)
    expect(getRegisteredActionHooks()[0]!.id).toBe('dup')
  })
})
