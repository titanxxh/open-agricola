import { describe, expect, it } from 'vitest'

import { resolveParentCardAssetUrls } from '../parent-assets'

describe('resolveParentCardAssetUrls', () => {
  it('resolves logical Parent Card assets through the pinned public source', () => {
    expect(resolveParentCardAssetUrls({ front: 'PR01.png', back: 'mother' })).toEqual({
      portraitUrl: 'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/452535ad419b8ea546ef73d9a410847bfae08e25/assets/parents/portrait/PR01.png?v=452535ad419b8ea546ef73d9a410847bfae08e25',
      backUrl: 'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/452535ad419b8ea546ef73d9a410847bfae08e25/assets/parents/backs/mother.png?v=452535ad419b8ea546ef73d9a410847bfae08e25',
    })
  })
})
