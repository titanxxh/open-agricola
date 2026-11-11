// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://formal.agricola.test/"}
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { StrictMode } from 'react'
import { PrereleaseHandoffPage } from '../PrereleaseHandoffPage'

const apiFetch = vi.fn()
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'beta', betaAccess: true }, apiFetch }),
}))
vi.mock('../../contexts/LocaleContext', () => ({
  useLocale: () => ({ t: (key: string) => ({
    'prerelease.handoffInvalid': 'Invalid entry link. Enter from production again.',
    'prerelease.returnToProduction': 'Return to production',
    'prerelease.accessExpired': 'Sign in on production again.',
  }[key] ?? key) }),
}))
afterEach(() => { cleanup(); apiFetch.mockReset(); window.history.replaceState(null, '', '/') })

it('clears malformed handoff metadata and returns only to the production root', async () => {
  window.history.replaceState(null, '', '/?page=prerelease-handoff#browserChallenge=bad&returnTo=https://evil.test/')
  render(<PrereleaseHandoffPage />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid entry link. Enter from production again.')
  expect(screen.getByRole('link', { name: 'Return to production' }).getAttribute('href')).toBe('https://formal.agricola.test/')
  expect(window.location.hash).toBe('')
  expect(apiFetch).not.toHaveBeenCalled()
})

it('issues only once in StrictMode and refuses an unexpected callback', async () => {
  const browserChallenge = 'a'.repeat(43)
  window.history.replaceState(null, '', `/?page=prerelease-handoff#${new URLSearchParams({
    browserChallenge, state: 's'.repeat(43), targetOrigin: 'https://pre.agricola.test', returnTo: 'https://formal.agricola.test/',
  })}`)
  apiFetch.mockResolvedValueOnce(Response.json({ ok: true, protocolVersion: 1, entry: {
    kind: 'available', channel: 'prerelease', startUrl: 'https://pre.agricola.test/open-agricola/auth/start', returnTo: 'https://formal.agricola.test/',
  } })).mockResolvedValueOnce(Response.json({ ok: true, protocolVersion: 1, code: 'c'.repeat(43), expiresAt: Date.now() + 50_000,
    callbackUrl: 'https://evil.test/steal', returnTo: 'https://formal.agricola.test/',
  }))
  render(<StrictMode><PrereleaseHandoffPage /></StrictMode>)
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid entry link.')
  expect(apiFetch.mock.calls.filter(([path]) => path === '/api/prerelease/handoffs')).toHaveLength(1)
  expect(JSON.parse(String(apiFetch.mock.calls[1]?.[1]?.body))).toEqual({
    protocolVersion: 1, channel: 'prerelease', targetOrigin: 'https://pre.agricola.test', browserChallenge, returnTo: 'https://formal.agricola.test/',
  })
  expect(window.location.origin).toBe('https://formal.agricola.test')
})
