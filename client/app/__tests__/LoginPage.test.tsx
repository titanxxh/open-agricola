// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginPage } from '../LoginPage'

type LoginResult = { ok: boolean; code?: string; error?: string }

const loginMock = vi.fn(async () => ({ ok: true }))
const registerWithPasswordMock = vi.fn(async () => ({ ok: true, status: 'verification_required' as const }))
const resendVerificationMock = vi.fn(async () => ({ ok: true }))
const oauthStartUrlMock = vi.fn((
  provider: 'github' | 'google',
  intent: 'login' | 'register' | 'link',
  opts?: { inviteCode?: string },
) => {
  const params = new URLSearchParams({ intent })
  if (opts?.inviteCode) params.set('inviteCode', opts.inviteCode)
  return `/api/auth/oauth/${provider}/start?${params.toString()}`
})

function mockUseAuthLoginResult(result: LoginResult) {
  loginMock.mockResolvedValueOnce(result)
}

function policyResponse(policy: 'invite_only' | 'open' | 'disabled' = 'invite_only'): Response {
  return new Response(JSON.stringify({ ok: true, policy }))
}

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
    registerWithPassword: registerWithPasswordMock,
    resendVerification: resendVerificationMock,
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
    'platform.email': '邮箱',
    'platform.emailPlaceholder': '用于验证账号',
    'platform.displayName': '显示名称',
    'platform.displayNamePlaceholder': '可选',
    'platform.password': '密码',
    'platform.passwordPlaceholder': '至少 8 个字符',
    'platform.confirmPassword': '确认密码',
    'platform.loading': '加载中...',
    'platform.unknownError': '未知错误',
    'platform.networkError': '网络错误',
    'platform.oauthLoginGithub': '使用 GitHub 登录',
    'platform.oauthLoginGoogle': '使用 Google 登录',
    'platform.oauthRegisterGithub': '使用 GitHub 注册',
    'platform.oauthRegisterGoogle': '使用 Google 注册',
    'platform.oauthRegisterIntro': '新用户请先使用 GitHub 或 Google 注册。完成后你可以设置本地用户名和密码。',
    'platform.passwordRegisterBtn': '用用户名注册',
    'platform.checkEmailTitle': '验证邮件已发送',
    'platform.checkEmailBody': '请打开邮件完成验证后继续使用。',
    'platform.resendVerification': '重发验证邮件',
    'platform.authErrors.invalid_login': '用户名或密码不正确',
    'platform.inviteCode': '邀请码',
    'platform.inviteCodePlaceholder': '输入一次性邀请码',
    'platform.inviteOnlyNote': '当前只开放邀请注册',
    'platform.authErrors.invalid_invite': '邀请码无效、已过期或已使用',
    'platform.authErrors.registration_disabled': '当前暂不开放注册',
    'platform.authErrors.invalid_email': '邮箱格式不正确',
    'platform.authErrors.email_taken': '邮箱已被使用',
    'platform.authErrors.email_not_verified': '邮箱尚未验证',
    'platform.authErrors.email_delivery_failed': '验证邮件发送失败',
  }
  const t = (key: string) => labels[key] ?? key
  return {
    useLocale: () => ({
      locale: 'zh',
      setLocale: vi.fn(),
      t,
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
  window.history.replaceState(null, '', '/')
})

describe('LoginPage auth UI', () => {
  it('renders provider logos inside OAuth login links', () => {
    render(<LoginPage />)

    expect(screen.getByRole('link', { name: '使用 GitHub 登录' }).querySelector('.oauth-provider-icon--github')).toBeTruthy()
    expect(screen.getByRole('link', { name: '使用 Google 登录' }).querySelector('.oauth-provider-icon--google')).toBeTruthy()
  })

  it('register mode offers OAuth and password email registration', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(policyResponse('open')))
    render(<LoginPage />)

    await user.click(screen.getByRole('tab', { name: '注册' }))

    expect(screen.getByRole('link', { name: '使用 GitHub 注册' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '使用 Google 注册' })).toBeInTheDocument()
    expect(screen.getByLabelText('用户名')).toBeInTheDocument()
    expect(screen.getByLabelText('邮箱')).toBeInTheDocument()
    expect(screen.getByLabelText('密码')).toBeInTheDocument()
    expect(screen.getByLabelText('确认密码')).toBeInTheDocument()
  })

  it('submits password email registration with invite when required', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(policyResponse('invite_only')))
    render(<LoginPage />)

    await user.click(screen.getByRole('tab', { name: '注册' }))
    await user.type(await screen.findByLabelText('邀请码'), 'oa_valid_code')
    await user.type(screen.getByLabelText('用户名'), 'localuser')
    await user.type(screen.getByLabelText('邮箱'), 'local@example.com')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '用用户名注册' }))

    expect(registerWithPasswordMock).toHaveBeenCalledWith({
      username: 'localuser',
      email: 'local@example.com',
      password: 'password123',
      confirmPassword: 'password123',
      displayName: '',
      inviteCode: 'oa_valid_code',
    })
    expect(screen.getByText('验证邮件已发送')).toBeInTheDocument()
  })

  it('disables password registration under the same policy gating as oauth', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(policyResponse('invite_only')))
    render(<LoginPage />)

    await user.click(screen.getByRole('tab', { name: '注册' }))

    const submit = screen.getByRole('button', { name: '用用户名注册' })
    expect(submit).toBeDisabled()
    await user.type(screen.getByLabelText('用户名'), 'localuser')
    await user.type(screen.getByLabelText('邮箱'), 'local@example.com')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'password123')
    await user.click(submit)

    expect(registerWithPasswordMock).not.toHaveBeenCalled()
  })

  it('disables password registration when policy disables registration', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(policyResponse('disabled')))
    render(<LoginPage />)

    await user.click(screen.getByRole('tab', { name: '注册' }))

    const submit = screen.getByRole('button', { name: '用用户名注册' })
    expect(submit).toBeDisabled()
    await user.click(submit)

    expect(registerWithPasswordMock).not.toHaveBeenCalled()
  })

  it('requires invite code before oauth registration in invite-only mode', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(policyResponse('invite_only')))
    render(<LoginPage />)

    await user.click(screen.getByRole('tab', { name: '注册' }))

    await screen.findByLabelText('邀请码')
    const githubControl = screen.getByRole('button', { name: '使用 GitHub 注册' })
    const googleControl = screen.getByRole('button', { name: '使用 Google 注册' })
    expect(githubControl).toHaveAttribute('aria-disabled', 'true')
    expect(googleControl).toHaveAttribute('aria-disabled', 'true')
    expect(githubControl).not.toHaveAttribute('href')
    expect(googleControl).not.toHaveAttribute('href')

    await user.click(githubControl)

    expect(screen.getByRole('alert')).toHaveTextContent('邀请码无效、已过期或已使用')
  })

  it('adds inviteCode to oauth register urls after invite entry', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(policyResponse('invite_only')))
    render(<LoginPage />)

    await user.click(screen.getByRole('tab', { name: '注册' }))
    await user.type(await screen.findByLabelText('邀请码'), 'oa_valid_code')

    expect(screen.getByRole('link', { name: '使用 GitHub 注册' }))
      .toHaveAttribute('href', '/api/auth/oauth/github/start?intent=register&inviteCode=oa_valid_code')
    expect(screen.getByRole('link', { name: '使用 Google 注册' }))
      .toHaveAttribute('href', '/api/auth/oauth/google/start?intent=register&inviteCode=oa_valid_code')
  })

  it('does not show invite code in open registration mode', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(policyResponse('open')))
    render(<LoginPage />)

    await user.click(screen.getByRole('tab', { name: '注册' }))

    expect(screen.queryByLabelText('邀请码')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '使用 GitHub 注册' }))
      .toHaveAttribute('href', '/api/auth/oauth/github/start?intent=register')
  })

  it('resends verification email and shows localized backend failure', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(policyResponse('open')))
    registerWithPasswordMock.mockResolvedValueOnce({ ok: true, status: 'verification_required' })
    resendVerificationMock.mockResolvedValueOnce({ ok: false, code: 'email_delivery_failed', error: 'send failed' })
    render(<LoginPage />)

    await user.click(screen.getByRole('tab', { name: '注册' }))
    await user.type(screen.getByLabelText('用户名'), 'localuser')
    await user.type(screen.getByLabelText('邮箱'), 'local@example.com')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '用用户名注册' }))
    await user.click(screen.getByRole('button', { name: '重发验证邮件' }))

    expect(resendVerificationMock).toHaveBeenCalledWith('local@example.com')
    expect(screen.getByRole('alert')).toHaveTextContent('验证邮件发送失败')
  })

  it('resets verification sent state when switching tabs', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(policyResponse('open'))
      .mockResolvedValueOnce(policyResponse('open')))
    registerWithPasswordMock.mockResolvedValueOnce({ ok: true, status: 'verification_required' })
    render(<LoginPage />)

    await user.click(screen.getByRole('tab', { name: '注册' }))
    await user.type(screen.getByLabelText('用户名'), 'localuser')
    await user.type(screen.getByLabelText('邮箱'), 'local@example.com')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '用用户名注册' }))

    expect(screen.getByText('验证邮件已发送')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '登录' }))
    await user.click(screen.getByRole('tab', { name: '注册' }))

    expect(screen.queryByText('验证邮件已发送')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '用用户名注册' })).toBeInTheDocument()
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

  it('localizes email_not_verified on login', async () => {
    const user = userEvent.setup()
    mockUseAuthLoginResult({ ok: false, code: 'email_not_verified', error: 'Email has not been verified' })
    render(<LoginPage />)

    await user.type(screen.getByLabelText('用户名'), 'localuser')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(screen.getByRole('alert')).toHaveTextContent('邮箱尚未验证')
  })

  it('lets unverified users request another verification email after login fails', async () => {
    const user = userEvent.setup()
    mockUseAuthLoginResult({ ok: false, code: 'email_not_verified', error: 'Email has not been verified' })
    render(<LoginPage />)

    await user.type(screen.getByLabelText('用户名'), 'localuser')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '登录' }))
    await user.type(screen.getByLabelText('邮箱'), 'local@example.com')
    await user.click(screen.getByRole('button', { name: '重发验证邮件' }))

    expect(resendVerificationMock).toHaveBeenCalledWith('local@example.com')
  })
})
