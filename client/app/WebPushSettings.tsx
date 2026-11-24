import { useEffect, useRef, useState } from 'react'
import { WEB_PUSH_KINDS, type WebPushKind } from '../../shared/contract/web-push'
import { Section } from '../components/common/Section'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { findPagesWorkerRegistration, onPagesWorkerChange } from '../services/pages-worker'
import { getAccountPushDeviceCount, findWebPushRegistration, getWebPushStatus, setWebPushPreference, webPushEnabledBuild, type WebPushStatus } from '../services/web-push'

const settingsText: Record<WebPushKind, string> = { turn: 'webPush.turn', draft: 'webPush.draft', 'bug-report-inbox': 'webPush.inbox' }

const iosNeedsHomeScreen = () => (/(iPhone|iPad|iPod)/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
  && !window.matchMedia('(display-mode: standalone)').matches

export function WebPushSettings() {
  const { user } = useAuth()
  return webPushEnabledBuild && user ? <AccountWebPushSettings key={user.id} userId={user.id} /> : null
}

function AccountWebPushSettings({ userId }: { userId: string }) {
  const { locale, t } = useLocale()
  const [device, setDevice] = useState<{ registration: ServiceWorkerRegistration; status: WebPushStatus; turnSupported: boolean } | null>(null)
  const [accountCount, setAccountCount] = useState<number | null>(null)
  const request = useRef(0)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(false)
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default')
  const installIos = iosNeedsHomeScreen()

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const requestId = ++request.current
      const current = () => !cancelled && request.current === requestId
      try {
        const registration = installIos ? null : await findWebPushRegistration().catch(() => null)
        if (!current()) return
        const status = registration && await getWebPushStatus(registration, userId).catch(() => null)
        if (!current()) return
        if (registration && status) {
          const turnSupported = !!await findPagesWorkerRegistration('turnPush').catch(() => null)
          if (current()) { setDevice({ registration, status, turnSupported }); setFailure(false) }
        } else {
          setDevice(null)
          const count = await getAccountPushDeviceCount(userId)
          if (current()) { setAccountCount(count); setFailure(registration !== null) }
        }
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
    const stopWatching = onPagesWorkerChange(refresh)
    return () => {
      cancelled = true
      stopWatching()
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [installIos, userId])

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

  const count = device?.status.deviceCount ?? accountCount
  return <Section title={t('webPush.title')} variant="parchment">
    {count !== null && <p>{t('webPush.deviceCount', { count })}</p>}
    {installIos ? <p>{t('webPush.installIos')}</p> : !device && ready && !failure ? <p>{t('webPush.unavailable')}</p> : null}
    {device && <>
      <p>{t('webPush.deviceOnly')}</p>
      {permission === 'denied' && <p>{t('webPush.blocked')}</p>}
      {WEB_PUSH_KINDS.map(kind => {
        if (kind === 'turn' && !device.turnSupported && !device.status.preferences.turn) return null
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
