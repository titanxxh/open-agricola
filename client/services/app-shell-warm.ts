// Literal kept in sync with client/service-worker/app-shell.worker.ts; the page does not import Worker code.
const APP_SHELL_WARM_MESSAGE = 'open-agricola:app-shell-warm-v1'

type WorkerLike = Pick<ServiceWorker, 'state' | 'postMessage' | 'addEventListener' | 'removeEventListener'>

/** The newest Worker of the registration: a waiting or installing build serves this page's files on the next visit. */
async function newestWorker(registration: Pick<ServiceWorkerRegistration, 'installing' | 'waiting' | 'active'>): Promise<WorkerLike | null> {
  const installing = registration.installing
  if (installing) {
    await new Promise<void>(resolve => {
      const done = () => { if (installing.state !== 'installing') { installing.removeEventListener('statechange', done); resolve() } }
      installing.addEventListener('statechange', done)
      done()
    })
    if (installing.state === 'redundant') return registration.active
    return installing
  }
  return registration.waiting ?? registration.active
}

/**
 * Tells the Pages Worker which same-origin files this page has finished downloading. The Worker keeps the ones its
 * build lists, from the HTTP cache, so the next visit reads them locally even when this visit was not yet controlled.
 */
export async function warmAppShell(
  container: Pick<ServiceWorkerContainer, 'getRegistration'> = navigator.serviceWorker,
  entries: () => readonly { name: string }[] = () => performance.getEntriesByType('resource'),
  origin = window.location.origin,
): Promise<void> {
  const registration = await container.getRegistration('/')
  if (!registration) return
  const worker = await newestWorker(registration)
  if (!worker) return
  const urls = [...new Set(entries().map(entry => entry.name).filter(name => {
    try { const url = new URL(name); return url.origin === origin && !url.search } catch { return false }
  }))]
  worker.postMessage({ type: APP_SHELL_WARM_MESSAGE, urls })
}
