/// <reference lib="webworker" />

import { parseWebPushClick, WEB_PUSH_CLICK_MESSAGE, type WebPushClick } from '../../shared/contract/web-push'

type ClickReply = 'handled' | 'exact' | 'generic' | 'none'

const askWindow = (client: WindowClient, click: WebPushClick, probe = false): Promise<ClickReply> => new Promise(resolve => {
  const channel = new MessageChannel()
  const complete = (result: ClickReply) => {
    clearTimeout(timer)
    channel.port1.close()
    resolve(result)
  }
  const timer = setTimeout(() => complete('none'), 2_000)
  channel.port1.onmessage = event => {
    const result: unknown = event.data
    complete(result === true ? 'handled' : result === 'exact' || result === 'generic' ? result : 'none')
  }
  try {
    client.postMessage({ ...click, probe, type: WEB_PUSH_CLICK_MESSAGE }, [channel.port2])
  } catch { complete('none') }
})

async function clickNotification(scope: ServiceWorkerGlobalScope, click: WebPushClick): Promise<void> {
  const candidates = (await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(client => {
    const url = new URL(client.url)
    return (client.frameType === 'top-level' || client.frameType === 'auxiliary')
      && url.origin === scope.location.origin && (url.pathname === '/' || url.pathname === '/index.html')
  })
  if (click.kind === 'draft') {
    const actions = await Promise.all(candidates.map(async client => await askWindow(client, click) === 'handled' ? client : null))
    const existing = actions.find(client => client !== null)
    if (existing && await existing.focus().catch(() => null)) return
  } else {
    const ready = await Promise.all(candidates.map(async client => ({ client, result: await askWindow(client, click, true) })))
    const existing = ready.find(reply => reply.result === 'exact') ?? ready.find(reply => reply.result === 'generic')
    if (existing) {
      if (await askWindow(existing.client, click) === 'handled') await existing.client.focus().catch(() => null)
      return
    }
  }
  const url = new URL('/', scope.location.origin)
  url.searchParams.set('push', click.deliveryId)
  url.searchParams.set('pushKind', click.kind)
  await scope.clients.openWindow(url.href)
}

/** Build-time presentation: the site's brand icon as a site-relative URL. */
export type WebPushPresentation = { icon: string }

const NOTIFICATION_TITLE = 'Open Agricola'

export function installWebPush(scope: ServiceWorkerGlobalScope, presentation: WebPushPresentation): void {
  scope.addEventListener('push', event => {
    let data: unknown
    try { data = event.data?.json() } catch { /* The browser requires a visible notification. */ }
    const click = parseWebPushClick(data)
    // The payload's localized line becomes the body under the site name; see WebPushPayload.title.
    const body = click && data && typeof data === 'object' && 'title' in data
      && typeof data.title === 'string' && data.title.length > 0 && data.title.length <= 120 ? data.title : undefined
    event.waitUntil(scope.registration.showNotification(NOTIFICATION_TITLE, {
      icon: presentation.icon,
      ...click ? { body, data: click, tag: click.deliveryId } : {},
    }))
  })
  scope.addEventListener('notificationclick', event => {
    event.notification.close()
    const click = parseWebPushClick(event.notification.data)
    if (click) event.waitUntil(clickNotification(scope, click))
  })
}
