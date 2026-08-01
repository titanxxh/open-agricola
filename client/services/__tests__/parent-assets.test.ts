import { describe, expect, it } from 'vitest'

import { resolveParentCardAssetUrls } from '../parent-assets'

describe('resolveParentCardAssetUrls', () => {
  it('resolves logical Parent Card assets through the pinned public source', () => {
    expect(resolveParentCardAssetUrls({ front: 'PR01.png', back: 'mother' })).toEqual({
      portraitUrl: 'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/a727be4ee9c4dafb4cab792405ecd2033e3bde0f/assets/parents/portrait/PR01.png?v=a727be4ee9c4dafb4cab792405ecd2033e3bde0f',
      backUrl: 'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/a727be4ee9c4dafb4cab792405ecd2033e3bde0f/assets/parents/backs/mother.png?v=a727be4ee9c4dafb4cab792405ecd2033e3bde0f',
    })
  })
})
