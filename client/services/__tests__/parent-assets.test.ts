import { describe, expect, it } from 'vitest'

import { resolveParentCardAssetUrls } from '../parent-assets'

describe('resolveParentCardAssetUrls', () => {
  it('resolves logical Parent Card assets through the pinned public source', () => {
    expect(resolveParentCardAssetUrls({ front: 'PR01.png', back: 'mother' })).toEqual({
      portraitUrl: 'https://titanxxh.github.io/open-agricola-assets/assets/parents/portrait/PR01.png?v=8675d8a6dc3950b616c64043f0d7809f7abc3a3e',
      backUrl: 'https://titanxxh.github.io/open-agricola-assets/assets/parents/backs/mother.png?v=8675d8a6dc3950b616c64043f0d7809f7abc3a3e',
    })
  })
})
