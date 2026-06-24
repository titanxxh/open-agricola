// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PageRouter } from '../PageRouter'
import { AuthProvider } from '../../contexts/AuthContext'

vi.mock('../../contexts/LocaleContext', () => ({
  useLocale: () => ({
    locale: 'zh',
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}))

vi.mock('../LoginPage', () => ({
  LoginPage: () => <label>用户名<input /></label>,
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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

const renderWithAuth = () => render(<AuthProvider><PageRouter /></AuthProvider>)

const stubMe = (data: { ok: boolean; user?: { id: string; username: string; displayName: string } }) => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/api/auth/me')) {
      return new Response(JSON.stringify(data), { status: data.ok ? 200 : 401 })
    }
    return new Response(JSON.stringify({ ok: true }))
  }))
}

describe('PageRouter auth routes', () => {
  it('allows unauthenticated users to access onboarding', async () => {
    stubMe({ ok: false })
    window.history.replaceState(null, '', '/?page=onboarding')

    renderWithAuth()

    expect(await screen.findByText('Onboarding Page')).toBeInTheDocument()
  })

  it('redirects authenticated users from onboarding to lobby', async () => {
    stubMe({ ok: true, user: { id: 'u1', username: 'host', displayName: 'Host' } })
    window.history.replaceState(null, '', '/?page=onboarding')

    renderWithAuth()

    expect(await screen.findByText('Lobby Page')).toBeInTheDocument()
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/'))
  })

  it('does not bypass login for arbitrary ws rooms with player and devMode params', async () => {
    stubMe({ ok: false })
    window.history.replaceState(null, '', '/?page=game&transport=ws&room=abc123&player=p1&devMode=1')

    renderWithAuth()

    expect(await screen.findByLabelText('用户名')).toBeVisible()
  })
})
