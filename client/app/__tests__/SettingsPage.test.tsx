// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../SettingsPage'

const apiFetchMock = vi.fn()
const logoutMock = vi.fn()
const logoutAllMock = vi.fn()
let mockUser = { id: 'u1', username: 'testuser', displayName: 'Test User', isAdmin: false }
const labels: Record<string, string> = {
  'platform.backToLobby': '返回大厅',
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
  'platform.generateInvite': '生成邀请码',
  'platform.inviteExpiresInDays': '有效天数',
  'platform.generatedInvite': '新邀请码',
  'platform.inviteShownOnce': '请立即复制，之后不会再次显示明文。',
  'platform.revokeInvite': '撤销',
  'platform.noInvites': '暂无邀请码',
  'platform.inviteStatus.active': '可用',
  'platform.inviteStatus.used': '已使用',
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
}
const translate = (key: string) => labels[key] ?? key

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
  mockUser = { id: 'u1', username: 'testuser', displayName: 'Test User', isAdmin: false }
  window.history.replaceState(null, '', '/?page=settings')
})

describe('SettingsPage', () => {
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

  it('hides invite admin tools from non-admin users', async () => {
    mockUser = { id: 'u1', username: 'testuser', displayName: 'Test User', isAdmin: false }
    apiFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))

    render(<SettingsPage />)

    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/auth/identities'))
    expect(screen.queryByText('邀请注册')).not.toBeInTheDocument()
  })

  it('lets admin generate an invite and displays the returned plaintext once', async () => {
    const user = userEvent.setup()
    mockUser = { id: 'admin1', username: 'admin', displayName: 'Admin', isAdmin: true }
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, invites: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invite: { id: 'inv1', code: 'oa_secret', createdAt: 1000, expiresAt: 2000 },
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invites: [{ id: 'inv1', createdAt: 1000, expiresAt: 2000, usedAt: null, usedBy: null, revokedAt: null, status: 'active' }],
      })))

    render(<SettingsPage />)
    await screen.findByText('邀请注册')
    await user.click(screen.getByRole('button', { name: '生成邀请码' }))

    await waitFor(() => expect(screen.getByText('oa_secret')).toBeInTheDocument())
    expect(screen.getByText('请立即复制，之后不会再次显示明文。')).toBeInTheDocument()
    expect(apiFetchMock).toHaveBeenCalledWith('/api/admin/invites', expect.objectContaining({ method: 'POST' }))
  })

  it('lets admin revoke an active invite', async () => {
    const user = userEvent.setup()
    mockUser = { id: 'admin1', username: 'admin', displayName: 'Admin', isAdmin: true }
    apiFetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, identities: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invites: [{ id: 'inv1', createdAt: 1000, expiresAt: 2000, usedAt: null, usedBy: null, revokedAt: null, status: 'active' }],
      })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        invites: [{ id: 'inv1', createdAt: 1000, expiresAt: 2000, usedAt: null, usedBy: null, revokedAt: 1500, status: 'revoked' }],
      })))

    render(<SettingsPage />)
    await screen.findByText('可用')
    await user.click(screen.getByRole('button', { name: '撤销' }))

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/api/admin/invites/inv1/revoke', expect.objectContaining({ method: 'POST' }))
    })
    await waitFor(() => expect(screen.getByText('已撤销')).toBeInTheDocument())
  })
})
