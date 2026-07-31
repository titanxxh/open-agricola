// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameSyncPayload } from '../../../shared/contract/protocol/game'
import { EngineStack } from '../../../shared/engine'
import { createInitialState } from '../../../shared/session/state-bootstrap'
import { serializeState } from '../../../shared/session/serialization'
import { AuthProvider, useAuth } from '../../contexts/AuthContext'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { GameContainerApi } from '../GameContainerApi'

const playingPayload = (round: number): GameSyncPayload => {
  const state = createInitialState(42)
  state.round = round
  return {
    state: serializeState(state, { engineStack: new EngineStack() }),
    interaction: {
      stateId: 'idle',
      allowedCommands: ['takeAction'],
      anytimeActions: [],
    },
    scores: null,
    historyLength: 0,
    hasActionStartSnapshot: false,
    ok: true,
  }
}

class WaitingRoomWebSocket {
  static readonly OPEN = 1
  static sent: Array<Record<string, unknown>> = []
  static joinStatus: 'waiting' | 'playing' = 'waiting'
  static respondToGetState = true
  static latest: WaitingRoomWebSocket | null = null
  readonly readyState = WaitingRoomWebSocket.OPEN
  onopen: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onclose: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  private readonly messageListeners = new Set<(event: MessageEvent) => void>()

  constructor(_url: string) {
    WaitingRoomWebSocket.latest = this
    queueMicrotask(() => this.onopen?.(new Event('open')))
  }

  static emit(message: Record<string, unknown>) {
    const socket = WaitingRoomWebSocket.latest
    if (!socket) throw new Error('WebSocket not connected')
    const event = new MessageEvent('message', {
      data: JSON.stringify(message),
    })
    socket.onmessage?.(event)
    socket.messageListeners.forEach(listener => listener(event))
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
    if (message.type === 'joinRoom') {
      queueMicrotask(() => {
        const playing = WaitingRoomWebSocket.joinStatus === 'playing'
        WaitingRoomWebSocket.emit({
          type: 'roomJoined',
          roomId: 'room-1',
          playerIndex: 0,
          status: WaitingRoomWebSocket.joinStatus,
          players: playing
            ? [{ playerIndex: 0, name: 'Host' }, { playerIndex: 1, name: 'Guest' }]
            : [{ playerIndex: 0, name: 'Host' }],
          maxPlayers: playing ? 2 : 4,
        })
      })
      return
    }
    if (message.type === 'getState') {
      if (!WaitingRoomWebSocket.respondToGetState) return
      queueMicrotask(() => {
        WaitingRoomWebSocket.emit({
          type: 'stateUpdate',
          roomId: 'room-1',
          version: 1,
          sync: 'snapshot',
          cause: 'reconnect',
          requestId: message.requestId,
          payload: playingPayload(1),
          emittedAt: Date.now(),
        })
      })
      return
    }
    if (message.type !== 'createRoom') return
    queueMicrotask(() => {
      const event = new MessageEvent('message', {
        data: JSON.stringify({ type: 'roomCreated', roomId: 'room-1', playerIndex: 0, maxPlayers: 2 }),
      })
      this.onmessage?.(event)
      this.messageListeners.forEach(listener => listener(event))
    })
  }

  close() {
    this.onclose?.(new Event('close'))
  }
}

class JoinErrorWebSocket {
  static readonly OPEN = 1
  static errorMessage: Record<string, unknown> = {}
  readonly readyState = JoinErrorWebSocket.OPEN
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
    if (message.type !== 'joinRoom') return
    queueMicrotask(() => {
      const event = new MessageEvent('message', {
        data: JSON.stringify(JoinErrorWebSocket.errorMessage),
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
  WaitingRoomWebSocket.joinStatus = 'waiting'
  WaitingRoomWebSocket.respondToGetState = true
  WaitingRoomWebSocket.latest = null
  JoinErrorWebSocket.errorMessage = {}
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
  vi.unstubAllGlobals()
})

describe('waiting room presentation', () => {
  it('creates the room from a customCards URL without any consent round-trip', async () => {
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

  it('restores the authoritative waiting room after a refresh', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1')
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

    expect(await screen.findByText('Room room-1 — Waiting for players (1/4)')).toBeVisible()
    expect(screen.getByText('Player 1: Host')).toBeVisible()
    expect(WaitingRoomWebSocket.sent).not.toContainEqual(expect.objectContaining({
      type: 'getState',
    }))
  })

  it('returns an already-ready client to the waiting room after a reset', async () => {
    WaitingRoomWebSocket.joinStatus = 'playing'
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-1')
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
    })
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

    await waitFor(() => {
      expect(document.querySelector('.game-layout')).not.toBeNull()
    })

    act(() => {
      WaitingRoomWebSocket.emit({
        type: 'roomWaiting',
        roomId: 'room-2',
        players: [{ playerIndex: 0, name: 'Host' }],
        maxPlayers: 2,
      })
    })

    expect(await screen.findByText('Room room-2 — Waiting for players (1/2)')).toBeVisible()
    expect(screen.getByText('Player 1: Host')).toBeVisible()
    expect(document.querySelector('.game-layout')).toBeNull()

    WaitingRoomWebSocket.respondToGetState = false
    act(() => {
      WaitingRoomWebSocket.emit({
        type: 'stateUpdate',
        roomId: 'room-2',
        version: 2,
        sync: 'snapshot',
        cause: 'reconnect',
        payload: playingPayload(2),
        emittedAt: Date.now(),
      })
      WaitingRoomWebSocket.emit({ type: 'gameStarted' })
    })

    await waitFor(() => {
      expect(document.querySelector('.header-round')).toHaveTextContent('R2/14')
    })
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

  it('offers a lobby exit instead of retry when the game context changed', async () => {
    const user = userEvent.setup()
    JoinErrorWebSocket.errorMessage = {
      type: 'error',
      error: 'game context changed',
      code: 'context_changed',
      lifecycle: 'archived',
    }
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-stale')
    vi.stubGlobal('WebSocket', JoinErrorWebSocket)
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

    expect(await screen.findByRole('alert')).toHaveTextContent('game context changed')
    const lobbyButton = screen.getByRole('button', { name: 'Back to Lobby' })
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()

    await user.click(lobbyButton)

    expect(window.location.search).toBe('')
  })

  it('keeps the retry action for errors without a context code', async () => {
    JoinErrorWebSocket.errorMessage = { type: 'error', error: 'room not found' }
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=room-x')
    vi.stubGlobal('WebSocket', JoinErrorWebSocket)
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

    expect(await screen.findByRole('alert')).toHaveTextContent('room not found')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Back to Lobby' })).toBeNull()
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
