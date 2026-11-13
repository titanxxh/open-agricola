// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { t } from '../../../../shared/i18n'
import type { ClientGameState } from '../../../services/rehydrate'
import { DesktopPlayerOverview } from '../DesktopPlayerOverview'

const player = (id: string, color: 'red' | 'blue'): ClientGameState['players'][number] => ({
  id,
  color,
  resources: { wood: 3, food: 2 },
  playerPanelSummary: { family: { used: 2, limit: 5 } },
} as ClientGameState['players'][number])

const players = [player('p1', 'red'), player('p2', 'blue')]
const playerNames = { p1: 'Ada', p2: 'Bea' }
const scores = [{ playerId: 'p1', total: 4 }, { playerId: 'p2', total: 7 }]

describe('DesktopPlayerOverview current turn', () => {
  it('marks the turn player separately from the farm being viewed', () => {
    const { container } = render(<DesktopPlayerOverview
      locale="en" players={players} playerNames={playerNames} scores={scores}
      viewedPlayerId="p1" currentPlayerId="p2" onViewPlayer={() => {}}
    />)
    const ada = screen.getByRole('button', { name: /Ada/ })
    const bea = screen.getByRole('button', { name: /Bea/ })
    expect(ada).toHaveAttribute('aria-pressed', 'true')
    expect(ada).not.toHaveAttribute('aria-current')
    expect(bea).toHaveAttribute('aria-pressed', 'false')
    expect(bea).toHaveAttribute('aria-current', 'true')
    expect(bea).toHaveAccessibleName(expect.stringContaining(t('en', 'ui.currentPlayer')))
    expect(ada).not.toHaveAccessibleName(expect.stringContaining(t('en', 'ui.currentPlayer')))
    expect(bea.querySelector('.turn-marker')).toHaveAccessibleName(t('en', 'ui.currentPlayer'))
    expect(container.querySelector('[data-player-color="blue"]')).toHaveClass('is-current-turn')
    expect(container.querySelector('[data-player-color="red"]')).not.toHaveClass('is-current-turn')
  })

  it('keeps both cues when the viewed farm belongs to the current player', () => {
    render(<DesktopPlayerOverview
      locale="en" players={players} playerNames={playerNames} scores={scores}
      viewedPlayerId="p1" currentPlayerId="p1" onViewPlayer={() => {}}
    />)
    const ada = screen.getByRole('button', { name: /Ada/ })
    expect(ada).toHaveAttribute('aria-pressed', 'true')
    expect(ada).toHaveAttribute('aria-current', 'true')
    expect(ada.closest('.desktop-player-overview__player')).toHaveClass('is-current-turn')
  })

  it('switches the viewed farm from the keyboard', async () => {
    const user = userEvent.setup()
    const onViewPlayer = vi.fn()
    render(<DesktopPlayerOverview
      locale="en" players={players} playerNames={playerNames} scores={scores}
      viewedPlayerId="p1" currentPlayerId="p2" onViewPlayer={onViewPlayer}
    />)
    const bea = screen.getByRole('button', { name: /Bea/ })
    bea.focus()
    expect(bea).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onViewPlayer).toHaveBeenCalledWith('p2')
  })
})
