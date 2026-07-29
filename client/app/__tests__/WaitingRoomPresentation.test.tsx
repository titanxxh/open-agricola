// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider, useAuth } from '../../contexts/AuthContext'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { REPLAY_CARD_SNAPSHOT_CONSENT_REQUIRED } from '../../../shared/contract/protocol/ws'
import { GameContainerApi } from '../GameContainerApi'

class WaitingRoomWebSocket {
  static readonly OPEN = 1
  static sent: Array<Record<string, unknown>> = []
  static requiresReplayConsent = false
  readonly readyState = WaitingRoomWebSocket.OPEN
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  private readonly messageListeners = new Set<(event: MessageEvent) => void>()

  constructor(_url: string) {
    queueMicrotask(() => this.onopen?.(new Event('open')))
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (type === 'message') this.messageListeners.add(listener)
  }

  removeEventListener(type: string, listener: (event: MessageEvent) => void) {
    if (type === 'message') this.messageListeners.delete(listener)
  }

  send(raw: string) {
    const message = JSON.parse(raw) as Record<string, unknown>
    WaitingRoomWebSocket.sent.push(message)
    if (message.type !== 'createRoom') return
    queueMicrotask(() => {
      const event = new MessageEvent('message', {
        data: JSON.stringify(
          WaitingRoomWebSocket.requiresReplayConsent
          && message.confirmReplayCardSnapshotPublic !== true
            ? { type: 'error', error: REPLAY_CARD_SNAPSHOT_CONSENT_REQUIRED }
            : { type: 'roomCreated', roomId: 'room-1', playerIndex: 0, maxPlayers: 2 },
        ),
      })
      this.onmessage?.(event)
      this.messageListeners.forEach(listener => listener(event))
    })
  }

  close() {
    this.onclose?.(new Event('close'))
  }
}

class FailingWebSocket {
  static readonly OPEN = 1
  readonly readyState = 0
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(_url: string) {
    queueMicrotask(() => this.onerror?.(new Event('error')))
  }

  addEventListener() {}
  removeEventListener() {}
  send() {}
  close() {}
}

function AuthenticatedGame() {
  const { loading } = useAuth()
  return loading ? null : <GameContainerApi />
}

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  WaitingRoomWebSocket.sent = []
  WaitingRoomWebSocket.requiresReplayConsent = false
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  vi.unstubAllGlobals()
})

describe('waiting room presentation', () => {
  it('confirms permanent custom-card replay publication before room creation', async () => {
    const confirm = vi.fn(() => true)
    WaitingRoomWebSocket.requiresReplayConsent = true
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(
      null,
      '',
      '/?page=game&transport=ws&maxPlayers=2&customCards=card-1',
    )
    vi.stubGlobal('confirm', confirm)
    vi.stubGlobal('WebSocket', WaitingRoomWebSocket)
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        ok: true,
        user: { id: 'u1', username: 'host', displayName: 'Host' },
      })),
    ))

    render(
      <LocaleProvider>
        <AuthProvider>
          <AuthenticatedGame />
        </AuthProvider>
      </LocaleProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Copy' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Back to Lobby' })).toBeVisible()
    expect(confirm).toHaveBeenCalledOnce()
    const createCommands = WaitingRoomWebSocket.sent.filter(({ type }) => type === 'createRoom')
    expect(createCommands).toHaveLength(2)
    expect(createCommands[0]).not.toHaveProperty('confirmReplayCardSnapshotPublic')
    expect(createCommands[1]).toEqual(expect.objectContaining({
      type: 'createRoom',
      customCardIds: ['card-1'],
      confirmReplayCardSnapshotPublic: true,
    }))
  })

  it('does not request replay consent when the server accepts custom cards without it', async () => {
    const confirm = vi.fn(() => false)
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(
      null,
      '',
      '/?page=game&transport=ws&maxPlayers=2&customCards=card-1',
    )
    vi.stubGlobal('confirm', confirm)
    vi.stubGlobal('WebSocket', WaitingRoomWebSocket)
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        ok: true,
        user: { id: 'u1', username: 'host', displayName: 'Host' },
      })),
    ))

    render(
      <LocaleProvider>
        <AuthProvider>
          <AuthenticatedGame />
        </AuthProvider>
      </LocaleProvider>,
    )

    expect(await screen.findByRole('button', { name: 'Copy' })).toBeVisible()
    expect(confirm).not.toHaveBeenCalled()
    const createCommands = WaitingRoomWebSocket.sent.filter(({ type }) => type === 'createRoom')
    expect(createCommands).toHaveLength(1)
    expect(createCommands[0]).not.toHaveProperty('confirmReplayCardSnapshotPublic')
  })

  it('announces successful invitation-link copying', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async () => {})
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&transport=ws&maxPlayers=2')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.stubGlobal('WebSocket', WaitingRoomWebSocket)
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        ok: true,
        user: { id: 'u1', username: 'host', displayName: 'Host' },
      })),
    ))

    render(
      <LocaleProvider>
        <AuthProvider>
          <AuthenticatedGame />
        </AuthProvider>
      </LocaleProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Copy' }))

    expect(writeText).toHaveBeenCalledWith('http://localhost:3000/?page=game&transport=ws&room=room-1')
    expect(await screen.findByRole('status')).toHaveTextContent('Invite link copied.')
  })

  it('announces invitation-link copy failures', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn(async () => { throw new Error('clipboard denied') })
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&transport=ws&maxPlayers=2')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.stubGlobal('WebSocket', WaitingRoomWebSocket)
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        ok: true,
        user: { id: 'u1', username: 'host', displayName: 'Host' },
      })),
    ))

    render(
      <LocaleProvider>
        <AuthProvider>
          <AuthenticatedGame />
        </AuthProvider>
      </LocaleProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'Copy' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not copy the invite link. Copy it manually and try again.',
    )
  })

  it.each([
    ['en', 'Could not connect to the game server. Check your network and try again.'],
    ['zh', '无法连接游戏服务器，请检查网络后重试。'],
  ] as const)('announces WebSocket network failures in %s', async (locale, message) => {
    window.localStorage.setItem('open-agricola-locale-v2', locale)
    window.history.replaceState(null, '', '/?page=game&transport=ws&maxPlayers=2')
    vi.stubGlobal('WebSocket', FailingWebSocket)
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        ok: true,
        user: { id: 'u1', username: 'host', displayName: 'Host' },
      })),
    ))

    render(
      <LocaleProvider>
        <AuthProvider>
          <AuthenticatedGame />
        </AuthProvider>
      </LocaleProvider>,
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })
})
