// @vitest-environment jsdom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomInvitePicker } from '../RoomInvitePicker'
import type { InvitablePlayer } from '../../../shared/contract/room-access'

const apiFetch = vi.hoisted(() => vi.fn<(path: string, init?: RequestInit) => Promise<Response>>())
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ apiFetch }) }))
vi.mock('../../contexts/LocaleContext', () => ({ useLocale: () => ({ t: (key: string) => key === 'platform.remove' ? 'Remove' : key }) }))

const players = [
  { id: 'ab_One', username: 'alice', displayName: 'Alice' },
  { id: 'ab_Two', username: 'bob', displayName: 'Bob' },
]
const response = (matches = players) => new Response(JSON.stringify({ ok: true, players: matches }))
function Picker() {
  const [value, setValue] = useState<InvitablePlayer[]>([])
  return <><label htmlFor="invited-players">Invited players</label><RoomInvitePicker value={value} onChange={setValue} /></>
}
const advanceSearch = () => act(async () => { await vi.advanceTimersByTimeAsync(250) })

beforeEach(() => { vi.useFakeTimers(); apiFetch.mockReset(); apiFetch.mockImplementation(async () => response()) })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('invited player autocomplete', () => {
  it('starts at two name characters and selects removable names without showing IDs', async () => {
    render(<Picker />)
    const input = screen.getByRole('combobox', { name: 'Invited players' })
    fireEvent.change(input, { target: { value: 'a' } })
    await advanceSearch()
    expect(apiFetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(input, { target: { value: 'ab' } })
    await advanceSearch()
    expect(apiFetch).toHaveBeenCalledWith('/api/lobby/players?prefix=ab', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByRole('option', { name: /Alice/ })).not.toHaveTextContent('ab_One')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Remove Alice' })).toBeInTheDocument()
    expect(screen.queryByText('ab_One')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.change(input, { target: { value: 'ab' } })
    await advanceSearch()
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.click(screen.getByRole('option', { name: /Bob/ }))
    expect(input).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Remove Bob' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Alice' }))
    expect(screen.queryByRole('button', { name: 'Remove Alice' })).toBeNull()
    fireEvent.change(input, { target: { value: 'ab' } })
    await advanceSearch()
    expect(screen.getByRole('option', { name: /Alice/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /Bob/ })).toBeNull()
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

  it('shows a retry message on lookup failure and keeps the name query', async () => {
    apiFetch.mockRejectedValue(new Error('offline'))
    render(<Picker />)
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Alice' } })
    await advanceSearch()
    expect(screen.getByRole('status')).toHaveTextContent('platform.invitedPlayerSearchFailed')
    expect(input).toHaveValue('Alice')
  })

  it('waits for Chinese composition to finish and does not select with the IME confirmation key', async () => {
    apiFetch.mockImplementation(async () => response([{ id: 'random-id', username: 'aming', displayName: '阿明' }]))
    render(<Picker />)
    const input = screen.getByRole('combobox')
    fireEvent.compositionStart(input)
    fireEvent.change(input, { target: { value: '阿明' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    await advanceSearch()
    expect(apiFetch).not.toHaveBeenCalled()
    fireEvent.compositionEnd(input)
    await advanceSearch()
    expect(apiFetch).toHaveBeenCalledWith('/api/lobby/players?prefix=%E9%98%BF%E6%98%8E', expect.any(Object))
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(screen.queryByRole('button', { name: 'Remove 阿明' })).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: /阿明/ }))
    expect(screen.getByRole('button', { name: 'Remove 阿明' })).toBeInTheDocument()
    expect(input).toHaveValue('')
  })
})
