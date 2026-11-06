// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResetPasswordPage } from '../ResetPasswordPage'

type ResetResult = { ok: boolean; code?: string; error?: string }
const resetPasswordMock = vi.fn(async (_input: { token: string; password: string; confirmPassword: string }): Promise<ResetResult> => ({ ok: true }))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ resetPassword: resetPasswordMock }),
}))

vi.mock('../../contexts/LocaleContext', () => {
  const labels: Record<string, string> = {
    'platform.loginTitle': 'Open Agricola',
    'platform.backToLobbyPlain': '返回大厅',
    'platform.resetPasswordTitle': '设置新密码',
    'platform.newPassword': '新密码',
    'platform.confirmNewPassword': '确认新密码',
    'platform.passwordPlaceholder': '至少 8 个字符',
    'platform.resetPasswordSubmit': '重置密码',
    'platform.requestNewResetLink': '重新获取链接',
    'platform.loading': '加载中...',
    'platform.networkError': '网络错误',
    'platform.authErrors.password_mismatch': '两次输入的密码不一致',
    'platform.authErrors.invalid_password': '密码至少需要 8 个字符',
    'platform.authErrors.password_reset_token_invalid': '重置密码链接无效或已过期',
  }
  const t = (key: string) => labels[key] ?? key
  return { useCurrentLocale: () => 'zh', useLocale: () => ({ locale: 'zh', setLocale: vi.fn(), t }) }
})

vi.mock('../../components/common/LocaleSwitcher', () => ({ LocaleSwitcher: () => <div /> }))
vi.mock('../../components/common/WhatsNew', () => ({ WhatsNewButton: () => null }))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

async function submitPasswords(password: string, confirm = password) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('新密码'), password)
  await user.type(screen.getByLabelText('确认新密码'), confirm)
  await user.click(screen.getByRole('button', { name: '重置密码' }))
  return user
}

describe('ResetPasswordPage', () => {
  it('moves the emailed token out of the URL, keeps it across a reload and opens the lobby on success', async () => {
    window.history.replaceState(null, '', '/?page=reset-password#passwordResetToken=emailed-token')
    const first = render(<ResetPasswordPage />)
    expect(window.location.hash).toBe('')
    expect(window.location.search).toBe('?page=reset-password')
    first.unmount()

    render(<ResetPasswordPage />)
    await submitPasswords('newpassword')

    expect(resetPasswordMock).toHaveBeenCalledWith({ token: 'emailed-token', password: 'newpassword', confirmPassword: 'newpassword' })
    expect(window.location.search).toBe('')
    expect(sessionStorage.length).toBe(0)
  })

  it('checks the new password locally before calling the server', async () => {
    window.history.replaceState(null, '', '/?page=reset-password#passwordResetToken=emailed-token')
    render(<ResetPasswordPage />)

    await submitPasswords('newpassword', 'different1')
    expect(screen.getByRole('alert')).toHaveTextContent('两次输入的密码不一致')
    expect(resetPasswordMock).not.toHaveBeenCalled()
  })

  it('offers a new link when the server rejects the token', async () => {
    window.history.replaceState(null, '', '/?page=reset-password#passwordResetToken=used-token')
    resetPasswordMock.mockResolvedValueOnce({ ok: false, code: 'password_reset_token_invalid' })
    render(<ResetPasswordPage />)

    const user = await submitPasswords('newpassword')
    expect(screen.getByRole('alert')).toHaveTextContent('重置密码链接无效或已过期')
    expect(screen.queryByLabelText('新密码')).not.toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)

    await user.click(screen.getByRole('button', { name: '重新获取链接' }))
    const params = new URLSearchParams(window.location.search)
    expect(params.get('page')).toBe('login')
    expect(params.get('authMode')).toBe('forgot')
  })

  it('treats a link without a token as invalid', () => {
    window.history.replaceState(null, '', '/?page=reset-password')
    render(<ResetPasswordPage />)

    expect(screen.getByRole('alert')).toHaveTextContent('重置密码链接无效或已过期')
    expect(screen.getByRole('button', { name: '重新获取链接' })).toBeInTheDocument()
  })
})
