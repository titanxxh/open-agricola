import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { publicAssetUrl } from '../public-asset-url'

describe('publicAssetUrl', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_PUBLIC_ASSET_BASE_URL', 'https://assets.example.test/')
    vi.stubEnv('VITE_PUBLIC_ASSET_VERSION', 'test-version')
  })

  afterEach(() => vi.unstubAllEnvs())

  it('maps logical asset paths to the configured public source and version', () => {
    expect(publicAssetUrl('/assets/moor/icons/horse.png')).toBe(
      'https://assets.example.test/assets/moor/icons/horse.png?v=test-version',
    )
    expect(publicAssetUrl('assets/moor/icons/fuel.png')).toBe(
      'https://assets.example.test/assets/moor/icons/fuel.png?v=test-version',
    )
    expect(publicAssetUrl('/card-art/custom.png')).toBe('/card-art/custom.png')
  })
})
