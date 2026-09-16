// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { GameState, PlayerState } from '../../../../shared/contract/types'
import { LocaleProvider } from '../../../contexts/LocaleContext'
import { GameHeader } from '../GameHeader'
import { snakeOpeningPlacementOrders } from '../snake-opening-orders'

vi.mock('../../../app/PageRouter', () => ({
  setPage: () => {},
}))

const state = {
  round: 3,
  phase: 'work',
  gameOver: false,
} as GameState

const currentPlayer = {
  name: 'Player A',
} as PlayerState

const snakeOpeningState = (overrides: Partial<GameState> = {}): GameState => ({
  round: 1,
  phase: 'playing',
  roundPhase: 'work',
  gameOver: false,
  enableSnakeOpening: true,
  snakeOpening: { reversed: false },
  roundFirstPlayerId: 'p2',
  players: [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
    { id: 'p3', name: 'Cara' },
  ],
  ...overrides,
} as unknown as GameState)

const renderHeader = (headerState: GameState) => render(
  <LocaleProvider>
    <GameHeader
      locale="en"
      state={headerState}
      currentPlayer={currentPlayer}
      devMode={false}
      setDevMode={() => {}}
      myPlayerName="Alice"
      isMyTurn={false}
    />
  </LocaleProvider>,
)

describe('snakeOpeningPlacementOrders', () => {
  it('walks the Round Work Order from the round first player and reverses it for the second placement', () => {
    expect(snakeOpeningPlacementOrders(snakeOpeningState())).toEqual({
      first: ['Bob', 'Cara', 'Alice'],
      second: ['Alice', 'Cara', 'Bob'],
    })
  })

  it('falls back to seat order when the round first player is unknown', () => {
    expect(snakeOpeningPlacementOrders(snakeOpeningState({ roundFirstPlayerId: undefined }))).toEqual({
      first: ['Alice', 'Bob', 'Cara'],
      second: ['Cara', 'Bob', 'Alice'],
    })
    expect(snakeOpeningPlacementOrders(snakeOpeningState({ roundFirstPlayerId: 'ghost' })).first)
      .toEqual(['Alice', 'Bob', 'Cara'])
  })
})

describe('GameHeader snake opening pill', () => {
  it('shows the round-1 pill with both placement orders when the variant is enabled', () => {
    renderHeader(snakeOpeningState())

    const pill = screen.getByText('Snake opening')
    expect(pill).toHaveClass('header-snake-pill')
    expect(pill).toHaveAttribute('tabindex', '0')

    const popover = screen.getByRole('tooltip')
    expect(popover).toHaveTextContent('Round 1 only: each player’s second person is placed in reverse turn order.')
    expect(popover).toHaveTextContent('1st placement')
    expect(popover).toHaveTextContent('Bob → Cara → Alice')
    expect(popover).toHaveTextContent('2nd placement')
    expect(popover).toHaveTextContent('Alice → Cara → Bob')
  })

  it('does not render the pill after round 1', () => {
    renderHeader(snakeOpeningState({ round: 2 }))

    expect(screen.queryByText('Snake opening')).toBeNull()
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('does not render the pill when the variant is disabled', () => {
    renderHeader(snakeOpeningState({ enableSnakeOpening: false, snakeOpening: null }))

    expect(screen.queryByText('Snake opening')).toBeNull()
  })
})

describe('GameHeader', () => {
  it('keeps locale/menu controls but no longer renders undo or scoring buttons', () => {
    const html = renderToStaticMarkup(
      <LocaleProvider>
        <GameHeader
          locale="en"
          state={state}
          currentPlayer={currentPlayer}
          devMode={false}
          setDevMode={() => {}}
          myPlayerName="Player A"
          isMyTurn={true}
        />
      </LocaleProvider>,
    )

    expect(html).toContain('header-locale-select')
    expect(html).toContain('Menu')
    expect(html).not.toContain('Undo Step')
    expect(html).not.toContain('Undo Action')
    expect(html).not.toContain('Scoring Pad')
  })

  it('does not show the developer mode toggle in normal games', () => {
    render(
      <LocaleProvider>
        <GameHeader
          locale="zh"
          state={state}
          currentPlayer={currentPlayer}
          devMode={false}
          setDevMode={() => {}}
          myPlayerName="Player A"
          isMyTurn={true}
        />
      </LocaleProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: /菜单/ }))

    expect(screen.queryByText('开发者模式')).toBeNull()
  })

  it('uses the Open Agricola wordmark as the home link only outside embedded games', () => {
    const { rerender } = render(
      <LocaleProvider>
        <GameHeader
          locale="en"
          state={state}
          currentPlayer={currentPlayer}
          devMode={false}
          setDevMode={() => {}}
          myPlayerName="Player A"
          isMyTurn={true}
        />
      </LocaleProvider>,
    )

    expect(screen.getByRole('link', { name: 'Back to Lobby' }))
      .toHaveTextContent('Open Agricola')
    expect(screen.queryByRole('button', { name: 'Back to Lobby' })).toBeNull()

    rerender(
      <LocaleProvider>
        <GameHeader
          locale="en"
          state={state}
          currentPlayer={currentPlayer}
          devMode={false}
          setDevMode={() => {}}
          myPlayerName="Player A"
          isMyTurn={true}
          embedded
        />
      </LocaleProvider>,
    )

    expect(screen.queryByRole('link', { name: 'Back to Lobby' })).toBeNull()
  })
})
