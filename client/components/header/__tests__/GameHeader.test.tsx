// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

import type { GameState, PlayerState } from '../../../../shared/contract/types'
import { LocaleProvider } from '../../../contexts/LocaleContext'
import { GameHeader } from '../GameHeader'

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
