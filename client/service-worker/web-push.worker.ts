/// <reference lib="webworker" />

import { parseWebPushClick, WEB_PUSH_CLICK_MESSAGE, type WebPushClick } from '../../shared/contract/web-push'

const acceptsClick = (client: WindowClient, click: WebPushClick, probe = false): Promise<boolean> => new Promise(resolve => {
  const channel = new MessageChannel()
  const complete = (handled: boolean) => {
    clearTimeout(timer)
    channel.port1.close()
    resolve(handled)
  }
  const timer = setTimeout(() => complete(false), probe ? 650 : 2_000)
  channel.port1.onmessage = event => complete(event.data === true)
  try {
    client.postMessage({ ...click, probe, type: WEB_PUSH_CLICK_MESSAGE }, [channel.port2])
  } catch { complete(false) }
})

async function clickNotification(scope: ServiceWorkerGlobalScope, click: WebPushClick): Promise<void> {
  const candidates = (await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })).filter(client => {
    const url = new URL(client.url)
    return (client.frameType === 'top-level' || client.frameType === 'auxiliary')
      && url.origin === scope.location.origin && (url.pathname === '/' || url.pathname === '/index.html')
  })
  if (click.kind === 'draft') {
    const actions = await Promise.all(candidates.map(async client => await acceptsClick(client, click) ? client : null))
    const existing = actions.find(client => client !== null)
    if (existing && await existing.focus().catch(() => null)) return
  } else {
    const ready = await Promise.all(candidates.map(async client => await acceptsClick(client, click, true) ? client : null))
    const existing = ready.find(client => client !== null)
    if (existing && await acceptsClick(existing, click)) {
      await existing.focus().catch(() => null)
      return
    }
  }
  const url = new URL('/', scope.location.origin)
  url.searchParams.set('push', click.deliveryId)
  url.searchParams.set('pushKind', click.kind)
  await scope.clients.openWindow(url.href)
}

export function installWebPush(scope: ServiceWorkerGlobalScope): void {
  scope.addEventListener('push', event => {
    let data: unknown
    try { data = event.data?.json() } catch { /* The browser requires a visible notification. */ }
    const click = parseWebPushClick(data)
    const title = click && data && typeof data === 'object' && 'title' in data
      && typeof data.title === 'string' && data.title.length > 0 && data.title.length <= 120 ? data.title : 'Open Agricola'
    event.waitUntil(scope.registration.showNotification(title, click
      ? { data: click, tag: click.deliveryId }
      : {}))
  })
  scope.addEventListener('notificationclick', event => {
    event.notification.close()
    const click = parseWebPushClick(event.notification.data)
    if (click) event.waitUntil(clickNotification(scope, click))
  })
}
