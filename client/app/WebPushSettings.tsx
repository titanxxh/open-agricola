import { useEffect, useRef, useState } from 'react'
import { WEB_PUSH_KINDS, type WebPushKind } from '../../shared/contract/web-push'
import { Section } from '../components/common/Section'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { findWebPushRegistration, getWebPushStatus, setWebPushPreference, webPushEnabledBuild, type WebPushStatus } from '../services/web-push'

const settingsText: Record<WebPushKind, string> = { draft: 'webPush.draft', 'bug-report-inbox': 'webPush.inbox' }

const iosNeedsHomeScreen = () => (/(iPhone|iPad|iPod)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  && !window.matchMedia('(display-mode: standalone)').matches

export function WebPushSettings() {
  const { user } = useAuth()
  return webPushEnabledBuild && user ? <AccountWebPushSettings key={user.id} userId={user.id} /> : null
}

function AccountWebPushSettings({ userId }: { userId: string }) {
  const { locale, t } = useLocale()
  const [device, setDevice] = useState<{ registration: ServiceWorkerRegistration; status: WebPushStatus } | null>(null)
  const request = useRef(0)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(false)
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default')
  const installIos = iosNeedsHomeScreen()

  useEffect(() => {
    if (installIos) return
    let cancelled = false
    const load = async () => {
      const requestId = ++request.current
      const current = () => !cancelled && request.current === requestId
      try {
        const registration = await findWebPushRegistration()
        if (!current()) return
        if (!registration) { setReady(true); return }
        const status = await getWebPushStatus(registration, userId)
        if (current()) { setDevice({ registration, status }); setFailure(false) }
      } catch { if (current()) setFailure(true) }
      finally { if (current()) setReady(true) }
    }
    void load()
    const refresh = () => {
      setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default')
      void load()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    // First installation may finish shortly after app bootstrap.
    navigator.serviceWorker?.ready.then(() => { if (!cancelled) void load() }).catch(() => {})
    return () => {
      cancelled = true
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [installIos, userId])

  if (!installIos && device && !device.status.publicKey
    && !device.status.preferences.draft && !device.status.preferences['bug-report-inbox']) return null

  const update = async (kind: WebPushKind, enabled: boolean) => {
    if (!device) return
    request.current++
    setBusy(true)
    setFailure(false)
    try {
      const status = await setWebPushPreference({
        registration: device.registration, userId, key: device.status.publicKey ?? '', kind, enabled, locale,
      })
      request.current++
      setDevice({ ...device, status })
    } catch {
      setFailure(true)
    } finally {
      setPermission(Notification.permission)
      setBusy(false)
    }
  }

  return <Section title={t('webPush.title')} variant="parchment">
    {installIos ? <p>{t('webPush.installIos')}</p> : !device && ready && !failure ? <p>{t('webPush.unavailable')}</p> : null}
    {device && <>
      <p>{t('webPush.deviceOnly')}</p>
      {permission === 'denied' && <p>{t('webPush.blocked')}</p>}
      {WEB_PUSH_KINDS.map(kind => {
        const enabled = device.status.preferences[kind]
        return <p key={kind}><label>
          <input type="checkbox" checked={enabled}
            disabled={busy || (!enabled && (!device.status.allowed[kind] || permission === 'denied'))}
            onChange={event => { void update(kind, event.target.checked) }} />
          {' '}{t(settingsText[kind])}
        </label></p>
      })}
    </>}
    {failure && permission !== 'denied' && <p role="alert">{t('webPush.failed')}</p>}
  </Section>
}
