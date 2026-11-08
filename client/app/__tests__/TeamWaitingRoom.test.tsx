// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { TeamWaitingRoom } from '../TeamWaitingRoom'
import type { TeamWaitingRoomState } from '../../../shared/contract/team-room'

beforeEach(() => { localStorage.setItem('open-agricola-locale-v2', 'en') })
afterEach(() => { cleanup(); localStorage.clear() })
const waiting: TeamWaitingRoomState = {
  roomId: 'room-team', maxPlayers: 4,
  teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'category-min', teammateVisibility: 'shared' },
  selfMemberId: 'host', isHost: true, canStart: false,
  members: [
    { memberId: 'host', name: 'Host', teamIndex: 0, seatCount: 1, connected: true, isHost: true },
    { memberId: 'alice', name: 'Alice', teamIndex: 1, seatCount: 1, connected: false, isHost: false },
  ],
}

describe('team waiting presentation', () => {
  it('marks a team waiting room as Beta without repeating the creation explanation', () => {
    render(<LocaleProvider><TeamWaitingRoom value={waiting} onChooseTeam={vi.fn()} onStart={vi.fn()} /></LocaleProvider>)
    expect(screen.getByText('Beta')).toBeVisible()
    expect(screen.queryByText(/Team and multihand modes are being tested/)).not.toBeInTheDocument()
  })
  it('offers self selection and host member moves without assigning seat labels or applying optimistic changes', async () => {
    const move = vi.fn()
    const user = userEvent.setup()
    render(<LocaleProvider><TeamWaitingRoom value={waiting} onChooseTeam={move} onStart={vi.fn()} /></LocaleProvider>)
    expect(screen.getByRole('heading', { name: /Team 1/ })).toBeInTheDocument()
    expect(screen.queryByText(/Seat 1/)).toBeNull()
    const self = screen.getByRole('combobox', { name: 'Choose a team' })
    await user.selectOptions(self, '1')
    expect(move).toHaveBeenLastCalledWith(1)
    expect(self).toHaveValue('0')
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move Alice to a team' }), '0')
    expect(move).toHaveBeenLastCalledWith(0, 'alice')
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled()
  })

  it('disables full destinations and enables start only with an authoritative full-roster response', async () => {
    const start = vi.fn()
    const full = { ...waiting, canStart: true, members: [...waiting.members,
      { memberId: 'bob', name: 'Bob', teamIndex: 1, seatCount: 1, connected: true, isHost: false },
      { memberId: 'carol', name: 'Carol', teamIndex: 0, seatCount: 1, connected: true, isHost: false },
    ] }
    render(<LocaleProvider><TeamWaitingRoom value={full} onChooseTeam={vi.fn()} onStart={start} /></LocaleProvider>)
    expect(screen.getByRole('combobox', { name: 'Choose a team' }).querySelector('option[value="1"]')).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(start).toHaveBeenCalledOnce()
  })
})
