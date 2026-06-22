// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { setPage } from '../PageRouter'

describe('setPage URL hygiene', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/open-agricola/')
  })

  it('removes workshop card detail params when returning to the lobby', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?page=workshop&card=ZX7rJJXxG53bQqEeSU19h',
    )

    setPage('lobby')

    expect(window.location.pathname + window.location.search).toBe('/open-agricola/')
  })

  it('does not carry workshop card params into game URLs', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?page=workshop&card=ZX7rJJXxG53bQqEeSU19h&bg=winter',
    )

    setPage('game', { transport: 'ws', room: 'room-1' })

    expect(window.location.pathname).toBe('/open-agricola/')
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
      page: 'game',
      bg: 'winter',
      transport: 'ws',
      room: 'room-1',
    })
  })

  it('does not carry game room params into workshop or settings URLs', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?page=game&transport=ws&room=room-1&player=p2&draftMode=simultaneous&enableThroughTheSeasons=true',
    )

    setPage('workshop')
    expect(window.location.pathname + window.location.search).toBe('/open-agricola/?page=workshop')

    setPage('settings')
    expect(window.location.pathname + window.location.search).toBe('/open-agricola/?page=settings')
  })

  it('drops the workshop view param when returning to the lobby', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?page=workshop&view=sandbox',
    )

    setPage('lobby')

    expect(window.location.pathname + window.location.search).toBe('/open-agricola/')
  })

  it('drops the workshop view param when navigating to settings', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?page=workshop&view=editor',
    )

    setPage('settings')

    expect(window.location.pathname + window.location.search).toBe('/open-agricola/?page=settings')
  })
})
