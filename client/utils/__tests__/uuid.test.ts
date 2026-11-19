import { afterEach, describe, expect, it, vi } from 'vitest'
import { randomUuid } from '../uuid'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => { vi.unstubAllGlobals() })

describe('randomUuid', () => {
  it('falls back to getRandomValues where randomUUID is missing, as on the HTTP LAN launcher', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) })
    const first = randomUuid()
    expect(first).toMatch(UUID_V4)
    expect(randomUuid()).not.toBe(first)
  })

  it('uses randomUUID when the context provides it', () => {
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000000', getRandomValues: () => { throw new Error('unused') } })
    expect(randomUuid()).toBe('00000000-0000-4000-8000-000000000000')
  })
})
