// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BetaAccessSettings } from '../BetaAccessSettings'
import { t as translate } from '../../../shared/i18n'
import type { BetaAccessGrant } from '../../../shared/contract/beta-access'

const apiFetch = vi.hoisted(() => vi.fn<(path: string, init?: RequestInit) => Promise<Response>>())
let isAdmin = true
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { isAdmin }, apiFetch }) }))
vi.mock('../../contexts/LocaleContext', () => ({
  useCurrentLocale: () => 'en',
  useLocale: () => ({ locale: 'en', t: (key: string, params?: Record<string, string | number>) => translate('en', key, params) }),
}))
const player = { id: 'player', username: 'alice', displayName: 'Alice' }
const grant: BetaAccessGrant = { account: player,
  grantedBy: { id: 'admin', username: 'owner', displayName: 'Owner' }, grantedAt: 1794144000000 }

beforeEach(() => { apiFetch.mockReset(); isAdmin = true })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('Beta access settings', () => {
  it('selects through administrator Beta account lookup, grants access, and confirms before revocation', async () => {
    let grants: BetaAccessGrant[] = []
    apiFetch.mockImplementation(async (path, init) => {
      if (path === '/api/lobby/players?prefix=al&scope=beta-access') return Response.json({ ok: true, players: [player] })
      if (init?.method === 'PUT') grants = [grant]
      if (init?.method === 'DELETE') grants = []
      return Response.json({ ok: true, grants })
    })
    render(<BetaAccessSettings />)
    await screen.findByText('No beta access has been granted.')
    const input = screen.getByRole('combobox', { name: 'Account' })
    fireEvent.change(input, { target: { value: 'a' } })
    expect(apiFetch).not.toHaveBeenCalledWith('/api/lobby/players?prefix=a', expect.anything())
    fireEvent.change(input, { target: { value: 'al' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Alice @alice' }))
    expect(apiFetch).toHaveBeenCalledWith('/api/lobby/players?prefix=al&scope=beta-access', expect.objectContaining({ signal: expect.any(AbortSignal) }))
    fireEvent.click(screen.getByRole('button', { name: 'Grant' }))
    const row = await screen.findByRole('row', { name: /Alice @alice Owner @owner/ })
    expect(row).toHaveTextContent(new Date(grant.grantedAt).toLocaleString())
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/beta-access', expect.objectContaining({ method: 'PUT', body: '{"userId":"player"}' }))
    fireEvent.click(within(row).getByRole('button', { name: 'Revoke' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Revoke beta access for @alice? This takes effect immediately. Existing team rooms are not affected.')
    expect(apiFetch.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.queryByRole('row', { name: /Alice @alice Owner @owner/ })).toBeNull())
    expect(apiFetch).toHaveBeenCalledWith('/api/admin/beta-access', expect.objectContaining({ method: 'DELETE', body: '{"userId":"player"}' }))
  })

  it('does not expose or load management for an ordinary account', () => {
    isAdmin = false
    render(<BetaAccessSettings />)
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(apiFetch).not.toHaveBeenCalled()
  })
})
