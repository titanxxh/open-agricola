import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import {
  DEFAULT_ROOM_RETENTION_DAYS,
  MAX_ROOM_RETENTION_DAYS,
  MIN_ROOM_RETENTION_DAYS,
  parseRoomRetentionPolicy,
  parseRoomRetentionUpdate,
  type RoomRetentionPolicy,
} from '../../shared/contract/room-retention'

type Message = 'saved' | 'conflict' | 'range' | 'unavailable'

const readPolicy = (body: unknown) => {
  if (!body || typeof body !== 'object' || !('policy' in body)) throw new Error('Missing retention policy')
  return parseRoomRetentionPolicy(body.policy)
}

export function RoomRetentionSettings() {
  const { apiFetch } = useAuth()
  const { t, locale } = useLocale()
  const [policy, setPolicy] = useState<RoomRetentionPolicy | null>(null)
  const [waiting, setWaiting] = useState('')
  const [playing, setPlaying] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<Message | null>(null)
  const [reload, setReload] = useState(0)

  const acceptPolicy = useCallback((current: RoomRetentionPolicy) => {
    setPolicy(current)
    setWaiting(String(current.waitingDays))
    setPlaying(String(current.playingDays))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    void (async () => {
      try {
        const response = await apiFetch('/api/admin/retention-policy', { signal: controller.signal })
        if (!response.ok) throw new Error('Retention policy unavailable')
        const body: unknown = await response.json()
        if (active) acceptPolicy(readPolicy(body))
      } catch {
        if (active) setMessage('unavailable')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false; controller.abort() }
  }, [apiFetch, acceptPolicy, reload])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (!policy || loading || saving || message === 'conflict') return
    let update
    try {
      update = parseRoomRetentionUpdate({ expectedRevision: policy.revision, waitingDays: Number(waiting), playingDays: Number(playing) })
    } catch {
      setMessage('range')
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const response = await apiFetch('/api/admin/retention-policy', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(update),
      })
      if (response.status === 409) { setMessage('conflict'); return }
      if (!response.ok) throw new Error('Retention policy update failed')
      const body: unknown = await response.json()
      acceptPolicy(readPolicy(body))
      setMessage('saved')
    } catch {
      setMessage('unavailable')
    } finally { setSaving(false) }
  }

  const range = { min: MIN_ROOM_RETENTION_DAYS, max: MAX_ROOM_RETENTION_DAYS }
  return <section className="room-retention-settings" aria-labelledby="room-retention-title" aria-busy={loading || saving}>
    <h2 id="room-retention-title">{t('platform.retention.title')}</h2>
    <p>{t('platform.retention.description')}</p>
    <p id="room-retention-scope">{t('platform.retention.scope')}</p>
    <p>{t('platform.retention.defaults', DEFAULT_ROOM_RETENTION_DAYS)}</p>
    {loading ? <p role="status">{t('platform.loading')}</p> : <form onSubmit={save} aria-label={t('platform.retention.title')} aria-describedby="room-retention-scope">
      <fieldset disabled={!policy || saving}>
        <div className="room-retention-fields">
          <label htmlFor="retention-waiting-days">{t('platform.retention.waitingDays')}
            <input id="retention-waiting-days" type="number" inputMode="numeric" min={range.min} max={range.max} step={1} required
              value={waiting} onChange={event => setWaiting(event.target.value)} />
          </label>
          <label htmlFor="retention-playing-days">{t('platform.retention.playingDays')}
            <input id="retention-playing-days" type="number" inputMode="numeric" min={range.min} max={range.max} step={1} required
              value={playing} onChange={event => setPlaying(event.target.value)} />
          </label>
        </div>
        <p>{t('platform.retention.range', range)}</p>
        <button className="btn btn-primary" type="submit" disabled={message === 'conflict'}>{t('platform.retention.save')}</button>
      </fieldset>
    </form>}
    {policy && <p className="room-retention-updated">{policy.updatedAt === null
      ? t('platform.retention.defaultSettings')
      : policy.updatedBy === null
        ? t('platform.retention.updatedWithoutActor', { time: new Date(policy.updatedAt).toLocaleString(locale) })
        : t('platform.retention.updated', { name: policy.updatedBy, time: new Date(policy.updatedAt).toLocaleString(locale) })}</p>}
    {message && <p role={message === 'saved' ? 'status' : 'alert'}>{t(`platform.retention.${message}`, range)}</p>}
    {!loading && (message === 'conflict' || message === 'unavailable') && <button className="btn" type="button" disabled={saving}
      onClick={() => { setLoading(true); setMessage(null); setReload(value => value + 1) }}>{t('platform.retention.reload')}</button>}
  </section>
}
