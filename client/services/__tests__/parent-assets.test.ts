import { describe, expect, it } from 'vitest'

import { resolveParentCardAssetUrls } from '../parent-assets'

describe('resolveParentCardAssetUrls', () => {
  it('resolves logical Parent Card assets through the pinned public source', () => {
    expect(resolveParentCardAssetUrls({ front: 'PR01.png', back: 'mother' })).toEqual({
      portraitUrl: 'https://titanxxh.github.io/open-agricola-assets/assets/parents/portrait/PR01.png?v=452535ad419b8ea546ef73d9a410847bfae08e25',
      backUrl: 'https://titanxxh.github.io/open-agricola-assets/assets/parents/backs/mother.png?v=452535ad419b8ea546ef73d9a410847bfae08e25',
    })
  })
})
