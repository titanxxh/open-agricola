import { useEffect, useState } from 'react'
import { parseWebPushClick, WEB_PUSH_CLICK_MESSAGE, type WebPushClick } from '../../shared/contract/web-push'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { openInboxNotification } from '../services/inbox-notification'
import { drainWebPushUnbinds, resolveWebPushClick, webPushEnabledBuild } from '../services/web-push'

const localRoom = () => {
  const params = new URLSearchParams(window.location.search)
  const page = params.get('page')
  if ((page && page !== 'game') || params.has('perspective')) return null
  return params.get('context') ?? params.get('room')
}

function launchClick(): WebPushClick | null {
  const query = new URLSearchParams(window.location.search)
  return parseWebPushClick({ kind: query.get('pushKind'), deliveryId: query.get('push') })
}

function finishLaunch(roomId?: string) {
  const url = new URL(window.location.href)
  url.searchParams.delete('push')
  url.searchParams.delete('pushKind')
  if (roomId) url.searchParams.set('context', roomId)
  window.history.replaceState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function WebPushClickRouter() {
  return webPushEnabledBuild ? <EnabledWebPushClickRouter /> : null
}

function EnabledWebPushClickRouter() {
  const { user, loading } = useAuth()
  const { t } = useLocale()
  const [unavailable, setUnavailable] = useState(false)
  const accountId = user?.id ?? null

  useEffect(() => {
    const retry = () => { void drainWebPushUnbinds() }
    retry()
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [])

  useEffect(() => {
    if (loading) return
    const current = new AbortController()
    const target = async (click: WebPushClick, userId: string, timeout: number) => resolveWebPushClick(
      click, userId, AbortSignal.any([current.signal, AbortSignal.timeout(timeout)]),
    ).catch(() => ({ kind: 'unavailable' } as const))

    const onMessage = (event: MessageEvent<unknown>) => {
      if (!accountId || !event.data || typeof event.data !== 'object' || !('type' in event.data)
        || event.data.type !== WEB_PUSH_CLICK_MESSAGE || !event.ports[0]) return
      const click = parseWebPushClick(event.data)
      if (!click) return
      const port = event.ports[0]
      const probe = click.kind === 'bug-report-inbox' && 'probe' in event.data && event.data.probe === true
      const activeRoom = localRoom()
      if (click.kind !== 'bug-report-inbox' && !activeRoom) { port.postMessage(false); port.close(); return }
      void target(click, accountId, 1_500).then(result => {
        if (current.signal.aborted) { port.postMessage(false); return }
        if (click.kind !== 'bug-report-inbox') {
          port.postMessage('roomId' in result && result.roomId === activeRoom && localRoom() === activeRoom)
        } else if (probe) {
          port.postMessage(result.kind === 'bug-report-inbox' ? 'exact' : 'generic')
        } else {
          openInboxNotification({ userId: accountId, messageId: result.kind === 'bug-report-inbox' ? result.messageId : null })
          port.postMessage(true)
        }
      }).finally(() => port.close())
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)

    const click = launchClick()
    if (click) {
      const resolution = accountId ? target(click, accountId, 10_000) : Promise.resolve({ kind: 'unavailable' as const })
      void resolution.then(result => {
        if (current.signal.aborted) return
        if ('roomId' in result) finishLaunch(result.roomId)
        else {
          finishLaunch()
          if (click.kind === 'bug-report-inbox' && accountId) {
            openInboxNotification({ userId: accountId, messageId: result.kind === 'bug-report-inbox' ? result.messageId : null })
          } else {
            setUnavailable(true)
          }
        }
      })
    }

    return () => { current.abort(); navigator.serviceWorker?.removeEventListener('message', onMessage) }
  }, [accountId, loading])

  return unavailable && <p role="status" className="web-push-notice">{t('webPush.notificationUnavailable')}</p>
}
