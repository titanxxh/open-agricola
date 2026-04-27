// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  buildWorkshopCardUrl,
  buildWorkshopUrl,
  getWorkshopCardIdFromSearch,
  getWorkshopPrActionState,
  getWorkshopViewFromSearch,
} from '../../WorkshopPage'

describe('WorkshopPage card detail routing', () => {
  it('adds the selected workshop card id to the page URL', () => {
    const url = buildWorkshopCardUrl('/open-agricola/', '?page=workshop&sort=recent', 'card-db-1')

    expect(url).toBe('/open-agricola/?page=workshop&sort=recent&card=card-db-1')
  })

  it('removes the selected workshop card id when returning to the workshop list', () => {
    const url = buildWorkshopCardUrl('/open-agricola/', '?page=workshop&card=card-db-1', null)

    expect(url).toBe('/open-agricola/?page=workshop')
  })

  it('reads the selected workshop card id from the URL', () => {
    expect(getWorkshopCardIdFromSearch('?page=workshop&card=card-db-1')).toBe('card-db-1')
    expect(getWorkshopCardIdFromSearch('?page=workshop')).toBeNull()
  })
})

describe('WorkshopPage view routing', () => {
  it('writes the sandbox view into the URL', () => {
    const url = buildWorkshopUrl('/open-agricola/', '?page=workshop', { view: 'sandbox' })
    expect(url).toBe('/open-agricola/?page=workshop&view=sandbox')
  })

  it('writes the editor view into the URL', () => {
    const url = buildWorkshopUrl('/open-agricola/', '?page=workshop', { view: 'editor' })
    expect(url).toBe('/open-agricola/?page=workshop&view=editor')
  })

  it('clears the view query parameter when switching back to home', () => {
    const url = buildWorkshopUrl('/open-agricola/', '?page=workshop&view=sandbox', { view: null })
    expect(url).toBe('/open-agricola/?page=workshop')
  })

  it('replaces an existing view value rather than appending', () => {
    const url = buildWorkshopUrl('/open-agricola/', '?page=workshop&view=sandbox', { view: 'editor' })
    expect(url).toBe('/open-agricola/?page=workshop&view=editor')
  })

  it('preserves unrelated query parameters', () => {
    const url = buildWorkshopUrl('/open-agricola/', '?page=workshop&sort=recent', { view: 'sandbox' })
    expect(url).toBe('/open-agricola/?page=workshop&sort=recent&view=sandbox')
  })

  it('clears the card parameter when entering a non-detail view', () => {
    const url = buildWorkshopUrl(
      '/open-agricola/',
      '?page=workshop&card=card-db-1',
      { view: 'sandbox', card: null },
    )
    expect(url).toBe('/open-agricola/?page=workshop&view=sandbox')
  })

  it('reads the view from the URL when present', () => {
    expect(getWorkshopViewFromSearch('?page=workshop&view=sandbox')).toBe('sandbox')
    expect(getWorkshopViewFromSearch('?page=workshop&view=editor')).toBe('editor')
  })

  it('returns null when no recognised view is in the URL', () => {
    expect(getWorkshopViewFromSearch('?page=workshop')).toBeNull()
    expect(getWorkshopViewFromSearch('?page=workshop&view=detail')).toBeNull()
    expect(getWorkshopViewFromSearch('?page=workshop&view=home')).toBeNull()
  })
})

describe('WorkshopPage PR action state', () => {
  it('keeps the PR area visible for the author before publishing', () => {
    const state = getWorkshopPrActionState({
      enabled: true,
      isAuthor: true,
      status: 'draft',
      githubPrUrl: null,
      githubPrStatus: null,
    })

    expect(state.visible).toBe(true)
    expect(state.disabled).toBe(true)
    expect(state.buttonLabel).toBe('先发布后可发起 PR')
  })

  it('allows published author cards to start a PR', () => {
    const state = getWorkshopPrActionState({
      enabled: true,
      isAuthor: true,
      status: 'published',
      githubPrUrl: null,
      githubPrStatus: null,
    })

    expect(state.visible).toBe(true)
    expect(state.disabled).toBe(false)
    expect(state.buttonLabel).toBe('发起 PR 到主仓库')
  })
})
