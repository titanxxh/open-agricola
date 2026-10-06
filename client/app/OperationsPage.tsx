import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { API_BASE } from '../config'
import { setPage } from '../utils/platform-page-url'
import './OperationsPage.css'

type Overview = { reasons: string[]; components: Record<string, string>; level: string; values: Record<string, number | null>; lastSample: number | null; refreshSeconds: number; retentionDays: number }
export function OperationsPage() {
  const { user, apiFetch } = useAuth()
  const { t } = useLocale()
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!user?.isAdmin) return
    let active = true
    const controller = new AbortController()
    const refresh = async () => {
      try {
        const response = await apiFetch('/api/admin/observability', { signal: controller.signal })
        if (!response.ok) throw new Error(t('platform.operationsUnavailable'))
        const body = await response.json() as Overview
        if (active) { setData(body); setError('') }
      } catch { if (active) { setData(previous => previous ? { ...previous, level: 'unknown', reasons: ['freshness'], values: Object.fromEntries(Object.keys(previous.values).map(key => [key, null])) } : null); setError(t('platform.operationsUnavailable')) } }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 15_000)
    return () => { active = false; controller.abort(); clearInterval(timer) }
  }, [apiFetch, t, user?.isAdmin])
  const openGrafana = async () => {
    const tab = window.open('about:blank', '_blank')
    if (tab) tab.opener = null
    try {
      const response = await apiFetch('/api/admin/observability/session', { method: 'POST' })
      if (!response.ok) throw new Error('unavailable')
      const { path } = await response.json() as { path: string }
      const target = new URL(path, API_BASE || window.location.origin)
      if (tab) tab.location.href = target.href
      else window.location.assign(target.href)
    } catch { tab?.close(); setError(t('platform.operationsUnavailable')) }
  }
  if (!user?.isAdmin) return <main className="operations-page"><p>{t('platform.operationsAdminOnly')}</p><button onClick={() => setPage('lobby')}>{t('platform.operationsBack')}</button></main>
  const labels: Record<string, string> = { instances: t('platform.operationsInstances'), onlineUsers: t('platform.operationsUsers'), playingRooms: t('platform.operationsRooms'), commandP95: t('platform.operationsLatency'), errorRate: t('platform.operationsErrors') }
  return <main className="operations-page">
    <button className="operations-back" onClick={() => setPage('settings')}>{t('platform.operationsBack')}</button>
    <h1>{t('platform.operationsTitle')}</h1>
    <p>{t('platform.operationsDescription')}</p>
    <div className={`operations-health operations-health-${data?.level ?? 'unknown'}`} role="status">{t(`platform.operationsHealth.${data?.level ?? 'unknown'}`)}</div>
    {error && <p role="alert">{error}</p>}
    {!!data?.reasons.length && <ul>{data.reasons.map(reason => <li key={reason}>{t(`platform.operationsReason.${reason}`)}</li>)}</ul>}
    {data && <p>{Object.entries(data.components).map(([component, level]) => <span key={component} style={{ marginRight: 20 }}>{t(`platform.operationsComponent.${component}`)}: {t(`platform.operationsHealth.${error ? 'unknown' : level}`)}</span>)}</p>}
    <div className="operations-cards">{Object.entries(labels).map(([key, label]) => <article key={key}><h2>{label}</h2><strong>{data?.values[key] == null ? '—' : key === 'commandP95' ? `${(data.values[key]! * 1000).toFixed(0)} ms` : key === 'errorRate' ? `${(data.values[key]! * 100).toFixed(1)}%` : data.values[key]}</strong></article>)}</div>
    <p>{data?.lastSample ? `${t('platform.operationsUpdated')}: ${new Date(data.lastSample).toLocaleTimeString()}` : t('platform.operationsNoData')}</p>
    <button className="btn btn-primary" onClick={() => { void openGrafana() }}>{t('platform.operationsGrafana')}</button>
    <p>{t('platform.operationsFootnote')}</p>
  </main>
}
