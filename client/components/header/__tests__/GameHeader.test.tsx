// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { GameState, PlayerState } from '../../../../shared/contract/types'
import type { Locale } from '../../../../shared/i18n'
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

const renderHeader = (headerState: GameState, locale: Locale = 'en') => render(
  <LocaleProvider>
    <GameHeader
      locale={locale}
      state={headerState}
      currentPlayer={headerState.players?.[1] ?? currentPlayer}
      devMode={false}
      setDevMode={() => {}}
      myPlayerName="Alice"
      isMyTurn={false}
    />
  </LocaleProvider>,
)

describe('snakeOpeningPlacementOrders', () => {
  it('walks the Round Work Order from the round first player and reverses it for the second placement', () => {
    expect(snakeOpeningPlacementOrders(snakeOpeningState(), 'en')).toEqual({
      first: ['Bob', 'Cara', 'Alice'],
      second: ['Alice', 'Cara', 'Bob'],
    })
  })

  it('falls back to seat order when the round first player is unknown', () => {
    expect(snakeOpeningPlacementOrders(snakeOpeningState({ roundFirstPlayerId: undefined }), 'en')).toEqual({
      first: ['Alice', 'Bob', 'Cara'],
      second: ['Cara', 'Bob', 'Alice'],
    })
    expect(snakeOpeningPlacementOrders(snakeOpeningState({ roundFirstPlayerId: 'ghost' }), 'en').first)
      .toEqual(['Alice', 'Bob', 'Cara'])
  })

  it('localizes generated and empty names using original seats while preserving account names', () => {
    const game = snakeOpeningState()
    game.players[0]!.name = 'Player 1'
    game.players[0]!.nameIsDefault = true
    game.players[1]!.name = ''
    game.players[2]!.name = 'PlayerF'
    expect(snakeOpeningPlacementOrders(game, 'zh')).toEqual({
      first: ['玩家 2', 'PlayerF', '玩家 1'],
      second: ['玩家 1', 'PlayerF', '玩家 2'],
    })
    expect(snakeOpeningPlacementOrders(game, 'en').first).toEqual(['Player 2', 'PlayerF', 'Player 1'])
  })
})

describe('GameHeader snake opening pill', () => {
  it('localizes the waiting turn and snake orders in Chinese', () => {
    const game = snakeOpeningState()
    game.players[0]!.name = 'Player 1'
    game.players[1]!.name = 'Player 2'
    game.players[0]!.nameIsDefault = true
    game.players[1]!.nameIsDefault = true
    game.players[2]!.name = 'PlayerF'
    const { container } = renderHeader(game, 'zh')
    expect(container.querySelector('.waiting-turn')).toHaveTextContent('玩家 2')
    expect(screen.getByRole('tooltip')).toHaveTextContent('玩家 2 → PlayerF → 玩家 1')
    expect(screen.getByRole('tooltip')).toHaveTextContent('玩家 1 → PlayerF → 玩家 2')
  })

  it('preserves a numeric account name in the waiting badge and both orders', () => {
    const game = snakeOpeningState()
    game.players[1]!.name = 'Player 6'
    game.players[1]!.nameIsDefault = false
    const { container } = renderHeader(game, 'zh')
    expect(container.querySelector('.waiting-turn')).toHaveTextContent('Player 6')
    expect(screen.getByRole('tooltip')).toHaveTextContent('Player 6 → Cara → Alice')
  })

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
