// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageRouter } from '../PageRouter'

const mockAuthState = vi.hoisted(() => ({
  user: null as null | { id: string; username: string; displayName: string },
  loading: false,
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthState.user,
    loading: mockAuthState.loading,
  }),
}))

vi.mock('../../contexts/LocaleContext', () => ({
  useLocale: () => ({
    locale: 'zh',
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}))

vi.mock('../LoginPage', () => ({
  LoginPage: () => <div>Login Page</div>,
}))

vi.mock('../OnboardingPage', () => ({
  OnboardingPage: () => <div>Onboarding Page</div>,
}))

vi.mock('../LobbyPage', () => ({
  LobbyPage: () => <div>Lobby Page</div>,
}))

vi.mock('../SettingsPage', () => ({
  SettingsPage: () => <div>Settings Page</div>,
}))

vi.mock('../../components/common/MobileTabBar', () => ({
  MobileTabBar: () => <nav>Mobile Tab Bar</nav>,
}))

vi.mock('../../components/common/GameLoadScreen', () => ({
  GameLoadScreen: ({ label }: { label: string }) => <div>{label}</div>,
}))

afterEach(() => {
  cleanup()
  mockAuthState.user = null
  mockAuthState.loading = false
  window.history.replaceState(null, '', '/')
})

describe('PageRouter auth routes', () => {
  it('allows unauthenticated users to access onboarding', () => {
    window.history.replaceState(null, '', '/?page=onboarding')

    render(<PageRouter />)

    expect(screen.getByText('Onboarding Page')).toBeInTheDocument()
  })

  it('redirects authenticated users from onboarding to lobby', async () => {
    mockAuthState.user = { id: 'u1', username: 'host', displayName: 'Host' }
    window.history.replaceState(null, '', '/?page=onboarding')

    render(<PageRouter />)

    expect(screen.getByText('Lobby Page')).toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/'))
  })
})
