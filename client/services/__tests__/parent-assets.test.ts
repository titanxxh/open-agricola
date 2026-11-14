import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveParentCardAssetUrls } from '../parent-assets'

describe('resolveParentCardAssetUrls', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_ASSET_BASE_URL', 'https://assets.example.test/')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('resolves logical Parent Card assets through the configured public source', () => {
    expect(resolveParentCardAssetUrls({ front: 'PR01.png', back: 'mother' })).toEqual({
      portraitUrl: 'https://assets.example.test/assets/parents/portrait/PR01.png',
      backUrl: 'https://assets.example.test/assets/parents/backs/mother.png',
    })
  })
})
