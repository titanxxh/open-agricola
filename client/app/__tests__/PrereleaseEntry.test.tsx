// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://formal.agricola.test/"}
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AuthUser } from '../../contexts/AuthContext'
import { PrereleaseEntry } from '../PrereleaseEntry'

const apiFetch = vi.fn()
const auth = vi.hoisted((): { user: AuthUser | null } => ({ user: { id: 'beta', username: 'beta', displayName: 'Beta', betaAccess: true } }))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: auth.user, apiFetch }),
}))
vi.mock('../../contexts/LocaleContext', () => ({
  useLocale: () => ({ t: (key: string) => ({
    'prerelease.entry': 'Enter prerelease',
    'prerelease.entryHint': 'Opens in a new tab.',
    'prerelease.unavailable': 'Prerelease is unavailable.',
  }[key] ?? key) }),
}))
afterEach(() => { cleanup(); apiFetch.mockReset(); auth.user = { id: 'beta', username: 'beta', displayName: 'Beta', betaAccess: true } })

it('offers a fresh configured target in a separate tab for a Beta account', async () => {
  apiFetch.mockResolvedValue(Response.json({ ok: true, protocolVersion: 1, entry: {
    kind: 'available', channel: 'prerelease', startUrl: 'https://pre.agricola.test/open-agricola/auth/start', returnTo: 'https://formal.agricola.test/',
  } }))
  render(<PrereleaseEntry />)
  const entry = await screen.findByRole('link', { name: 'Enter prerelease' })
  expect(entry.getAttribute('href')).toBe('https://pre.agricola.test/open-agricola/auth/start')
  expect(entry.getAttribute('target')).toBe('_blank')
  expect(entry.getAttribute('rel')).toBe('noopener noreferrer')
  expect(apiFetch).toHaveBeenCalledWith('/api/prerelease/entry')
})

it.each<AuthUser | null>([null, { id: 'ordinary', username: 'ordinary', displayName: 'Ordinary' }])('hides the entry without account qualification', user => {
  auth.user = user
  render(<PrereleaseEntry />)
  expect(screen.queryByText('Enter prerelease')).not.toBeInTheDocument()
  expect(apiFetch).not.toHaveBeenCalled()
})

it('explains a configured qualification with no open target', async () => {
  apiFetch.mockResolvedValue(Response.json({ ok: true, protocolVersion: 1, entry: { kind: 'disabled' } }))
  render(<PrereleaseEntry />)
  expect(await screen.findByRole('status')).toHaveTextContent('Prerelease is unavailable.')
  expect(screen.getByRole('button', { name: 'Enter prerelease' })).toBeDisabled()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})

it('does not revive entry from an older response after a qualification denial', async () => {
  let finishOld: (response: Response) => void = () => { throw new Error('Old request not started') }
  apiFetch.mockReturnValueOnce(new Promise<Response>(resolve => { finishOld = resolve }))
    .mockResolvedValueOnce(Response.json({ ok: false, code: 'beta_access_required' }, { status: 403 }))
  render(<PrereleaseEntry />)
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(screen.queryByText('Enter prerelease')).not.toBeInTheDocument())
  await act(async () => finishOld(Response.json({ ok: true, protocolVersion: 1, entry: {
    kind: 'available', channel: 'prerelease', startUrl: 'https://pre.agricola.test/open-agricola/auth/start', returnTo: 'https://formal.agricola.test/',
  } })))
  expect(screen.queryByText('Enter prerelease')).not.toBeInTheDocument()
})

it('keeps an unexpected target closed', async () => {
  apiFetch.mockResolvedValue(Response.json({ ok: true, protocolVersion: 1, entry: {
    kind: 'available', channel: 'prerelease', startUrl: 'https://evil.test/steal', returnTo: 'https://formal.agricola.test/',
  } }))
  render(<PrereleaseEntry />)
  await waitFor(() => expect(apiFetch).toHaveBeenCalled())
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Enter prerelease' })).toBeDisabled()
})

it('keeps a known qualification denial hidden when a later refresh fails', async () => {
  apiFetch.mockResolvedValueOnce(Response.json({ ok: false, code: 'beta_access_required' }, { status: 403 }))
    .mockRejectedValueOnce(new Error('Authority temporarily unavailable'))
  render(<PrereleaseEntry />)
  await waitFor(() => expect(screen.queryByText('Enter prerelease')).not.toBeInTheDocument())
  fireEvent(window, new Event('focus'))
  await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByText('Enter prerelease')).not.toBeInTheDocument())
})
