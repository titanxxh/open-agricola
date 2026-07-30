import { describe, expect, it } from 'vitest'

import { publicAssetUrl } from '../public-asset-url'

describe('publicAssetUrl', () => {
  it('maps logical asset paths to the pinned public source', () => {
    expect(publicAssetUrl('/assets/moor/icons/horse.png')).toBe(
      'https://titanxxh.github.io/open-agricola-assets/assets/moor/icons/horse.png?v=452535ad419b8ea546ef73d9a410847bfae08e25',
    )
    expect(publicAssetUrl('assets/moor/icons/fuel.png')).toBe(
      'https://titanxxh.github.io/open-agricola-assets/assets/moor/icons/fuel.png?v=452535ad419b8ea546ef73d9a410847bfae08e25',
    )
    expect(publicAssetUrl('/card-art/custom.png')).toBe('/card-art/custom.png')
  })
})
