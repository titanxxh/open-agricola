// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { buildRoomSearch } from '../../utils/game-room-url'
import { setPage } from '../../utils/platform-page-url'

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
      bg: 'winter',
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

  it('leaves a permanent context link when navigating back to the lobby', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?context=room-1&step=4&frame=hash&perspective=p1',
    )

    setPage('lobby')

    expect(window.location.pathname + window.location.search).toBe('/open-agricola/')
  })

  it('drops replay layout when returning to the lobby', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?context=room-1&perspective=p1&layout=board',
    )

    setPage('lobby')

    expect(window.location.pathname + window.location.search).toBe('/open-agricola/')
  })

  it('drops an encyclopedia entry when returning to the lobby', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?page=encyclopedia&entry=card%3AA004_Baseboards&bg=winter',
    )

    setPage('lobby')

    expect(window.location.pathname + window.location.search).toBe('/open-agricola/?bg=winter')
  })

  it('opens the encyclopedia without carrying game room params', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?page=game&transport=ws&room=room-1&player=p2&devMode=1',
    )

    setPage('encyclopedia')

    expect(window.location.pathname + window.location.search).toBe('/open-agricola/?page=encyclopedia')
  })

  it('preserves a saved bug report while changing pages', () => {
    window.history.replaceState(
      null,
      '',
      '/open-agricola/?page=game&room=room-1&bugReport=draft-1&bugReportConnection=connected',
    )

    setPage('settings')
    expect(Object.fromEntries(new URLSearchParams(window.location.search))).toEqual({
      bugReport: 'draft-1',
      page: 'settings',
    })

    setPage('lobby')
    expect(window.location.pathname + window.location.search)
      .toBe('/open-agricola/?bugReport=draft-1')
  })
})

describe('room links', () => {
  it('discards creation and seat parameters after a room is assigned', () => {
    expect(buildRoomSearch('room-1', '?page=game&transport=ws&player=p2&maxPlayers=4&draftMode=simultaneous&hotseat=1&enableSnakeOpening=true'))
      .toBe('?room=room-1')
  })

  it('keeps a reported frame and saved draft when shortening a room link', () => {
    expect(buildRoomSearch('room-1', '?context=room-1&step=4&frame=hash&perspective=p1&bugReport=draft-1'))
      .toBe('?room=room-1&step=4&frame=hash&perspective=p1&bugReport=draft-1')
  })

  it('preserves explicit development seats for multi-browser testing', () => {
    expect(buildRoomSearch('dev2', '?transport=ws&player=p2&devMode=1'))
      .toBe('?transport=ws&player=p2&devMode=1&room=dev2')
  })
})
