import { describe, it, expect, beforeEach } from 'vitest'
import { ActionHookRegistry } from '../hooks'

const actionHooks = new ActionHookRegistry()


describe('unregisterActionHook', () => {
  beforeEach(() => {
    actionHooks.clear()
  })

  it('removes a hook by id', () => {
    actionHooks.register({
      id: 'test-hook-1',
      phases: ['after'],
      handler: () => undefined,
    })
    actionHooks.register({
      id: 'test-hook-2',
      phases: ['after'],
      handler: () => undefined,
    })
    expect(actionHooks.getRegistered()).toHaveLength(2)

    actionHooks.unregister('test-hook-1')

    const remaining = actionHooks.getRegistered()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.id).toBe('test-hook-2')
  })

  it('is a no-op when id is not found', () => {
    actionHooks.register({
      id: 'test-hook-x',
      phases: ['after'],
      handler: () => undefined,
    })
    expect(actionHooks.getRegistered()).toHaveLength(1)

    expect(() => actionHooks.unregister('does-not-exist')).not.toThrow()

    expect(actionHooks.getRegistered()).toHaveLength(1)
  })

  it('removes only the first match if multiple registered with same id (defensive)', () => {
    actionHooks.register({ id: 'dup', phases: ['after'], handler: () => undefined })
    actionHooks.register({ id: 'dup', phases: ['after'], handler: () => undefined })
    expect(actionHooks.getRegistered()).toHaveLength(2)

    actionHooks.unregister('dup')

    expect(actionHooks.getRegistered()).toHaveLength(1)
    expect(actionHooks.getRegistered()[0]!.id).toBe('dup')
  })
})
