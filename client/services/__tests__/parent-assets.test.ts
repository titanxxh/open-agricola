import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveParentCardAssetUrls } from '../parent-assets'

describe('resolveParentCardAssetUrls', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolves logical Parent Card assets to local public assets by default', () => {
    expect(resolveParentCardAssetUrls({ front: 'PR01.png', back: 'mother' })).toEqual({
      frontUrl: '/assets/parents/cards/PR01.png',
      backUrl: '/assets/parents/backs/mother.png',
    })
  })

  it('uses the Parent Assets base url override for deployed subpaths without using BASE_URL', () => {
    vi.stubEnv('VITE_PARENT_ASSETS_BASE_URL', '/open-agricola/assets/parents/')
    vi.stubEnv('BASE_URL', '/open-agricola/')

    expect(resolveParentCardAssetUrls({ front: 'PS12.png', back: 'father' })).toEqual({
      frontUrl: '/open-agricola/assets/parents/cards/PS12.png',
      backUrl: '/open-agricola/assets/parents/backs/father.png',
    })
  })
})
