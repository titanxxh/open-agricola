import { describe, expect, it } from 'vitest'

import { publicAssetUrl } from '../public-asset-url'

describe('publicAssetUrl', () => {
  it('maps logical asset paths to the pinned public source', () => {
    expect(publicAssetUrl('/assets/moor/icons/horse.png')).toBe(
      'https://titanxxh.github.io/open-agricola-assets/assets/moor/icons/horse.png?v=dcd4ecbdb5cbf13520d833e0e7f5f872e5f9ec9c',
    )
    expect(publicAssetUrl('assets/moor/icons/fuel.png')).toBe(
      'https://titanxxh.github.io/open-agricola-assets/assets/moor/icons/fuel.png?v=dcd4ecbdb5cbf13520d833e0e7f5f872e5f9ec9c',
    )
    expect(publicAssetUrl('/card-art/custom.png')).toBe('/card-art/custom.png')
  })
})
