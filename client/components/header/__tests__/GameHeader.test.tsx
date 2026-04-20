import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { GameState, PlayerState } from '../../../../shared/game/types'
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
})
