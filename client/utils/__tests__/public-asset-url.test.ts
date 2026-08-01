import { describe, expect, it } from 'vitest'

import { publicAssetUrl } from '../public-asset-url'

describe('publicAssetUrl', () => {
  it('maps logical asset paths to the pinned public source', () => {
    expect(publicAssetUrl('/assets/moor/icons/horse.png')).toBe(
      'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/a727be4ee9c4dafb4cab792405ecd2033e3bde0f/assets/moor/icons/horse.png?v=a727be4ee9c4dafb4cab792405ecd2033e3bde0f',
    )
    expect(publicAssetUrl('assets/moor/icons/fuel.png')).toBe(
      'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/a727be4ee9c4dafb4cab792405ecd2033e3bde0f/assets/moor/icons/fuel.png?v=a727be4ee9c4dafb4cab792405ecd2033e3bde0f',
    )
    expect(publicAssetUrl('/card-art/custom.png')).toBe('/card-art/custom.png')
  })
})
