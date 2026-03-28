import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { setPage } from './PageRouter'

export function SettingsPage() {
  const { user, apiFetch, logout } = useAuth()
  const [displayName, setDisplayName] = useState(user?.displayName ?? '')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    setNameMsg(null)
    setSaving(true)
    try {
      const resp = await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      })
      const d = await resp.json()
      setNameMsg(d.ok ? { ok: true, text: '已保存' } : { ok: false, text: d.error ?? '保存失败' })
    } catch {
      setNameMsg({ ok: false, text: '网络错误' })
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwMsg(null)
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: '两次输入的密码不一致' })
      return
    }
    setSaving(true)
    try {
      const resp = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword }),
      })
      const d = await resp.json()
      if (d.ok) {
        setPwMsg({ ok: true, text: '密码已修改，请重新登录' })
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setTimeout(() => { logout() }, 1500)
      } else {
        setPwMsg({ ok: false, text: d.error ?? '修改失败' })
      }
    } catch {
      setPwMsg({ ok: false, text: '网络错误' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button type="button" className="btn-link" onClick={() => setPage('lobby')}>← 返回大厅</button>
        <h1>账户设置</h1>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h2>基本信息</h2>
          <p className="settings-username">用户名：<strong>{user?.username}</strong>（不可修改）</p>
          <form onSubmit={handleSaveName} className="settings-form">
            <div className="form-field">
              <label>显示名称</label>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="显示在游戏中的名字"
                maxLength={60}
              />
            </div>
            {nameMsg && (
              <div className={nameMsg.ok ? 'settings-success' : 'form-error'}>{nameMsg.text}</div>
            )}
            <button type="submit" className="btn-primary" disabled={saving}>保存</button>
          </form>
        </div>

        <div className="settings-section">
          <h2>修改密码</h2>
          <form onSubmit={handleChangePassword} className="settings-form">
            <div className="form-field">
              <label>当前密码</label>
              <input
                type="password"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div className="form-field">
              <label>新密码</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="至少 4 个字符"
                required
              />
            </div>
            <div className="form-field">
              <label>确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>
            {pwMsg && (
              <div className={pwMsg.ok ? 'settings-success' : 'form-error'}>{pwMsg.text}</div>
            )}
            <button type="submit" className="btn-primary" disabled={saving}>修改密码</button>
          </form>
        </div>

        <div className="settings-section settings-danger">
          <h2>其他</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { logout(); setPage('lobby') }}
          >
            登出所有设备（清除 session）
          </button>
          <p className="settings-note">
            注意：登出后需要重新登录。Token 仅存储在当前浏览器，这里的登出只清除本地 session。
          </p>
        </div>
      </div>
    </div>
  )
}
