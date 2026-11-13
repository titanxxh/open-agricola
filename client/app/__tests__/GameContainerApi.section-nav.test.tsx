// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EngineStack } from '../../../shared/engine'
import type { GameSyncPayload } from '../../../shared/contract/protocol/game'
import { createInitialState } from '../../../shared/session/state-bootstrap'
import { serializeState } from '../../../shared/session/serialization'
import { AuthProvider } from '../../contexts/AuthContext'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { GameContainerApi } from '../GameContainerApi'

const payloadFor = (
  options?: Parameters<typeof createInitialState>[1],
): GameSyncPayload => ({
  state: serializeState(createInitialState(42, options), { engineStack: new EngineStack() }),
  interaction: { stateId: 'idle', allowedCommands: ['takeAction'], anytimeActions: [] },
  scores: null,
  historyLength: 0,
  hasActionStartSnapshot: false,
  ok: true,
})

const box = (top: number, height: number) => ({
  x: 0, y: top, top, left: 0, right: 240, bottom: top + height, width: 240, height, toJSON: () => ({}),
})

const setupViewport = (desktop: boolean, response = payloadFor()) => {
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({
    matches: desktop ? query === '(min-width: 1101px)' : query === '(max-width: 900px)',
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
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response))))
}

const renderGame = () => render(
  <LocaleProvider>
    <AuthProvider>
      <GameContainerApi />
    </AuthProvider>
  </LocaleProvider>,
)

const openGame = async (desktop: boolean, response = payloadFor()) => {
  window.localStorage.setItem('open-agricola-locale-v2', 'en')
  window.history.replaceState(null, '', '/?page=game&player=p1&devMode=1')
  setupViewport(desktop, response)
  const view = renderGame()
  await screen.findByRole('region', { name: 'Action Spaces' })
  return view
}

afterEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('game section navigation', () => {
  it.each([
    { name: 'narrow', desktop: false },
    { name: 'desktop', desktop: true },
  ])('jumps to the viewer hand and public farms on a $name table without revealing another hand', async ({ desktop }) => {
    const user = userEvent.setup()
    const { container } = await openGame(desktop)
    const nav = screen.getByRole('navigation', { name: /Hand Cards/ })
    expect(nav).toBeVisible()
    expect(screen.getByRole('button', { name: 'Hand Cards' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Player Farm' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Public farms' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Major Improvements', exact: true })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Seasons Board' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Special Actions' })).not.toBeInTheDocument()
    expect(container.querySelector('[data-section-target="seasons"]')).toBeNull()
    expect(container.querySelector('[data-section-target="moor"]')).toBeNull()
    expect(container.querySelector('[data-hand-anchor="p2"]')).not.toBeInTheDocument()
    expect(container.querySelector('.desktop-public-farms [data-hand-anchor]')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-interaction-focused]')).toHaveLength(0)

    const hand = container.querySelector('[data-section-target="hand"][data-hand-anchor="p1"]') as HTMLElement
    expect(hand).toHaveClass('hand-cards')
    expect(hand.querySelector('h3')).toHaveTextContent('Hand Cards')
    const farms = container.querySelector('[data-section-target="public-farms"]') as HTMLElement
    const header = container.querySelector('.header-compact') as HTMLElement
    const bar = container.querySelector('.interaction-bar') as HTMLElement
    expect(hand).toBeTruthy()
    expect(desktop ? hand.closest('.game-layout__hand') : hand.closest('.game-layout__center')).not.toBeNull()
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(box(0, 48))
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(box(700, 120))
    vi.spyOn(hand, 'getBoundingClientRect').mockReturnValue(box(900, 180))
    vi.spyOn(farms, 'getBoundingClientRect').mockReturnValue(box(1600, 400))

    await user.click(screen.getByRole('button', { name: 'Hand Cards' }))
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: 900 - 48 - 12, behavior: 'smooth' })
    expect(hand).not.toHaveAttribute('data-interaction-focused')
    expect(container.querySelector('[data-hand-anchor="p2"]')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hand Cards' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Public farms' }))
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: 1600 - 48 - 12, behavior: 'smooth' })
    expect(container.querySelector('.game-layout__center [data-interaction-focus="farm"]'))
      .toHaveAttribute('data-focus-player', 'p1')
  })

  it('omits expansion and solo shortcuts that have no target', async () => {
    await openGame(false, payloadFor({ playerCount: 1 }))
    expect(screen.queryByRole('button', { name: 'Public farms' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Seasons Board' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Special Actions' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hand Cards' })).toBeVisible()
  })

  it('jumps to seasons and moor boards only after those expansions are enabled', async () => {
    const user = userEvent.setup()
    const { container } = await openGame(true, payloadFor({
      enableThroughTheSeasons: true,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    }))
    const seasons = container.querySelector('[data-section-target="seasons"]') as HTMLElement
    const moor = container.querySelector('[data-section-target="moor"]') as HTMLElement
    const header = container.querySelector('.header-compact') as HTMLElement
    expect(seasons).toBeTruthy()
    expect(moor).toBeTruthy()
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue(box(0, 36))
    vi.spyOn(seasons, 'getBoundingClientRect').mockReturnValue(box(1100, 240))
    vi.spyOn(moor, 'getBoundingClientRect').mockReturnValue(box(1400, 240))
    await user.click(screen.getByRole('button', { name: 'Seasons Board' }))
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: 1100 - 36 - 12, behavior: 'smooth' })
    await user.click(screen.getByRole('button', { name: 'Special Actions' }))
    expect(window.scrollBy).toHaveBeenLastCalledWith({ top: 1400 - 36 - 12, behavior: 'smooth' })
    expect(container.querySelector('[data-section-target="major-supply"]')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Seasons Board' }), { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: 'Special Actions' })).toHaveFocus()
  })
})
