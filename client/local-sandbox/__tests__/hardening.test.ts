// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { stripWorkerCapabilities } from '../worker-capabilities.ts'
import { readLocalSandboxConfig, stashLocalSandboxConfig } from '../workshop-launch.ts'
import type { LocalGameConfig } from '../protocol.ts'

describe('stripWorkerCapabilities', () => {
  it('removes plain and read-only inherited globals, reporting none left', () => {
    // Simulate WorkerGlobalScope: indexedDB/caches/navigator are read-only
    // getters inherited from the prototype (assignment throws).
    const proto: Record<string, unknown> = {}
    for (const key of ['indexedDB', 'caches', 'navigator']) {
      Object.defineProperty(proto, key, { get: () => ({ open() {} }), configurable: false })
    }
    const scope: Record<string, unknown> = Object.create(proto)
    scope.fetch = () => {}
    scope.XMLHttpRequest = function () {}
    // Nested-worker construction primitives must go too.
    scope.Worker = function () {}
    scope.Blob = function () {}
    scope.URL = function () {}

    const failures = stripWorkerCapabilities(scope)

    expect(failures).toEqual([])
    for (const key of ['fetch', 'XMLHttpRequest', 'indexedDB', 'caches', 'navigator', 'Worker', 'Blob', 'URL']) {
      expect(scope[key], `${key} should be gone`).toBeUndefined()
    }

    // The shadow must be non-configurable so card code can't `delete` it to
    // re-expose the inherited getter.
    expect(Object.getOwnPropertyDescriptor(scope, 'indexedDB')?.configurable).toBe(false)
    const deleted = Reflect.deleteProperty(scope, 'indexedDB')
    expect(deleted).toBe(false)
    expect(scope.indexedDB).toBeUndefined()
  })
})

describe('readLocalSandboxConfig owner scoping', () => {
  const config: LocalGameConfig = { cards: [], playerCount: 2, seed: 1 }
  afterEach(() => sessionStorage.clear())

  it('returns the config for the owner that stashed it', () => {
    stashLocalSandboxConfig(config, 'userA')
    expect(readLocalSandboxConfig('userA')).toEqual(config)
  })

  it('rejects and clears a stash left by a different owner', () => {
    stashLocalSandboxConfig(config, 'userA')
    expect(readLocalSandboxConfig('userB')).toBeNull()
    // The mismatched stash is dropped so it can't be read again.
    expect(readLocalSandboxConfig('userA')).toBeNull()
  })
})
