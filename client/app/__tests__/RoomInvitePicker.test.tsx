// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomInvitePicker } from '../RoomInvitePicker'

const apiFetch = vi.hoisted(() => vi.fn<(path: string, init?: RequestInit) => Promise<Response>>())
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ apiFetch }) }))
vi.mock('../../contexts/LocaleContext', () => ({ useLocale: () => ({ t: (key: string) => key }) }))

const players = [
  { id: 'ab_One', username: 'alice', displayName: 'Alice' },
  { id: 'ab_Two', username: 'bob', displayName: 'Bob' },
]
const response = (matches = players) => new Response(JSON.stringify({ ok: true, players: matches }))
function Picker() {
  const [value, setValue] = useState('')
  return <><label htmlFor="invited-player-ids">Invited IDs</label><RoomInvitePicker value={value} onChange={setValue} /></>
}
const advanceSearch = () => act(async () => { await vi.advanceTimersByTimeAsync(250) })

beforeEach(() => { vi.useFakeTimers(); apiFetch.mockReset(); apiFetch.mockImplementation(async () => response()) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('invited player autocomplete', () => {
  it('starts at two ID characters and replaces the prefix with a selected full ID', async () => {
    render(<Picker />)
    const input = screen.getByRole('combobox', { name: 'Invited IDs' })
    fireEvent.change(input, { target: { value: 'a' } })
    await advanceSearch()
    expect(apiFetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(input, { target: { value: 'ab' } })
    await advanceSearch()
    expect(apiFetch).toHaveBeenCalledWith('/api/lobby/players?prefix=ab', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(screen.getAllByRole('option')).toHaveLength(2)
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('ab_One, ')
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(input, { target: { value: 'ab_One, ab' } })
    await advanceSearch()
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(screen.getByRole('option', { name: /Bob/ }))
    expect(input).toHaveValue('ab_One, ab_Two, ')
  })

  it('keeps the latest prefix results when a cancelled request returns late', async () => {
    const old = Promise.withResolvers<Response>()
    apiFetch.mockImplementation(path => path.endsWith('=ab') ? old.promise : Promise.resolve(response([
      { id: 'xy_Three', username: 'carol', displayName: 'Carol' },
    ])))
    render(<Picker />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'ab' } })
    await advanceSearch()
    fireEvent.change(input, { target: { value: 'xy' } })
    await advanceSearch()
    expect(screen.getByRole('option', { name: /Carol/ })).toBeInTheDocument()
    await act(async () => { old.resolve(response()) })
    expect(screen.queryByRole('option', { name: /Alice/ })).toBeNull()
    expect(screen.getByRole('option', { name: /Carol/ })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows a retry message on lookup failure and keeps a pasted full ID', async () => {
    apiFetch.mockRejectedValue(new Error('offline'))
    render(<Picker />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'ab_One' } })
    await advanceSearch()
    expect(screen.getByRole('status')).toHaveTextContent('platform.invitedPlayerSearchFailed')
    expect(input).toHaveValue('ab_One')
  })
})
