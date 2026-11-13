import { describe, expect, it } from 'vitest'

import { publicAssetUrl } from '../public-asset-url'

describe('publicAssetUrl', () => {
  it('maps logical asset paths to the pinned public source', () => {
    expect(publicAssetUrl('/assets/moor/icons/horse.png')).toBe(
      'https://titanxxh.github.io/open-agricola-assets/assets/moor/icons/horse.png?v=39ac28b76cd3e5f3802dd3127d40e0d7b9fe9a1a',
    )
    expect(publicAssetUrl('assets/moor/icons/fuel.png')).toBe(
      'https://titanxxh.github.io/open-agricola-assets/assets/moor/icons/fuel.png?v=39ac28b76cd3e5f3802dd3127d40e0d7b9fe9a1a',
    )
    expect(publicAssetUrl('/card-art/custom.png')).toBe('/card-art/custom.png')
  })
})
