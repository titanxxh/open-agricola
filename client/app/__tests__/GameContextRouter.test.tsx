// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameContextRouter } from '../GameContextRouter'

vi.mock('../../contexts/LocaleContext', () => ({
  useLocale: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params
        ? Object.entries(params).reduce(
            (value, [name, replacement]) =>
              value.replace(`{${name}}`, String(replacement)),
            key,
          )
        : key,
  }),
}))

vi.mock('../../components/common/BrandMark', () => ({
  BrandMark: () => <div>Open Agricola</div>,
}))

vi.mock('../../components/common/GameLoadScreen', () => ({
  GameLoadScreen: () => <div>loading</div>,
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const stubResponse = (body: unknown, status = 200) => {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify(body), { status })
  ))
}

describe('GameContextRouter', () => {
  it('does not resolve or mount public dependencies without a context link', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    render(<GameContextRouter><div>active app</div></GameContextRouter>)

    expect(screen.getByText('active app')).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('routes active contexts through the authenticated app', async () => {
    window.history.replaceState(null, '', '/?context=active-room')
    stubResponse({
      ok: true,
      roomId: 'active-room',
      lifecycle: 'active',
      phase: 'playing',
      playerIndex: 0,
      roomVersion: 2,
      stepNo: 1,
    })

    render(<GameContextRouter><div>active app</div></GameContextRouter>)

    expect(await screen.findByText('active app')).toBeVisible()
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/game-contexts/active-room',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('keeps the full active context link behind login', async () => {
    window.history.replaceState(null, '', '/?context=active-room')
    stubResponse({
      ok: false,
      code: 'login_required',
      lifecycle: 'active',
      message: 'Login required',
      returnTo: '/?context=active-room',
    }, 401)

    render(<GameContextRouter><div>login app</div></GameContextRouter>)

    expect(await screen.findByText('login app')).toBeVisible()
    expect(window.location.search).toBe('?context=active-room')
  })

  it('shows completed results without mounting the active app', async () => {
    window.history.replaceState(null, '', '/?context=completed-room')
    stubResponse({
      ok: true,
      roomId: 'completed-room',
      lifecycle: 'completed',
      replayStatus: 'legacy_no_replay',
      result: {
        startedAt: 1,
        finishedAt: 2,
        roundsPlayed: 14,
        playerCount: 2,
        enableCommunityDeck: false,
        enableParentCards: false,
        enableThroughTheSeasons: false,
        enableFarmersOfTheMoor: false,
        players: [
          { playerIndex: 0, displayName: 'Alice', score: 42 },
          { playerIndex: 1, displayName: 'Bob', score: 35 },
        ],
      },
    })

    render(<GameContextRouter><div>active app</div></GameContextRouter>)

    expect(await screen.findByText('platform.gameContext.completedTitle')).toBeVisible()
    expect(screen.getByText('Alice: platform.gameContext.score')).toBeVisible()
    expect(screen.queryByText('active app')).not.toBeInTheDocument()
  })

  it.each([
    [
      { ok: true, roomId: 'expired-room', lifecycle: 'expired' },
      'platform.gameContext.expiredTitle',
    ],
    [
      {
        ok: true,
        roomId: 'removed-room',
        lifecycle: 'removed',
        reason: 'legal',
      },
      'platform.gameContext.removedTitle',
    ],
    [
      {
        ok: false,
        code: 'not_participant',
        lifecycle: 'active',
        message: 'Not participant',
      },
      'platform.gameContext.notParticipantTitle',
    ],
  ])('shows the lifecycle status page for %j', async (body, title) => {
    window.history.replaceState(null, '', '/?context=room')
    stubResponse(body)

    render(<GameContextRouter><div>active app</div></GameContextRouter>)

    expect(await screen.findByText(title)).toBeVisible()
    expect(screen.queryByText('active app')).not.toBeInTheDocument()
  })
})
