// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { t } from '../../../../shared/i18n'
import type { ClientGameState } from '../../../services/rehydrate'
import guestIcon from '../../common/guest-icon.svg'
import { DesktopPlayerOverview } from '../DesktopPlayerOverview'

const player = (id: string, color: 'red' | 'blue'): ClientGameState['players'][number] => ({
  id,
  color,
  resources: { wood: 3, food: 2 },
  playerPanelSummary: { family: { used: 2, limit: 5 } },
  harvestRequirements: { round: 4, food: 4, fuel: 2 },
} as ClientGameState['players'][number])

const players = [player('p1', 'red'), player('p2', 'blue')]
const playerNames = { p1: 'Ada', p2: 'Bea' }
const scores = [{ playerId: 'p1', total: 4 }, { playerId: 'p2', total: 7 }]

describe('DesktopPlayerOverview current turn', () => {
  it('shows the next harvest food and heating requirements for each player', () => {
    render(<DesktopPlayerOverview
      locale="en" players={players} playerNames={playerNames} scores={scores}
      viewedPlayerId="p1" currentPlayerId="p2" onViewPlayer={() => {}}
    />)
    expect(screen.getAllByText('Next harvest · Round 4')).toHaveLength(2)
    expect(screen.getAllByLabelText('Feeding requires 4 food')).toHaveLength(2)
    expect(screen.getAllByLabelText('Heating requires 2 fuel')).toHaveLength(2)
  })

  it('shows the Guests a player can still dispatch this round right after the family members', () => {
    const first = players[0]!
    const ada = { ...first, playerPanelSummary: { ...first.playerPanelSummary, guests: { pending: 1 } } }
    const { container } = render(<DesktopPlayerOverview
      locale="en" players={[ada, players[1]!]} playerNames={playerNames} scores={scores}
      viewedPlayerId="p1" currentPlayerId="p2" onViewPlayer={() => {}}
    />)
    const guests = (color: string) => container.querySelector(`[data-player-color="${color}"] [data-testid="player-pending-guests"]`)

    expect(guests('red')).toHaveTextContent(/^1$/)
    expect(guests('red')).toHaveAccessibleName(t('en', 'ui.guest.pending', { count: 1 }))
    expect(guests('red')?.querySelector('img')).toHaveAttribute('src', guestIcon)
    expect(guests('red')?.previousElementSibling).toHaveAttribute('title', t('en', 'ui.family'))
    expect(guests('red')?.previousElementSibling).toHaveTextContent('2/5')
    // Bea has no Guest to dispatch, so her overview shows no Guest count at all.
    expect(guests('blue')).toBeNull()
  })

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
