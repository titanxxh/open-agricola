import { describe, expect, it } from 'vitest'

import { resolveParentCardAssetUrls } from '../parent-assets'

describe('resolveParentCardAssetUrls', () => {
  it('resolves logical Parent Card assets through the pinned public source', () => {
    expect(resolveParentCardAssetUrls({ front: 'PR01.png', back: 'mother' })).toEqual({
      portraitUrl: 'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/94c1b4f8864a946c79c66940fb3357b4101cb08c/assets/parents/portrait/PR01.png?v=94c1b4f8864a946c79c66940fb3357b4101cb08c',
      backUrl: 'https://raw.githubusercontent.com/titanxxh/open-agricola-assets/94c1b4f8864a946c79c66940fb3357b4101cb08c/assets/parents/backs/mother.png?v=94c1b4f8864a946c79c66940fb3357b4101cb08c',
    })
  })
})
