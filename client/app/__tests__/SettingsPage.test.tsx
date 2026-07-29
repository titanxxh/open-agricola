// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../SettingsPage'

const apiFetchMock = vi.fn()
const logoutMock = vi.fn()
const logoutAllMock = vi.fn()
let mockUser = { id: 'u1', username: 'testuser', displayName: 'Test User', isAdmin: false }
const labels: Record<string, string> = {
  'platform.backToLobby': '返回大厅',
  'platform.backToLobbyPlain': '返回大厅',
  'platform.settingsTitle': '设置',
  'platform.basicInfo': '基本信息',
  'platform.notEditable': '不可编辑',
  'platform.displayNameLabel': '显示名称',
  'platform.displayNameGamePlaceholder': '游戏中显示的名称',
  'platform.saved': '已保存',
  'platform.save': '保存',
  'platform.changePassword': '修改密码',
  'platform.currentPassword': '当前密码',
  'platform.newPassword': '新密码',
  'platform.confirmNewPassword': '确认新密码',
  'platform.passwordPlaceholder': '至少 8 个字符',
  'platform.passwordMismatch': '两次输入的密码不一致',
  'platform.passwordChanged': '密码已修改',
  'platform.changePasswordBtn': '修改密码',
  'platform.linkedAccounts': '绑定账号',
  'platform.notLinked': '未绑定',
  'platform.linkGithub': '绑定 GitHub',
  'platform.linkGoogle': '绑定 Google',
  'platform.adminInvites': '邀请注册',
  'platform.bugReport.settingsTitle': 'GitHub Issue 提交',
  'platform.bugReport.settingsConnected': '已连接 Issue 提交身份',
  'platform.bugReport.settingsDisconnected': '尚未连接',
  'platform.bugReport.settingsHint': '独立连接',
  'platform.bugReport.disconnect': '断开 Issue 提交连接',
  'platform.bugReport.disconnected': 'Issue 提交连接已移除。',
  'platform.inviteCode': '邀请码',
  'platform.inviteCodeHint': '留空则自动生成',
  'platform.generateInvite': '创建邀请码',
  'platform.inviteExpiresInDays': '有效天数',
  'platform.inviteExpiresAt': '到期时间',
  'platform.inviteMaxUses': '最大使用次数',
  'platform.inviteUsage': '已使用 {used} / {max}',
  'platform.generatedInvite': '新邀请码',
  'platform.inviteShownOnce': '请立即复制，之后不会再次显示明文。',
  'platform.revokeInvite': '撤销',
  'platform.noInvites': '暂无邀请码',
  'platform.inviteStatus.active': '可用',
  'platform.inviteStatus.used': '已用完',
  'platform.inviteStatus.expired': '已过期',
  'platform.inviteStatus.revoked': '已撤销',
  'platform.dangerZone': '危险区域',
  'platform.confirmLogoutAll': '确认退出所有设备',
  'platform.logoutAllDevices': '退出所有设备',
  'platform.logoutNote': '这会让其他设备重新登录',
  'platform.deleteAccount': '删除账号',
  'platform.confirmDeleteAccount': '确认删除账号',
  'platform.deleteAccountNote': '删除后无法恢复',
  'platform.accountDeleted': '账号已删除',
  'platform.networkError': '网络错误',
  'platform.unknownError': '未知错误',
  'platform.authErrors.invalid_display_name': '显示名称需要 1-60 个字符',
  'platform.authErrors.invalid_password': '密码至少需要 8 个字符',
  'platform.authErrors.admin_required': '需要管理员权限',
  'platform.authErrors.invalid_invite_code': '邀请码格式无效',
  'platform.authErrors.invite_code_taken': '邀请码已存在',
  'platform.authErrors.invalid_invite_expiry': '邀请码到期时间无效',
  'platform.authErrors.invalid_invite_max_uses': '最大使用次数必须是正整数',
}
const translate = (key: string, params: Record<string, string | number> = {}) =>
  Object.entries(params).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    labels[key] ?? key,
  )

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    apiFetch: apiFetchMock,
    logout: logoutMock,
    logoutAll: logoutAllMock,
    oauthStartUrl: (provider: 'github' | 'google', intent: 'login' | 'register' | 'link') =>
      `/api/auth/oauth/${provider}/start?intent=${intent}`,
  }),
}))

vi.mock('../../contexts/LocaleContext', () => {
  return {
    useLocale: () => ({
      locale: 'zh',
      setLocale: vi.fn(),
      t: translate,
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
  mockUser = { id: 'u1', username: 'testuser', displayName: 'Test User', isAdmin: false }
  window.history.replaceState(null, '', '/?page=settings')
})

describe('SettingsPage', () => {
  it('uses the Open Agricola wordmark as the home link', () => {
    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, identities: [] })),
    )
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      enabled: false,
      connected: false,
    }))))

    render(<SettingsPage />)

    const link = screen.getByRole('link', { name: '返回大厅' })
    expect(link).toHaveTextContent('Open Agricola')
    expect(link).toHaveAttribute('href', import.meta.env.BASE_URL)
  })

  it('localizes profile backend error codes instead of showing raw English', async () => {
    const user = userEvent.setup()
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        code: 'invalid_display_name',
        error: 'Display name must be 1-60 characters',
      })))
    render(<SettingsPage />)

    await user.clear(screen.getByLabelText('显示名称'))
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(screen.getByText('显示名称需要 1-60 个字符')).toBeInTheDocument())
    expect(screen.queryByText('Display name must be 1-60 characters')).not.toBeInTheDocument()
  })

  it('localizes password backend error codes instead of showing raw English', async () => {
    const user = userEvent.setup()
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: false,
        code: 'invalid_password',
        error: 'Password must be at least 8 characters',
      })))
    render(<SettingsPage />)

    await user.type(screen.getByLabelText('当前密码'), 'password123')
    await user.type(screen.getByLabelText('新密码'), 'shortpass')
    await user.type(screen.getByLabelText('确认新密码'), 'shortpass')
    await user.click(screen.getByRole('button', { name: '修改密码' }))

    await waitFor(() => expect(screen.getByText('密码至少需要 8 个字符')).toBeInTheDocument())
    expect(screen.queryByText('Password must be at least 8 characters')).not.toBeInTheDocument()
  })

  it('deletes the account after danger-zone confirmation', async () => {
    const user = userEvent.setup()
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
    render(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: '删除账号' }))
    expect(screen.getByText('确认删除账号')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认' }))

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/api/auth/account', expect.objectContaining({ method: 'DELETE' }))
    })
    expect(logoutMock).toHaveBeenCalled()
  })

  it('shows and disconnects the separate Issue submission connection', async () => {
    const user = userEvent.setup()
    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, identities: [] })),
    )
    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) =>
      init?.method === 'DELETE'
        ? new Response(JSON.stringify({ ok: true }))
        : new Response(JSON.stringify({
            ok: true,
            enabled: true,
            connected: true,
            githubUserId: '12345',
          })))
    vi.stubGlobal('fetch', fetchMock)

    render(<SettingsPage />)

    expect(await screen.findByText('已连接 Issue 提交身份')).toBeInTheDocument()
    expect(screen.getByText('GitHub ID 12345')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '断开 Issue 提交连接' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/issue-submission-connection',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    ))
    expect(await screen.findByText('尚未连接')).toBeInTheDocument()
    expect(screen.getByText('Issue 提交连接已移除。')).toBeInTheDocument()
  })

  it('hides invite admin tools from non-admin users', async () => {
    mockUser = { id: 'u1', username: 'testuser', displayName: 'Test User', isAdmin: false }
    apiFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))

    render(<SettingsPage />)

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/auth/identities'))
    expect(screen.queryByText('邀请注册')).not.toBeInTheDocument()
    expect(apiFetchMock.mock.calls.some(([url]) => url === '/api/admin/invites')).toBe(false)
  })

  it('shows a network error when the initial invite list load fails', async () => {
    mockUser = { id: 'admin1', username: 'admin', displayName: 'Admin', isAdmin: true }
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockRejectedValueOnce(new Error('offline'))

    render(<SettingsPage />)

    await waitFor(() => expect(screen.getByText('网络错误')).toBeInTheDocument())
  })

  it('lets admin generate an invite and displays the returned plaintext once', async () => {
    const user = userEvent.setup()
    mockUser = { id: 'admin1', username: 'admin', displayName: 'Admin', isAdmin: true }
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, invites: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invite: { id: 'inv1', code: 'oa_secret', createdAt: 1000, expiresAt: 2000, useCount: 0, maxUses: 1 },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invites: [{ id: 'inv1', createdAt: 1000, expiresAt: 2000, usedAt: null, usedBy: null, revokedAt: null, useCount: 0, maxUses: 1, status: 'active' }],
      })))

    render(<SettingsPage />)
    await screen.findByText('邀请注册')
    await user.click(screen.getByRole('button', { name: '创建邀请码' }))

    const generatedCode = await screen.findByText('oa_secret')
    expect(generatedCode).toHaveClass('settings-generated-invite-code')
    expect(screen.getByText('请立即复制，之后不会再次显示明文。')).toBeInTheDocument()
    expect(apiFetchMock).toHaveBeenCalledWith('/api/admin/invites', expect.objectContaining({ method: 'POST' }))
  })

  it('keeps plaintext invite codes sourced from create responses only', async () => {
    const user = userEvent.setup()
    mockUser = { id: 'admin1', username: 'admin', displayName: 'Admin', isAdmin: true }
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, invites: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invite: { id: 'inv1', code: 'oa_secret', createdAt: 1000, expiresAt: 2000, useCount: 0, maxUses: 1 },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invites: [{ id: 'inv1', createdAt: 1000, expiresAt: 2000, usedAt: null, usedBy: null, revokedAt: null, useCount: 0, maxUses: 1, status: 'active' }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invites: [{ id: 'inv1', createdAt: 1000, expiresAt: 2000, usedAt: null, usedBy: null, revokedAt: null, useCount: 0, maxUses: 1, status: 'active' }],
      })))

    const { unmount } = render(<SettingsPage />)
    await screen.findByText('邀请注册')
    await user.click(screen.getByRole('button', { name: '创建邀请码' }))

    await waitFor(() => expect(screen.getByText('oa_secret')).toBeInTheDocument())
    unmount()

    render(<SettingsPage />)
    await screen.findByText('邀请注册')
    await waitFor(() => expect(screen.queryByText('oa_secret')).not.toBeInTheDocument())
    expect(screen.getByText('可用')).toBeInTheDocument()
  })

  it('lets admin revoke an active invite', async () => {
    const user = userEvent.setup()
    mockUser = { id: 'admin1', username: 'admin', displayName: 'Admin', isAdmin: true }
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invites: [{ id: 'inv1', createdAt: 1000, expiresAt: 2000, usedAt: null, usedBy: null, revokedAt: null, useCount: 0, maxUses: 1, status: 'active' }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invites: [{ id: 'inv1', createdAt: 1000, expiresAt: 2000, usedAt: null, usedBy: null, revokedAt: 1500, useCount: 0, maxUses: 1, status: 'revoked' }],
      })))

    render(<SettingsPage />)
    await screen.findByText('可用')
    await user.click(screen.getByRole('button', { name: '撤销' }))

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/api/admin/invites/inv1/revoke', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => expect(screen.getByText('已撤销')).toBeInTheDocument())
  })

  it('submits a custom reusable invite with the exact expiration', async () => {
    const user = userEvent.setup()
    mockUser = { id: 'admin1', username: 'admin', displayName: 'Admin', isAdmin: true }
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, invites: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invite: { id: 'inv1', code: 'FAMILY', createdAt: 1, expiresAt: 2, useCount: 0, maxUses: 4 },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, invites: [] })))

    render(<SettingsPage />)
    await screen.findByText('邀请注册')
    await user.type(screen.getByLabelText('邀请码'), 'FAMILY')
    fireEvent.change(screen.getByLabelText('最大使用次数'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('到期时间'), { target: { value: '2026-07-25T12:30' } })
    await user.click(screen.getByRole('button', { name: '创建邀请码' }))

    const createCall = apiFetchMock.mock.calls.find(([url, init]) =>
      url === '/api/admin/invites' && init?.method === 'POST')
    const payload = JSON.parse(String(createCall?.[1]?.body))
    expect(payload).toEqual({
      code: 'FAMILY',
      expiresAt: new Date('2026-07-25T12:30').getTime(),
      maxUses: 4,
    })
  })

  it('keeps valid days and expiration time synchronized', async () => {
    const now = new Date('2026-07-21T00:00:00Z').getTime()
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(now)
    mockUser = { id: 'admin1', username: 'admin', displayName: 'Admin', isAdmin: true }
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, invites: [] })))

    try {
      render(<SettingsPage />)
      await screen.findByText('邀请注册')
      const days = screen.getByLabelText('有效天数')
      const expiration = screen.getByLabelText('到期时间') as HTMLInputElement

      fireEvent.change(days, { target: { value: '2' } })
      expect(new Date(expiration.value).getTime()).toBe(now + 2 * 86_400_000)

      const target = now + 3.5 * 86_400_000
      const targetDate = new Date(target)
      const localValue = new Date(target - targetDate.getTimezoneOffset() * 60_000)
        .toISOString().slice(0, 16)
      fireEvent.change(expiration, { target: { value: localValue } })
      expect(days).toHaveValue(4)
    } finally {
      nowSpy.mockRestore()
    }
  })

  it('shows invite usage and revokes a partially used active invite', async () => {
    const user = userEvent.setup()
    mockUser = { id: 'admin1', username: 'admin', displayName: 'Admin', isAdmin: true }
    const active = {
      id: 'inv1', createdAt: 1000, expiresAt: Date.now() + 86_400_000,
      usedAt: 1500, usedBy: 'u2', revokedAt: null,
      useCount: 2, maxUses: 4, status: 'active',
    }
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, invites: [active] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true, invites: [{ ...active, revokedAt: Date.now(), status: 'revoked' }],
      })))

    render(<SettingsPage />)
    const usage = await screen.findByText('已使用 2 / 4')
    expect(usage.closest('p')).toHaveClass('settings-invite-row')
    await user.click(screen.getByRole('button', { name: '撤销' }))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/admin/invites/inv1/revoke',
      expect.objectContaining({ method: 'POST' }),
    ))
    await screen.findByText('已撤销')
  })
})
