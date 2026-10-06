import { describe, expect, it } from 'vitest'

import { resolveParentCardAssetUrls } from '../parent-assets'

describe('resolveParentCardAssetUrls', () => {
  it('resolves logical Parent Card assets through the pinned public source', () => {
    expect(resolveParentCardAssetUrls({ front: 'PR01.png', back: 'mother' })).toEqual({
      portraitUrl: 'https://titanxxh.github.io/open-agricola-assets/assets/parents/portrait/PR01.png?v=dcd4ecbdb5cbf13520d833e0e7f5f872e5f9ec9c',
      backUrl: 'https://titanxxh.github.io/open-agricola-assets/assets/parents/backs/mother.png?v=dcd4ecbdb5cbf13520d833e0e7f5f872e5f9ec9c',
    })
  })
})
