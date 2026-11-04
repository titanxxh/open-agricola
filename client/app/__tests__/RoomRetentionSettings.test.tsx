// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomRetentionSettings } from '../RoomRetentionSettings'

const apiFetch = vi.fn()
const labels: Record<string, string> = {
  'platform.retention.title': 'Room retention', 'platform.retention.waitingDays': 'Waiting days',
  'platform.retention.playingDays': 'Playing days', 'platform.retention.save': 'Save settings',
  'platform.retention.saved': 'Settings saved', 'platform.retention.conflict': 'Settings changed elsewhere',
  'platform.retention.reload': 'Reload settings', 'platform.retention.unavailable': 'Settings unavailable',
  'platform.retention.range': 'Whole days between 1 and 90',
}
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ apiFetch }) }))
vi.mock('../../contexts/LocaleContext', () => ({ useLocale: () => ({
  locale: 'en', t: (key: string) => labels[key] ?? key,
}) }))

const policy = { revision: 1, waitingDays: 3, playingDays: 7, updatedAt: null, updatedBy: null }
const response = (current = policy) => Response.json({ ok: true, policy: current })
const fields = () => ({ waiting: screen.getByLabelText('Waiting days'), playing: screen.getByLabelText('Playing days') })

beforeEach(() => { apiFetch.mockReset() })
afterEach(cleanup)

describe('RoomRetentionSettings', () => {
  it('saves edited durations and uses the returned policy version for the next save', async () => {
    apiFetch.mockResolvedValueOnce(response()).mockResolvedValueOnce(response({ ...policy, revision: 2, waitingDays: 5 }))
      .mockResolvedValueOnce(response({ ...policy, revision: 3, waitingDays: 5, playingDays: 14 }))
    const user = userEvent.setup()
    render(<RoomRetentionSettings />)
    await screen.findByDisplayValue('3')
    await user.clear(fields().waiting)
    await user.type(fields().waiting, '5')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText('Settings saved')
    expect(apiFetch.mock.calls[1]).toEqual(['/api/admin/retention-policy', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 1, waitingDays: 5, playingDays: 7 }),
    }])
    await user.clear(fields().playing)
    await user.type(fields().playing, '14')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(3))
    expect(apiFetch.mock.calls[2]?.[1].body).toBe(JSON.stringify({ expectedRevision: 2, waitingDays: 5, playingDays: 14 }))
  })

  it('keeps edits on conflict and requires an explicit reload before overwriting a newer policy', async () => {
    apiFetch.mockResolvedValueOnce(response()).mockResolvedValueOnce(Response.json({ ok: false }, { status: 409 }))
      .mockResolvedValueOnce(response({ ...policy, revision: 2, waitingDays: 9 }))
    const user = userEvent.setup()
    render(<RoomRetentionSettings />)
    await screen.findByDisplayValue('3')
    await user.clear(fields().waiting)
    await user.type(fields().waiting, '5')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText('Settings changed elsewhere')
    expect(fields().waiting).toHaveValue(5)
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Reload settings' }))
    await screen.findByDisplayValue('9')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled()
  })

  it('can retry a failed initial read', async () => {
    apiFetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(response())
    const user = userEvent.setup()
    render(<RoomRetentionSettings />)
    await screen.findByText('Settings unavailable')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Reload settings' }))
    await screen.findByDisplayValue('3')
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled()
  })

  it('keeps edits when saving fails', async () => {
    apiFetch.mockResolvedValueOnce(response()).mockRejectedValueOnce(new Error('offline'))
    const user = userEvent.setup()
    render(<RoomRetentionSettings />)
    await screen.findByDisplayValue('3')
    await user.clear(fields().waiting)
    await user.type(fields().waiting, '8')
    await user.click(screen.getByRole('button', { name: 'Save settings' }))
    await screen.findByText('Settings unavailable')
    expect(fields().waiting).toHaveValue(8)
    expect(screen.getByRole('button', { name: 'Save settings' })).toBeEnabled()
  })

  it('rejects invalid duration input before sending it', async () => {
    apiFetch.mockResolvedValueOnce(response())
    render(<RoomRetentionSettings />)
    await screen.findByDisplayValue('3')
    fireEvent.change(fields().waiting, { target: { value: '0' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Room retention' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Whole days between 1 and 90')
    expect(apiFetch).toHaveBeenCalledTimes(1)
  })
})
