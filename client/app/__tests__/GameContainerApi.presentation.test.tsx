// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

const setupViewport = (isMobile: boolean, response = payload) => {
  vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
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
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(response))))
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
  it('preserves explicit supply expansion when the hand moves between desktop and mobile hosts', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&player=p1&devMode=1')
    const response = structuredClone(payload)
    response.state.players[0]!.minorHand = ['A076_Cob']
    response.interaction = {
      stateId: 'wait', requestKey: 'same-improvement-request', playerIndex: 0,
      allowedCommands: ['resolveChoice'], anytimeActions: [], promptKey: 'ui.interactionChooseImprovement',
      request: { kind: 'choice', options: [
        { value: 'minor:A076_Cob', labelKey: 'minors.A076_Cob.name' },
        { value: 'major:Major_Well', labelKey: 'improvements.Major_Well.name' },
      ] },
    }
    setupViewport(false, response)
    let desktop = true
    const targets = new Map<string, EventTarget>()
    const matches = (query: string) => query === '(min-width: 1101px)' ? desktop : query === '(max-width: 900px)' && !desktop
    vi.mocked(window.matchMedia).mockImplementation(query => {
      const target = targets.get(query) ?? new EventTarget()
      targets.set(query, target)
      return {
        get matches() { return matches(query) }, media: query, onchange: null,
        addListener: vi.fn(), removeListener: vi.fn(),
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target),
      }
    })
    const { container } = renderGame()
    fireEvent.click(await screen.findByRole('button', { name: 'Show major improvements (1)' }))
    expect(container.querySelector('.game-layout__hand .major-row')).toBeVisible()
    const resize = async (next: boolean) => act(async () => {
      desktop = next
      targets.forEach((target, query) => target.dispatchEvent(Object.assign(new Event('change'), { matches: matches(query) })))
    })
    await resize(false)
    expect(container.querySelector('.game-layout__center .major-row')).toBeVisible()
    await resize(true)
    expect(container.querySelector('.game-layout__hand .major-row')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Hide major improvements' }))
    await resize(false)
    await resize(true)
    expect(container.querySelector('.major-row')).toBeNull()
  })

  it('opens every authoritative alternative for a nearby Card Field before submitting one', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&player=p1&devMode=1')
    const response = structuredClone(payload)
    const player = response.state.players[0]!
    player.occupationPlayed = ['B113_PatchCaregiver']
    player.playedCardChronology = ['occupation:B113_PatchCaregiver']
    player.cardStatePresentation.B113_PatchCaregiver = {
      cropLayers: [{ slotIndex: 0, top: true, stack: { kind: 'grain', remaining: 3 } }],
    }
    const target = { kind: 'logical-field' as const, playerId: player.id, fieldId: 'card:B113_PatchCaregiver',
      positions: [{ row: -1, col: 2113, sourceCard: 'B113_PatchCaregiver', cardFieldSlot: 0 }], resources: { grain: 3 } }
    response.interaction = { stateId: 'wait', requestKey: 'two-field-choices', playerIndex: 0,
      request: { kind: 'choice', options: [
        { value: 'opaque-first', labelKey: 'ui.fields', target },
        { value: 'opaque-second', labelKey: 'ui.fieldEmpty', target },
      ] }, allowedCommands: ['resolveChoice'], anytimeActions: [] }
    setupViewport(true, response)
    const { container } = renderGame()
    const tray = await screen.findByRole('region', { name: 'Card targets' })
    const choicesSent = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/api/game/choice'))
    expect(container.querySelector('[data-choice-value="opaque-first"]')).toBeNull()
    fireEvent.click(tray.querySelector('button')!)
    expect(choicesSent()).toHaveLength(0)
    await waitFor(() => expect(container.querySelector('[data-choice-value="opaque-first"]')).toBeVisible())
    expect(container.querySelector('[data-choice-value="opaque-second"]')).toBeVisible()
    fireEvent.click(container.querySelector('[data-choice-value="opaque-second"]')!)
    await waitFor(() => expect(choicesSent()).toHaveLength(1))
    expect(choicesSent()[0]?.[1]?.body).toContain('opaque-second')
  })

  it.each([
    { name: 'only legal majors', minorDisabled: true, majorDisabled: false, target: 'major-supply', near: true },
    { name: 'only legal minors', minorDisabled: false, majorDisabled: true, target: 'minor-hand', near: false },
    { name: 'no legal cards', minorDisabled: true, majorDisabled: true, target: 'controls', near: false },
  ])('focuses $name without offering unavailable major purchases', async ({ minorDisabled, majorDisabled, target, near }) => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&player=p1&devMode=1')
    const response = structuredClone(payload)
    response.state.players[0]!.minorHand = ['A076_Cob']
    response.interaction = {
      stateId: 'wait', requestKey: 'improvements', playerIndex: 0,
      allowedCommands: ['resolveChoice'], anytimeActions: [], promptKey: 'ui.interactionChooseImprovement',
      request: { kind: 'choice', options: [
        { value: 'minor:A076_Cob', labelKey: 'minors.A076_Cob.name', disabled: minorDisabled },
        { value: 'major:Major_Well', labelKey: 'improvements.Major_Well.name', disabled: majorDisabled },
      ] },
    }
    setupViewport(true, response)
    const { container } = renderGame()
    await waitFor(() => expect(container.querySelector(`[data-interaction-focus="${target}"]`)).toHaveAttribute('data-interaction-focused', 'true'))
    const nearSupply = container.querySelector('.hand-section.minor .major-improvements')
    expect(nearSupply !== null).toBe(near)
    if (near) expect(nearSupply).toHaveClass('expanded')
    else expect(screen.queryByRole('button', { name: /^Show major improvements/ })).toBeNull()
    expect(container.querySelectorAll('.major-improvements')).toHaveLength(1)
  })

  it('focuses mixed improvement selection on the minor hand beside one collapsible major supply', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&player=p1&devMode=1')
    const response = structuredClone(payload)
    response.state.players[0]!.minorHand = ['A076_Cob']
    response.interaction = {
      stateId: 'wait', requestKey: 'mixed-improvements', playerIndex: 0,
      allowedCommands: ['resolveChoice'], anytimeActions: [], promptKey: 'ui.interactionChooseImprovement',
      request: { kind: 'choice', options: [
        { value: 'minor:A076_Cob', labelKey: 'minors.A076_Cob.name' },
        { value: 'major:Major_Well', labelKey: 'improvements.Major_Well.name' },
      ] },
    }
    setupViewport(true, response)
    const { container } = renderGame()
    const toggle = await screen.findByRole('button', { name: 'Show major improvements (1)' })
    const hand = container.querySelector('[data-interaction-focus="minor-hand"]')
    expect(hand).toContainElement(toggle)
    await waitFor(() => expect(hand).toHaveAttribute('data-interaction-focused', 'true'))
    expect(container.querySelectorAll('.major-improvements')).toHaveLength(1)
    expect(container.querySelector('.major-row')).toBeNull()
    fireEvent.click(toggle)
    expect(hand?.querySelector('[data-card-anchor="Major_Well"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Hide major improvements' }))
    expect(container.querySelector('.major-row')).toBeNull()
  })

  it('focuses the local Interaction Player occupation hand even when that player differs from the worker owner', async () => {
    window.localStorage.setItem('open-agricola-locale-v2', 'en')
    window.history.replaceState(null, '', '/?page=game&devMode=1')
    const response = structuredClone(payload)
    response.state.players[1]!.occupationHand = ['A116_WoodCutter']
    response.interaction = {
      stateId: 'wait', playerIndex: 1, allowedCommands: ['resolveChoice'], anytimeActions: [],
      promptKey: 'ui.interactionChooseOccupation',
      request: { kind: 'choice', options: [{ value: 'A116_WoodCutter', labelKey: 'occupations.A116_WoodCutter.name' }] },
    }
    setupViewport(true, response)
    renderGame()
    expect(await screen.findByRole('button', { name: 'Return to current action' })).toBeVisible()
    expect(document.querySelector('[data-interaction-focus="occupation-hand"][data-focus-player="p2"]')).toBeVisible()
    expect(document.querySelector('[data-hand-anchor="p1"]')).not.toBeInTheDocument()
  })

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
    expect(container.querySelector('.action-log')).toBeVisible()
    expect(container.querySelector('.scoring-pad')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.game-layout__players .desktop-player-overview__player')).toHaveLength(2)
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
