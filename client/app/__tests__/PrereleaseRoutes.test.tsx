// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { browserApiFetch } from '../../services/browser-api'
import { PageRouter } from '../PageRouter'
const auth = vi.hoisted(() => vi.fn())
vi.mock('../../contexts/AuthContext', () => ({ useAuth: auth }))
vi.mock('../../contexts/LocaleContext', () => {
  const t = (key: string) => key
  return { useCurrentLocale: () => 'en', useLocale: () => ({ t }) }
})
vi.mock('../../services/browser-api', () => ({ browserApiFetch: vi.fn() }))
vi.mock('../../sandbox', () => ({ SandboxAppLazy: () => <form aria-label="Workshop authoring"><input /></form> }))
vi.mock('../SettingsPage', () => ({ SettingsPage: () => <form aria-label="Account management"><input type="password" /></form> }))
vi.mock('../LoginPage', () => ({ LoginPage: () => <form aria-label="Password login"><input type="password" /></form> }))
vi.mock('../OnboardingPage', () => ({ OnboardingPage: () => <form aria-label="Registration"><input /></form> }))
vi.mock('../ResetPasswordPage', () => ({ ResetPasswordPage: () => <form aria-label="Password reset"><input type="password" /></form> }))
vi.mock('../LobbyPage', () => ({ LobbyPage: () => <main>Admitted lobby</main> }))
vi.mock('../CardMetadataBoundary', () => ({ CardMetadataBoundary: ({ children }: { children: ReactNode }) => children }))
vi.mock('../../components/common/MobileTabBar', () => ({ MobileTabBar: () => null }))
beforeEach(() => {
  auth.mockReturnValue({ user: { id: 'u1', username: 'beta', displayName: 'Beta', betaAccess: true }, loading: false })
  vi.mocked(browserApiFetch).mockReset()
})
afterEach(() => { cleanup(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })
function expectNoAccountManagement() {
  expect(screen.queryByRole('form')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(document.querySelector('input[type=password]')).toBeNull()
}
it.each(['settings', 'login', 'onboarding', 'reset-password', 'operations'])('offers no independent account-management UI at the direct prerelease %s URL', page => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease')
  window.history.replaceState(null, '', `/?page=${page}`)
  render(<PageRouter />)
  if (!['login', 'onboarding'].includes(page)) expect(screen.getByText('prerelease.returnToProduction')).toBeVisible()
  expectNoAccountManagement()
})

it('shows the read-only notice and no Workshop authoring at the direct prerelease workshop URL', () => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease')
  window.history.replaceState(null, '', '/?page=workshop')
  render(<PageRouter />)
  expect(screen.getByText('prerelease.readonlyError')).toBeVisible()
  expect(browserApiFetch).not.toHaveBeenCalled()
  expectNoAccountManagement()
})


it.each(['', '?page=lobby', '?room=retained-room'])('offers fresh prerelease entry instead of password login at an unauthenticated %s route', search => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease')
  auth.mockReturnValue({ user: null, loading: false })
  window.history.replaceState(null, '', `/${search}`)
  render(<PageRouter />)
  expect(screen.queryByRole('form')).toBeNull()
  expect(document.querySelector('input[type=password]')).toBeNull()
  expect(screen.getByText('prerelease.returnToProduction')).toBeVisible()
  expect(screen.getByRole('link', { name: 'prerelease.entry' })).toHaveAttribute('href', expect.stringContaining('/open-agricola/auth/start?returnPath='))
})
