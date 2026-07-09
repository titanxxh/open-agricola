import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveParentCardAssetUrls } from '../parent-assets'

describe('resolveParentCardAssetUrls', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('resolves logical Parent Card assets to local public assets by default', () => {
    expect(resolveParentCardAssetUrls({ front: 'PR01.png', back: 'mother' })).toEqual({
      portraitUrl: '/assets/parents/portrait/PR01.png',
      backUrl: '/assets/parents/backs/mother.png',
    })
  })

  it('prefixes default Parent Card assets with the Vite base URL', () => {
    vi.stubEnv('BASE_URL', '/open-agricola/')

    expect(resolveParentCardAssetUrls({ front: 'PS12.png', back: 'father' })).toEqual({
      portraitUrl: '/open-agricola/assets/parents/portrait/PS12.png',
      backUrl: '/open-agricola/assets/parents/backs/father.png',
    })
  })
})
