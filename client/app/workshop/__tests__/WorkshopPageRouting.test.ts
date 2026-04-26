// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import {
  buildWorkshopCardUrl,
  getWorkshopCardIdFromSearch,
  getWorkshopPrActionState,
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
