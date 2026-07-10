import { describe, expect, it } from 'vitest'
import { isSandboxListenerScope, sandboxListenerScopes } from '../sandbox-listener-scopes'

describe('sandboxListenerScopes', () => {
  it('accepts exactly the sandbox listener scopes', () => {
    expect(sandboxListenerScopes).toEqual(['player', 'opponent', 'any'])
    expect(sandboxListenerScopes.every(isSandboxListenerScope)).toBe(true)
    expect(isSandboxListenerScope('invalid')).toBe(false)
  })
})
