import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = mode === 'login'
        ? await login(username, password)
        : await register(username, password, displayName || undefined)
      if (!result.ok) {
        setError(result.error || 'Unknown error')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Open Agricola</h1>
        <p className="login-subtitle">
          {mode === 'login' ? '登录以继续' : '创建新账户'}
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="2-30 字符"
              autoComplete="username"
              required
            />
          </div>

          {mode === 'register' && (
            <div className="form-field">
              <label htmlFor="displayName">显示名称（可选）</label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="留空则使用用户名"
              />
            </div>
          )}

          <div className="form-field">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="至少 4 个字符"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>

          {error && <div className="form-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '...' : mode === 'login' ? '登录' : '注册'}
          </button>
        </form>

        <div className="login-switch">
          {mode === 'login' ? (
            <span>
              没有账户？
              <button type="button" className="btn-link" onClick={() => { setMode('register'); setError('') }}>
                注册
              </button>
            </span>
          ) : (
            <span>
              已有账户？
              <button type="button" className="btn-link" onClick={() => { setMode('login'); setError('') }}>
                登录
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
