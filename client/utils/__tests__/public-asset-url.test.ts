import { describe, expect, it } from 'vitest'

import { publicAssetUrl } from '../public-asset-url'

describe('publicAssetUrl', () => {
  it('maps logical asset paths to the pinned public source', () => {
    expect(publicAssetUrl('/assets/moor/icons/horse.png')).toBe(
      'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/94c1b4f8864a946c79c66940fb3357b4101cb08c/assets/moor/icons/horse.png?v=94c1b4f8864a946c79c66940fb3357b4101cb08c',
    )
    expect(publicAssetUrl('assets/moor/icons/fuel.png')).toBe(
      'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/94c1b4f8864a946c79c66940fb3357b4101cb08c/assets/moor/icons/fuel.png?v=94c1b4f8864a946c79c66940fb3357b4101cb08c',
    )
    expect(publicAssetUrl('/card-art/custom.png')).toBe('/card-art/custom.png')
  })
})
