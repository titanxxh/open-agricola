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
    'platform.backToLobbyPlain': '返回大厅',
    'platform.onboardingTitle': '完成注册',
    'platform.onboardingSubtitle': '设置你的 Open Agricola 用户名和本地密码',
    'platform.username': '用户名',
    'platform.usernamePlaceholder': '2-30 字符',
    'platform.displayName': '显示名称（可选）',
    'platform.displayNamePlaceholder': '留空则使用用户名',
    'platform.password': '密码',
    'platform.passwordPlaceholder': '至少 8 个字符',
    'platform.confirmPassword': '确认密码',
    'platform.inviteCode': '邀请码',
    'platform.inviteCodePlaceholder': '输入一次性邀请码',
    'platform.inviteOnlyNote': '当前只开放邀请注册',
    'platform.registerBtn': '注册',
    'platform.loading': '加载中...',
    'platform.networkError': '网络错误',
    'platform.authErrors.invalid_username': '用户名需要 2-30 个字符，只能包含字母、数字、下划线或中文',
    'platform.authErrors.invalid_password': '密码至少需要 8 个字符',
    'platform.authErrors.password_mismatch': '两次输入的密码不一致',
    'platform.authErrors.username_taken': '用户名已被占用',
    'platform.authErrors.invalid_invite': '邀请码无效、已过期或已使用',
    'platform.authErrors.registration_disabled': '当前暂不开放注册',
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

function policyResponse(policy: 'invite_only' | 'open' | 'disabled' = 'invite_only'): Response {
  return new Response(JSON.stringify({ ok: true, policy }))
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(res => {
    resolve = res
  })
  return { promise, resolve }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/?page=onboarding')
})

describe('OnboardingPage', () => {
  it('keeps onboarding context separate from the native home brand', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(policyResponse('open')))

    render(<OnboardingPage />)

    expect(screen.getByRole('link', { name: '返回大厅' }))
      .toHaveTextContent('Open Agricola')
    expect(screen.getByRole('heading', { name: '完成注册' })).toBeVisible()
  })

  it('validates password confirmation before submitting onboarding', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValueOnce(policyResponse('open'))
    vi.stubGlobal('fetch', fetchMock)
    render(<OnboardingPage />)

    await user.type(screen.getByLabelText('用户名'), 'newuser')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'different123')
    await user.click(screen.getByRole('button', { name: '完成注册' }))

    expect(screen.getByRole('alert')).toHaveTextContent('两次输入的密码不一致')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/registration-policy'),
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('completes onboarding and navigates to lobby', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(policyResponse('open'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
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
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(policyResponse('open'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
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

  it('does not ask for invite code during invite-only onboarding', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(policyResponse('invite_only'))
    vi.stubGlobal('fetch', fetchMock)
    render(<OnboardingPage />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/registration-policy'),
        expect.objectContaining({ credentials: 'include' }),
      )
    })
    expect(screen.queryByLabelText('邀请码')).not.toBeInTheDocument()
  })

  it('does not submit inviteCode during invite-only onboarding', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(policyResponse('invite_only'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        user: { id: 'u1', username: 'newuser', displayName: 'New User' },
      })))
    vi.stubGlobal('fetch', fetchMock)
    render(<OnboardingPage />)

    await user.type(screen.getByLabelText('用户名'), 'newuser')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '完成注册' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/auth/onboarding/complete'),
        expect.objectContaining({
          body: expect.not.stringContaining('"inviteCode"'),
        }),
      )
    })
  })

  it('does not locally block open onboarding while registration policy is still loading', async () => {
    const user = userEvent.setup()
    const policyFetch = deferred<Response>()
    const fetchMock = vi.fn()
      .mockReturnValueOnce(policyFetch.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        user: { id: 'u1', username: 'newuser', displayName: 'New User' },
      })))
    vi.stubGlobal('fetch', fetchMock)
    render(<OnboardingPage />)

    await user.type(screen.getByLabelText('用户名'), 'newuser')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '完成注册' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/api/auth/onboarding/complete'),
        expect.objectContaining({
          body: expect.not.stringContaining('"inviteCode"'),
        }),
      )
    })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a network error and blocks submit when registration policy fails to load', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    render(<OnboardingPage />)

    await screen.findByRole('alert')
    expect(screen.getByRole('alert')).toHaveTextContent('网络错误')
    expect(screen.getByRole('button', { name: '完成注册' })).toBeDisabled()

    await user.type(screen.getByLabelText('用户名'), 'newuser')
    await user.type(screen.getByLabelText('密码'), 'password123')
    await user.type(screen.getByLabelText('确认密码'), 'password123')
    await user.click(screen.getByRole('button', { name: '完成注册' }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
