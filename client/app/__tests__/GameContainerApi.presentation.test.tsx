// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EngineStack } from '../../../shared/engine'
import type { GameSyncPayload } from '../../../shared/contract/protocol/game'
import { createInitialState } from '../../../shared/session/state-bootstrap'
import { serializeState } from '../../../shared/session/serialization'
import { AuthProvider } from '../../contexts/AuthContext'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { GameContainerApi } from '../GameContainerApi'

const payload: GameSyncPayload = {
  state: serializeState(createInitialState(42), { engineStack: new EngineStack() }),
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

const setupViewport = (isMobile: boolean) => {
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
    matches: isMobile && query === '(max-width: 900px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(payload))))
}

const renderGame = () => render(
  <LocaleProvider>
    <AuthProvider>
      <GameContainerApi />
    </AuthProvider>
  </LocaleProvider>,
)

afterEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('GameContainerApi responsive presentation', () => {
  it('shows one continuous graphical game layout on mobile', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&player=p1&devMode=1')
    setupViewport(true)

    const { container } = renderGame()

    await screen.findByRole('region', { name: 'Action Spaces' })

    expect(screen.queryByRole('navigation', { name: 'Game presentation' }))
      .not.toBeInTheDocument()
    expect(container.querySelector('.mobile-actions-panel')).not.toBeInTheDocument()
    expect(container.querySelector('.action-board')).toBeVisible()
    expect(container.querySelector('.major-improvements')).toBeVisible()
    expect(container.querySelector('.farm-grid')).toBeVisible()
    expect(container.querySelector('.played-cards')).toBeVisible()
    expect(container.querySelector('.hand-cards')).toBeVisible()
    expect(container.querySelector('.game-layout__left')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.game-layout__center')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.game-layout__right')).not.toHaveAttribute('hidden')
    expect(container.querySelectorAll('.interaction-bar')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'expand' })).toHaveLength(2)
  })

  it('keeps the desktop three-column layout intact', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&player=p1&devMode=1')
    setupViewport(false)

    const { container } = renderGame()

    await screen.findByRole('region', { name: 'Action Spaces' })

    expect(screen.queryByRole('navigation', { name: 'Game presentation' }))
      .not.toBeInTheDocument()
    expect(container.querySelector('.major-improvements')).toBeVisible()
    expect(container.querySelector('.game-layout__left')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.game-layout__center')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.game-layout__right')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.farm-grid')).toBeVisible()
    expect(container.querySelector('.played-cards')).toBeVisible()
  })
})
