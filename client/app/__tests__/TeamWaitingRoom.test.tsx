// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { TeamWaitingRoomState } from '../../../shared/contract/team-room'
import { LocaleProvider } from '../../contexts/LocaleContext'
import { TeamWaitingRoom } from '../TeamWaitingRoom'

afterEach(cleanup)

function waiting(count = 4): TeamWaitingRoomState {
  return { roomId: 'team-room', maxPlayers: 4,
    teamConfig: { mode: 'team', seatsPerTeam: 2, seating: 'separated', scoring: 'sum', teammateVisibility: 'shared' },
    members: Array.from({ length: count }, (_, index) => ({ memberId: `member-${index}`, name: `Farmer ${index}`,
      teamIndex: Math.floor(index / 2), seatCount: 1, isHost: index === 0, connected: true })),
    selfMemberId: 'member-0', isHost: true, canStart: count === 4 }
}

it('allows a host to choose an empty destination before the fourth account joins', () => {
  localStorage.setItem('open-agricola-locale-v2', 'en')
  const choose = vi.fn()
  render(<LocaleProvider><TeamWaitingRoom value={waiting(3)} onChooseTeam={choose} onStart={vi.fn()} /></LocaleProvider>)
  const select = screen.getByRole('combobox', { name: 'Move Farmer 1 to a team' })
  expect(within(select).getByRole('option', { name: 'Team 2' })).not.toBeDisabled()
  fireEvent.change(select, { target: { value: '1' } })
  expect(choose).toHaveBeenCalledExactlyOnceWith(1, 'member-1')
})

it('offers a host an explicit member exchange after all four accounts join', () => {
  localStorage.setItem('open-agricola-locale-v2', 'en')
  const choose = vi.fn()
  render(<LocaleProvider><TeamWaitingRoom value={waiting()} onChooseTeam={choose} onStart={vi.fn()} /></LocaleProvider>)
  const select = screen.getByRole('combobox', { name: 'Move Farmer 1 to a team' })
  expect(within(select).getByRole('option', { name: 'Team 2 (Full)' })).toBeDisabled()
  expect(within(select).getByRole('option', { name: 'Swap with Farmer 2 (Team 2)' })).not.toBeDisabled()
  expect(within(select).getByRole('option', { name: 'Swap with Farmer 3 (Team 2)' })).not.toBeDisabled()
  fireEvent.change(select, { target: { value: 'swap:member-3' } })
  expect(choose).toHaveBeenCalledExactlyOnceWith(1, 'member-1', 'member-3')
  expect(screen.getByRole('button', { name: 'Start game' })).not.toBeDisabled()
})

it('lets the host explicitly exchange their own membership and respects pending mutations', () => {
  localStorage.setItem('open-agricola-locale-v2', 'en')
  const choose = vi.fn()
  const { rerender } = render(<LocaleProvider><TeamWaitingRoom value={waiting()} onChooseTeam={choose} onStart={vi.fn()} /></LocaleProvider>)
  const select = screen.getByRole('combobox', { name: 'Choose a team' })
  fireEvent.change(select, { target: { value: 'swap:member-2' } })
  expect(choose).toHaveBeenCalledExactlyOnceWith(1, undefined, 'member-2')
  rerender(<LocaleProvider><TeamWaitingRoom value={waiting()} onChooseTeam={choose} onStart={vi.fn()} disabled /></LocaleProvider>)
  expect(screen.getAllByRole('combobox').every(element => element.hasAttribute('disabled'))).toBe(true)
})

it('offers nonhosts only their own empty-slot moves and preserves Multihand automatic assignment', () => {
  localStorage.setItem('open-agricola-locale-v2', 'en')
  const value = { ...waiting(3), selfMemberId: 'member-1', isHost: false }
  const choose = vi.fn()
  const { rerender } = render(<LocaleProvider><TeamWaitingRoom value={value} onChooseTeam={choose} onStart={vi.fn()} /></LocaleProvider>)
  const select = screen.getByRole('combobox')
  expect(within(select).queryByRole('option', { name: /Swap with/ })).toBeNull()
  fireEvent.change(select, { target: { value: '1' } })
  expect(choose).toHaveBeenCalledExactlyOnceWith(1, undefined)
  const multihand: TeamWaitingRoomState = { ...waiting(2), canStart: true,
    teamConfig: { mode: 'multihand', seatsPerTeam: 2, seating: 'separated', scoring: 'sum' },
    members: waiting(2).members.map((member, index) => ({ ...member, teamIndex: index, seatCount: 2 })) }
  rerender(<LocaleProvider><TeamWaitingRoom value={multihand} onChooseTeam={choose} onStart={vi.fn()} /></LocaleProvider>)
  expect(screen.queryByRole('combobox')).toBeNull()
})
