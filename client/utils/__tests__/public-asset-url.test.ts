import { describe, expect, it } from 'vitest'

import { publicAssetUrl } from '../public-asset-url'

describe('publicAssetUrl', () => {
  it('maps logical asset paths to the pinned public source', () => {
    expect(publicAssetUrl('/assets/moor/icons/horse.png')).toBe(
      'https://titanxxh.github.io/open-agricola-assets/assets/moor/icons/horse.png?v=8675d8a6dc3950b616c64043f0d7809f7abc3a3e',
    )
    expect(publicAssetUrl('assets/moor/icons/fuel.png')).toBe(
      'https://titanxxh.github.io/open-agricola-assets/assets/moor/icons/fuel.png?v=8675d8a6dc3950b616c64043f0d7809f7abc3a3e',
    )
    expect(publicAssetUrl('/card-art/custom.png')).toBe('/card-art/custom.png')
  })
})
