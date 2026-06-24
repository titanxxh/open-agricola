// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OnboardingPage } from '../OnboardingPage'

const refreshSessionMock = vi.fn(async () => {})

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    refreshSession: refreshSessionMock,
  }),
}))

vi.mock('../../contexts/LocaleContext', () => {
  const labels: Record<string, string> = {
    'platform.loginTitle': 'Open Agricola',
    'platform.onboardingTitle': '完成注册',
    'platform.onboardingSubtitle': '设置你的 Open Agricola 用户名和本地密码',
    'platform.username': '用户名',
    'platform.usernamePlaceholder': '2-30 字符',
    'platform.displayName': '显示名称（可选）',
    'platform.displayNamePlaceholder': '留空则使用用户名',
    'platform.password': '密码',
    'platform.passwordPlaceholder': '至少 8 个字符',
    'platform.confirmPassword': '确认密码',
    'platform.registerBtn': '注册',
    'platform.loading': '加载中...',
    'platform.networkError': '网络错误',
    'platform.authErrors.invalid_username': '用户名需要 2-30 个字符，只能包含字母、数字、下划线或中文',
    'platform.authErrors.invalid_password': '密码至少需要 8 个字符',
    'platform.authErrors.password_mismatch': '两次输入的密码不一致',
    'platform.authErrors.username_taken': '用户名已被占用',
    'platform.authErrors.oauth_onboarding_expired': '注册会话已过期，请重新使用 GitHub 或 Google 注册',
  }
  return {
    useLocale: () => ({
      locale: 'zh',
      setLocale: vi.fn(),
      t: (key: string) => labels[key] ?? key,
    }),
  }
})

vi.mock('../../components/common/LocaleSwitcher', () => ({
  LocaleSwitcher: () => <div />,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/?page=onboarding')
})

describe('OnboardingPage', () => {
  it('validates password confirmation before submitting onboarding', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<OnboardingPage />)

    await user.type(screen.getByLabelText('用户名'), 'newuser')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'different123')
    await user.click(screen.getByRole('button', { name: '完成注册' }))

    expect(screen.getByRole('alert')).toHaveTextContent('两次输入的密码不一致')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('completes onboarding and navigates to lobby', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      user: { id: 'u1', username: 'newuser', displayName: 'New User' },
    })))
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState(null, '', '/?page=onboarding')
    render(<OnboardingPage />)

    await user.type(screen.getByLabelText('用户名'), 'newuser')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '完成注册' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/onboarding/complete'), expect.objectContaining({ credentials: 'include' })))
    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/'))
  })

  it('navigates to the onboarding return target when provided', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      user: { id: 'u1', username: 'newuser', displayName: 'New User' },
      returnTo: '/?page=workshop',
    })))
    vi.stubGlobal('fetch', fetchMock)
    window.history.replaceState(null, '', '/open-agricola/?page=onboarding')
    render(<OnboardingPage />)

    await user.type(screen.getByLabelText('用户名'), 'newuser')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '完成注册' }))

    expect(refreshSessionMock).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(window.location.pathname + window.location.search).toBe('/open-agricola/?page=workshop'))
  })
})
