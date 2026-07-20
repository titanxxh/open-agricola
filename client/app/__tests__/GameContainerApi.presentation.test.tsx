// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

afterEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('GameContainerApi mobile presentation navigation', () => {
  it('manually selects a localized presentation without changing browser history', async () => {
    const user = userEvent.setup()
    const originalUrl = '/?page=game&player=p1&devMode=1'
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', originalUrl)
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(max-width: 900px)',
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

    render(
      <LocaleProvider>
        <AuthProvider>
          <GameContainerApi />
        </AuthProvider>
      </LocaleProvider>,
    )

    const navigation = await screen.findByRole('navigation', {
      name: 'Game presentation',
    })
    const action = screen.getByRole('button', { name: 'Action' })
    const cards = screen.getByRole('button', { name: 'Cards' })

    expect(navigation).toBeInTheDocument()
    expect(action).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Farm' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Information' })).toBeInTheDocument()

    cards.focus()
    await user.keyboard('{Enter}')

    expect(cards).toHaveAttribute('aria-pressed', 'true')
    expect(action).toHaveAttribute('aria-pressed', 'false')
    expect(`${window.location.pathname}${window.location.search}`).toBe(originalUrl)
  })

  it('keeps every existing gameplay surface reachable through one mobile presentation', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&player=p1&devMode=1')
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(max-width: 900px)',
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

    const { container } = render(
      <LocaleProvider>
        <AuthProvider>
          <GameContainerApi />
        </AuthProvider>
      </LocaleProvider>,
    )

    await screen.findByRole('navigation', { name: 'Game presentation' })
    const presentations = container.querySelector('.game-presentations')

    expect(presentations).toHaveAttribute('data-presentation', 'action')
    expect(screen.getByRole('heading', { name: 'Action Spaces' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Player Farm' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Farm' }))
    expect(presentations).toHaveAttribute('data-presentation', 'farm')
    expect(screen.getByRole('heading', { name: 'Player Farm' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Action Spaces' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Hand Cards' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cards' }))
    expect(presentations).toHaveAttribute('data-presentation', 'cards')
    expect(screen.getByRole('heading', { name: /Major Improvements/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Played Cards' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hand Cards' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Player Farm' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Information' }))
    expect(presentations).toHaveAttribute('data-presentation', 'information')
    expect(screen.getByRole('heading', { name: 'Action Log' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Major Improvements/ })).not.toBeInTheDocument()
    expect(container.querySelector('.interaction-bar')).not.toHaveAttribute('hidden')
  })

  it('leaves the desktop three-column presentation intact', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&player=p1&devMode=1')
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: false,
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

    const { container } = render(
      <LocaleProvider>
        <AuthProvider>
          <GameContainerApi />
        </AuthProvider>
      </LocaleProvider>,
    )

    await screen.findByRole('heading', { name: 'Action Spaces' })

    expect(screen.queryByRole('navigation', { name: 'Game presentation' })).not.toBeInTheDocument()
    expect(container.querySelector('.game-presentations')).not.toHaveAttribute('data-presentation')
    expect(container.querySelector('.game-presentation-cards')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.game-layout__left')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.game-layout__center')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.game-layout__right')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.farm-grid')).not.toHaveAttribute('hidden')
    expect(container.querySelector('.played-cards')).not.toHaveAttribute('hidden')
  })

  it('routes only new mobile interactions without stealing focus', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&player=p1&devMode=1&embedded=1')
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      matches: query === '(max-width: 900px)',
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

    const farmInteraction = {
      stateId: 'wait',
      playerIndex: 0,
      request: {
        kind: 'farm-select',
        farm: { farmType: 'plow', selectableTiles: [{ row: 0, col: 0 }] },
      },
      allowedCommands: ['commitSelection'],
      anytimeActions: [],
    } satisfies GameSyncPayload['interaction']
    const synchronizedFarmInteraction = {
      ...farmInteraction,
      sourceCard: 'ignored-card-id',
      request: {
        ...farmInteraction.request,
        farm: { farmType: 'plow', selectableTiles: [{ row: 0, col: 1 }] },
      },
    } satisfies GameSyncPayload['interaction']
    const actionInteraction = {
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'choice', options: [] },
      allowedCommands: ['resolveChoice'],
      anytimeActions: [],
    } satisfies GameSyncPayload['interaction']
    const responses = [
      { ...payload, interaction: farmInteraction, historyLength: 3 },
      { ...payload, interaction: synchronizedFarmInteraction, historyLength: 3 },
      { ...payload, interaction: actionInteraction, historyLength: 4 },
    ]
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify(responses.shift() ?? responses.at(-1))),
    ))

    const { container } = render(
      <LocaleProvider>
        <AuthProvider>
          <GameContainerApi />
        </AuthProvider>
      </LocaleProvider>,
    )

    const navigation = await screen.findByRole('navigation', { name: 'Game presentation' })
    const action = screen.getByRole('button', { name: 'Action' })
    const farm = screen.getByRole('button', { name: 'Farm' })
    const cards = screen.getByRole('button', { name: 'Cards' })

    await waitFor(() => expect(farm).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByRole('status')).toHaveTextContent('Current request: Farm')

    await user.click(cards)
    expect(cards).toHaveFocus()
    expect(container.querySelector('.game-presentations')).toHaveAttribute('data-presentation', 'cards')

    fireEvent.click(screen.getByRole('button', { name: 'Add Resource' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(cards).toHaveAttribute('aria-pressed', 'true')
    expect(cards).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Add Resource' }))
    await waitFor(() => expect(action).toHaveAttribute('aria-pressed', 'true'))
    expect(cards).toHaveFocus()
    expect(navigation).toContainElement(screen.getByRole('status'))
    expect(screen.getByRole('status')).toHaveTextContent('Current request: Action')
  })
})
