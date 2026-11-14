import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { publicAssetUrl } from '../public-asset-url'

describe('publicAssetUrl', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_ASSET_BASE_URL', 'https://assets.example.test/')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('maps logical asset paths to the configured public source', () => {
    expect(publicAssetUrl('/assets/moor/icons/horse.png')).toBe(
      'https://assets.example.test/assets/moor/icons/horse.png',
    )
    expect(publicAssetUrl('assets/moor/icons/fuel.png')).toBe(
      'https://assets.example.test/assets/moor/icons/fuel.png',
    )
    expect(publicAssetUrl('/card-art/custom.png')).toBe('/card-art/custom.png')
  })
})
