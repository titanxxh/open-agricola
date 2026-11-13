import { describe, expect, it } from 'vitest'

import { resolveParentCardAssetUrls } from '../parent-assets'

describe('resolveParentCardAssetUrls', () => {
  it('resolves logical Parent Card assets through the pinned public source', () => {
    expect(resolveParentCardAssetUrls({ front: 'PR01.png', back: 'mother' })).toEqual({
      portraitUrl: 'https://titanxxh.github.io/open-agricola-assets/assets/parents/portrait/PR01.png?v=39ac28b76cd3e5f3802dd3127d40e0d7b9fe9a1a',
      backUrl: 'https://titanxxh.github.io/open-agricola-assets/assets/parents/backs/mother.png?v=39ac28b76cd3e5f3802dd3127d40e0d7b9fe9a1a',
    })
  })
})
