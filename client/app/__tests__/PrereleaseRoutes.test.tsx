// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PageRouter } from '../PageRouter'
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', username: 'beta', displayName: 'Beta', betaAccess: true }, loading: false }) }))
vi.mock('../../contexts/LocaleContext', () => ({ useCurrentLocale: () => 'en', useLocale: () => ({ t: (key: string) => key }) }))
vi.mock('../SettingsPage', () => ({ SettingsPage: () => <form aria-label="Account management"><input type="password" /></form> }))
vi.mock('../LoginPage', () => ({ LoginPage: () => <form aria-label="Password login"><input type="password" /></form> }))
vi.mock('../OnboardingPage', () => ({ OnboardingPage: () => <form aria-label="Registration"><input /></form> }))
vi.mock('../ResetPasswordPage', () => ({ ResetPasswordPage: () => <form aria-label="Password reset"><input type="password" /></form> }))
vi.mock('../LobbyPage', () => ({ LobbyPage: () => <main>Admitted lobby</main> }))
vi.mock('../../components/common/MobileTabBar', () => ({ MobileTabBar: () => null }))
afterEach(() => { cleanup(); vi.unstubAllEnvs(); window.history.replaceState(null, '', '/') })
it.each(['settings', 'login', 'onboarding', 'reset-password', 'operations', 'workshop'])('offers no independent account-management UI at the direct prerelease %s URL', page => {
  vi.stubEnv('VITE_RELEASE_CHANNEL', 'prerelease')
  window.history.replaceState(null, '', `/?page=${page}`)
  render(<PageRouter />)
  expect(screen.queryByRole('form')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  expect(document.querySelector('input[type=password]')).toBeNull()
})
