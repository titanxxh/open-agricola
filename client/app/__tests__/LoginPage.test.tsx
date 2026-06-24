// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from '../LoginPage'

type LoginResult = { ok: boolean; code?: string; error?: string }

const loginMock = vi.fn(async () => ({ ok: true }))
const oauthStartUrlMock = vi.fn((provider: 'github' | 'google', intent: 'login' | 'register' | 'link') =>
  `/api/auth/oauth/${provider}/start?intent=${intent}`,
)

function mockUseAuthLoginResult(result: LoginResult) {
  loginMock.mockResolvedValueOnce(result)
}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
    oauthStartUrl: oauthStartUrlMock,
  }),
}))

vi.mock('../../contexts/LocaleContext', () => {
  const labels: Record<string, string> = {
    'platform.loginTitle': 'Open Agricola',
    'platform.subtitle': '在线 Agricola 对局平台',
    'platform.loginBtn': '登录',
    'platform.registerBtn': '注册',
    'platform.username': '用户名',
    'platform.usernamePlaceholder': '2-30 字符',
    'platform.password': '密码',
    'platform.passwordPlaceholder': '至少 8 个字符',
    'platform.loading': '加载中...',
    'platform.unknownError': '未知错误',
    'platform.networkError': '网络错误',
    'platform.oauthLoginGithub': '使用 GitHub 登录',
    'platform.oauthLoginGoogle': '使用 Google 登录',
    'platform.oauthRegisterGithub': '使用 GitHub 注册',
    'platform.oauthRegisterGoogle': '使用 Google 注册',
    'platform.oauthRegisterIntro': '新用户请先使用 GitHub 或 Google 注册。完成后你可以设置本地用户名和密码。',
    'platform.authErrors.invalid_login': '用户名或密码不正确',
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
  window.history.replaceState(null, '', '/')
})

describe('LoginPage auth UI', () => {
  it('renders provider logos inside OAuth login links', () => {
    render(<LoginPage />)

    expect(screen.getByRole('link', { name: '使用 GitHub 登录' }).querySelector('.oauth-provider-icon--github')).toBeTruthy()
    expect(screen.getByRole('link', { name: '使用 Google 登录' }).querySelector('.oauth-provider-icon--google')).toBeTruthy()
  })

  it('register mode offers GitHub and Google instead of username password registration', async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    await user.click(screen.getByRole('tab', { name: '注册' }))

    const githubLink = screen.getByRole('link', { name: '使用 GitHub 注册' })
    const googleLink = screen.getByRole('link', { name: '使用 Google 注册' })
    expect(githubLink).toHaveAttribute('href', '/api/auth/oauth/github/start?intent=register')
    expect(googleLink).toHaveAttribute('href', '/api/auth/oauth/google/start?intent=register')
    expect(githubLink.querySelector('.oauth-provider-icon--github')).toBeTruthy()
    expect(googleLink.querySelector('.oauth-provider-icon--google')).toBeTruthy()
    expect(screen.queryByLabelText('确认密码')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('用户名')).not.toBeInTheDocument()
  })

  it('localizes backend error codes instead of showing raw English', async () => {
    const user = userEvent.setup()
    mockUseAuthLoginResult({ ok: false, code: 'invalid_login', error: 'Invalid username or password' })
    render(<LoginPage />)

    await user.type(screen.getByLabelText('用户名'), 'bad')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(screen.getByRole('alert')).toHaveTextContent('用户名或密码不正确')
  })
})
