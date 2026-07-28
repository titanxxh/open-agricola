// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { createHash } from 'node:crypto'
import { StrictMode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameContextRouter } from '../GameContextRouter'

const localeContext = vi.hoisted(() => {
  const t = (key: string, params?: Record<string, string | number>) =>
    params
      ? Object.entries(params).reduce(
          (value, [name, replacement]) =>
            value.replace(`{${name}}`, String(replacement)),
          key,
        )
      : key
  return {
    locale: 'en',
    setLocale: vi.fn(),
    t,
    defaultT: t,
  }
})

vi.mock('../../contexts/LocaleContext', () => ({
  useLocale: () => localeContext,
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
  localeContext.locale = 'en'
  localeContext.t = localeContext.defaultT
  localeContext.setLocale.mockReset()
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

  it('mounts login without resolving the preserved replay context', () => {
    window.history.replaceState(
      null,
      '',
      '/?page=login&context=completed-room&step=4&bugReport=draft-1',
    )
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    render(<GameContextRouter><div>login app</div></GameContextRouter>)

    expect(screen.getByText('login app')).toBeVisible()
    expect(fetch).not.toHaveBeenCalled()
    expect(window.location.search).toContain('context=completed-room')
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

  it.each(['available', 'corrupt'] as const)(
    'verifies the pinned viewer and requires a perspective before mounting it (%s anchor)',
    async (anchorState) => {
    const viewerManifest = JSON.stringify({
      entrypoint: 'index.html',
      files: { 'index.html': '0'.repeat(64) },
    })
    const viewerBuildId = createHash('sha256').update(viewerManifest).digest('hex')
    const context = {
      ok: true,
      roomId: 'completed-room',
      lifecycle: 'completed',
      replayStatus: 'available',
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
      replay: {
        firstStepNo: 0,
        lastStepNo: 1,
        missingPrefix: false,
        schemaVersion: 1,
        viewerBuildId,
      },
    }
    const replayManifest = {
      ok: true,
      kind: 'replayManifest',
      apiVersion: 1,
      roomId: 'completed-room',
      schemaVersion: 1,
      viewerBuildId,
      gameBuildId: 'game-build',
      firstStepNo: 0,
      lastStepNo: 1,
      missingPrefix: false,
      participants: [
        { playerIndex: 0, displayName: 'Alice' },
        { playerIndex: 1, displayName: 'Bob' },
      ],
      segments: [{ checkpointStepNo: 0, firstStepNo: 0, lastStepNo: 1 }],
      steps: [
        {
          stepNo: 0,
          roomVersion: 1,
          checkpointStepNo: 0,
          playerIndex: null,
          commandType: 'initial',
          intent: {},
          frameHash: '1'.repeat(64),
          createdAt: 1,
        },
        {
          stepNo: 1,
          roomVersion: 2,
          checkpointStepNo: 0,
          playerIndex: 0,
          commandType: 'action',
          intent: {},
          frameHash: '2'.repeat(64),
          createdAt: 2,
        },
      ],
      corruptRanges: [],
      customCards: [],
    }
    const frameHash = '1'.repeat(64)
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/game-contexts/')) {
        return new Response(JSON.stringify(context))
      }
      if (url.includes(`/anchors/0?frame=${frameHash}`)) {
        const body = anchorState === 'available'
          ? {
              ok: true,
              kind: 'replayAnchor',
              apiVersion: 1,
              roomId: 'completed-room',
              schemaVersion: 1,
              viewerBuildId,
              anchor: { stepNo: 0, frameHash },
              step: {},
            }
          : {
              ok: false,
              code: 'replay_segment_unavailable',
              lifecycle: 'completed',
              message: 'Replay segment failed its integrity check',
              verifiedAnchor: { stepNo: 0, frameHash },
              unavailableRange: {
                firstStepNo: 0,
                lastStepNo: 0,
                nextCheckpointStepNo: 1,
              },
            }
        return new Response(JSON.stringify(body), {
          status: anchorState === 'available' ? 200 : 503,
        })
      }
      if (url.endsWith('/manifest.json')) {
        return new Response(viewerManifest)
      }
      return new Response(JSON.stringify(replayManifest))
    })
    vi.stubGlobal('fetch', fetch)
    window.history.replaceState(
      null,
      '',
      `/?context=completed-room&step=0&frame=${frameHash}`,
    )

    const { rerender } = render(
      <GameContextRouter><div>active app</div></GameContextRouter>,
    )

    const perspectiveButtons = await screen.findAllByRole('button', {
      name: 'platform.gameContext.watchAs',
    })
    expect(screen.getByRole('button', { name: 'Display language' }))
      .toBeVisible()
    expect(screen.queryByTitle('platform.gameContext.replayFrameTitle')).not.toBeInTheDocument()
    fireEvent.click(perspectiveButtons[0]!)

    const iframe = await screen.findByTitle('platform.gameContext.replayFrameTitle')
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts')
    expect(iframe).toHaveAttribute('credentialless')
    expect(iframe).toHaveAttribute(
      'src',
      expect.stringContaining(`/replay-viewers/${viewerBuildId}/index.html?`),
    )
    expect(
      new URL(iframe.getAttribute('src')!, window.location.href).searchParams.get('api'),
    ).toBe(window.location.origin)
    expect(window.location.search).toContain('perspective=p1')
    expect(new URLSearchParams(window.location.search).get('step')).toBe('0')
    expect(new URLSearchParams(window.location.search).get('frame')).toBe(frameHash)
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/replays/completed-room/manifest',
      expect.objectContaining({ credentials: 'omit' }),
    )
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/replays/completed-room/anchors/0?frame=${frameHash}`,
      expect.objectContaining({ credentials: 'omit' }),
    )

    const initialSrc = iframe.getAttribute('src')
    fireEvent(window, new MessageEvent('message', {
      source: (iframe as HTMLIFrameElement).contentWindow,
      data: {
        type: 'open-agricola-replay-location',
        perspective: 'p1',
        layout: 'timeline',
        step: 1,
      },
    }))
    expect(new URLSearchParams(window.location.search).get('step')).toBe('1')
    expect(new URLSearchParams(window.location.search).get('frame')).toBe('2'.repeat(64))
    expect(iframe).toHaveAttribute('src', initialSrc)

    const fetchCount = fetch.mock.calls.length
    localeContext.locale = 'zh'
    localeContext.t = (key, params) => `zh:${localeContext.defaultT(key, params)}`
    rerender(<GameContextRouter><div>active app</div></GameContextRouter>)
    expect(fetch).toHaveBeenCalledTimes(fetchCount)
    expect(await screen.findByTitle('zh:platform.gameContext.replayFrameTitle'))
      .toHaveAttribute('src', expect.stringContaining('locale=zh'))
    },
  )

  it('keeps completed results and a saved draft visible when replay verification fails', async () => {
    window.history.replaceState(
      null,
      '',
      '/?context=completed-room&bugReport=draft-1',
    )
    const context = {
      ok: true,
      roomId: 'completed-room',
      lifecycle: 'completed',
      replayStatus: 'available',
      result: {
        players: [{ playerIndex: 0, displayName: 'Alice', score: 42 }],
      },
      replay: {
        firstStepNo: 0,
        lastStepNo: 1,
        missingPrefix: false,
        schemaVersion: 1,
        viewerBuildId: 'a'.repeat(64),
      },
    }
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/v1/game-contexts/completed-room')) {
        return new Response(JSON.stringify(context))
      }
      if (url.includes('/api/v1/issue-submission-connection?')) {
        return new Response(JSON.stringify({
          ok: true,
          enabled: false,
          connected: false,
        }))
      }
      if (url.endsWith('/api/v1/bug-reports/draft-1')) {
        return new Response(JSON.stringify({
          ok: true,
          report: {
            submissionId: 'draft-1',
            roomId: 'completed-room',
            reporterUserId: 'u1',
            playerIndex: 0,
            lifecycle: 'completed',
            roomVersion: 2,
            stepNo: 1,
            frameHash: 'b'.repeat(64),
            phenomenon: 'The replay is unavailable',
            authorIdentity: null,
            status: 'draft',
            issueNumber: null,
            issueUrl: null,
            lastErrorCode: null,
          },
        }))
      }
      return new Response(JSON.stringify({
        ok: false,
        code: 'viewer_unavailable',
        message: 'Unavailable',
      }))
    })
    vi.stubGlobal('fetch', fetch)

    render(<GameContextRouter><div>active app</div></GameContextRouter>)

    expect(await screen.findByRole('alert')).toBeVisible()
    expect(screen.getByText('Alice')).toBeVisible()
    expect(screen.getByText('platform.gameContext.score')).toBeVisible()
    expect(await screen.findByDisplayValue('The replay is unavailable')).toBeVisible()
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

  it('opens retained expired evidence in the authenticated participant view', async () => {
    const frameHash = 'a'.repeat(64)
    const viewerManifest = JSON.stringify({
      entrypoint: 'index.html',
      files: { 'index.html': '0'.repeat(64) },
    })
    const viewerBuildId = createHash('sha256').update(viewerManifest).digest('hex')
    window.history.replaceState(
      null,
      '',
      `/?context=expired-room&step=5&frame=${frameHash}&perspective=open`,
    )
    const frame = { round: 1, players: [{ id: 'p2' }] }
    const evidence = {
      ok: true as const,
      kind: 'reportedEvidence' as const,
      apiVersion: 1 as const,
      roomId: 'expired-room',
      schemaVersion: 1,
      viewerBuildId,
      stepNo: 5,
      frameHash,
      perspective: 'p2' as const,
      frame,
      customCards: [{
        cardType: 'minor' as const,
        cardJson: {
          id: 'CUSTOM_1',
          name: 'Custom',
          deck: 'X',
          number: 1,
        },
        artUrl: `/replay-assets/${'f'.repeat(64)}`,
      }],
    }
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith('/api/v1/game-contexts/expired-room')) {
        return new Response(JSON.stringify({
          ok: true,
          roomId: 'expired-room',
          lifecycle: 'expired',
        }))
      }
      if (url.endsWith(
        `/api/v1/game-contexts/expired-room/evidence/5?frame=${frameHash}`,
      )) {
        return new Response(JSON.stringify(evidence))
      }
      if (url.endsWith(`/replay-viewers/${viewerBuildId}/manifest.json`)) {
        return new Response(viewerManifest)
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetch)

    render(<GameContextRouter><div>active app</div></GameContextRouter>)

    const iframe = await screen.findByTitle('platform.gameContext.replayFrameTitle')
    expect(screen.getByText('platform.gameContext.reportedEvidenceTitle'))
      .toBeVisible()
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts')
    const src = new URL(iframe.getAttribute('src')!, window.location.href)
    expect(src.pathname).toBe(`/replay-viewers/${viewerBuildId}/index.html`)
    expect(src.searchParams.get('mode')).toBe('reported-evidence')
    expect(src.searchParams.get('perspective')).toBe('p2')
    expect(src.searchParams.get('parentOrigin')).toBe(window.location.origin)
    const postMessage = vi.spyOn(
      (iframe as HTMLIFrameElement).contentWindow!,
      'postMessage',
    )
    fireEvent(window, new MessageEvent('message', {
      source: (iframe as HTMLIFrameElement).contentWindow,
      data: { type: 'open-agricola-reported-evidence-ready' },
    }))
    expect(postMessage).toHaveBeenCalledWith({
      type: 'open-agricola-reported-evidence',
      evidence,
    }, '*')
    expect(fetch).toHaveBeenCalledWith(
      `/api/v1/game-contexts/expired-room/evidence/5?frame=${frameHash}`,
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it.each([
    ['expired', undefined, 'platform.gameContext.expiredTitle'],
    ['removed', 'legal', 'platform.gameContext.removedTitle'],
  ] as const)('reopens a saved draft on a %s context', async (
    lifecycle,
    reason,
    title,
  ) => {
    const roomId = `${lifecycle}-room`
    window.history.replaceState(
      null,
      '',
      `/?context=${roomId}&bugReport=submission-1`,
    )
    const fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      if (url.endsWith(`/api/v1/game-contexts/${roomId}`)) {
        return new Response(JSON.stringify({
          ok: true,
          roomId,
          lifecycle,
          ...(reason ? { reason } : {}),
        }))
      }
      if (url.includes('/api/v1/issue-submission-connection?')) {
        return new Response(JSON.stringify({
          ok: true,
          enabled: false,
          connected: false,
        }))
      }
      if (url.endsWith('/api/v1/bug-reports/submission-1')) {
        return new Response(JSON.stringify({
          ok: true,
          report: {
            submissionId: 'submission-1',
            roomId,
            reporterUserId: 'u1',
            playerIndex: 0,
            lifecycle: 'active',
            roomVersion: 8,
            stepNo: 5,
            frameHash: 'a'.repeat(64),
            phenomenon: 'The game froze',
            authorIdentity: null,
            status: 'draft',
            issueNumber: null,
            issueUrl: null,
            lastErrorCode: null,
          },
        }))
      }
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetch)

    render(<GameContextRouter><div>active app</div></GameContextRouter>)

    expect(await screen.findByText(title))
      .toBeVisible()
    expect(await screen.findByText('platform.bugReport.title')).toBeVisible()
    expect(screen.getByDisplayValue('The game froze')).toBeVisible()
  })

  it('completes bug-report OAuth before routing an expired context', async () => {
    window.history.replaceState(
      null,
      '',
      '/?context=expired-room&bugReportConnection=pending'
        + '#bugReportOAuthState=state-1&bugReportOAuthCode=code-1',
    )
    const fetch = vi.fn(async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = String(input)
      if (url.endsWith('/api/v1/issue-submission-connection/github/complete')) {
        expect(init).toMatchObject({
          method: 'POST',
          credentials: 'include',
        })
        expect(JSON.parse(String(init?.body))).toEqual({
          state: 'state-1',
          code: 'code-1',
        })
        return new Response(JSON.stringify({
          ok: true,
          enabled: true,
          connected: true,
        }))
      }
      return new Response(JSON.stringify({
        ok: true,
        roomId: 'expired-room',
        lifecycle: 'expired',
      }))
    })
    vi.stubGlobal('fetch', fetch)

    render(
      <StrictMode>
        <GameContextRouter><div>active app</div></GameContextRouter>
      </StrictMode>,
    )

    expect(await screen.findByText('platform.gameContext.expiredTitle'))
      .toBeVisible()
    await waitFor(() => {
      expect(window.location.hash).toBe('')
      expect(window.location.search).toContain(
        'bugReportConnection=connected',
      )
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/issue-submission-connection/github/complete',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(fetch.mock.calls.filter(([input]) =>
      String(input).endsWith(
        '/api/v1/issue-submission-connection/github/complete',
      ),
    )).toHaveLength(1)
  })
})
