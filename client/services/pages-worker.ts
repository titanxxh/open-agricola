import { WORKER_CAPABILITY_MESSAGE, type WorkerCapability } from '../service-worker/capabilities'

const capabilityTimeoutMs = 1_500

function queryCapability(worker: ServiceWorker, capability: WorkerCapability): Promise<boolean> {
  return new Promise(resolve => {
    const channel = new MessageChannel()
    const finish = (supported: boolean) => {
      clearTimeout(timeout)
      channel.port1.close()
      resolve(supported)
    }
    const timeout = setTimeout(() => finish(false), capabilityTimeoutMs)
    channel.port1.onmessage = event => finish(event.data === true)
    try {
      worker.postMessage({ type: WORKER_CAPABILITY_MESSAGE, capability }, [channel.port2])
    } catch {
      channel.port2.close()
      finish(false)
    }
  })
}

export async function findPagesWorkerRegistration(capability: WorkerCapability | 'retireSubscription'): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const { serviceWorker } = navigator
  const registration = await serviceWorker.getRegistration('/')
  const worker = registration?.active
  const expectedUrl = new URL('/sw.js', window.location.origin).href
  if (!registration || worker?.scriptURL !== expectedUrl) return null
  if (capability === 'retireSubscription') return registration
  if (worker.state !== 'activated' || typeof MessageChannel === 'undefined' || !await queryCapability(worker, capability)) return null
  // A replacement can activate while the previous Worker is answering.
  const controller = serviceWorker.controller
  return registration.active === worker && (!controller || controller === worker) ? registration : null
}

export function onPagesWorkerChange(refresh: () => void): () => void {
  if (!('serviceWorker' in navigator)) return () => {}
  const { serviceWorker } = navigator
  let registration: ServiceWorkerRegistration | undefined
  let observed: ServiceWorker | null | undefined
  let disposed = false
  const stateChanged = () => { if (observed?.state === 'activated') refresh() }
  const observeUpdate = () => {
    observed?.removeEventListener('statechange', stateChanged)
    observed = registration?.installing ?? registration?.waiting ?? registration?.active
    observed?.addEventListener('statechange', stateChanged)
  }

  serviceWorker.addEventListener('controllerchange', refresh)
  void serviceWorker.ready.then(ready => {
    if (disposed) return
    registration = ready
    registration.addEventListener('updatefound', observeUpdate)
    observeUpdate()
    refresh()
  }).catch(() => undefined)

  return () => {
    disposed = true
    serviceWorker.removeEventListener('controllerchange', refresh)
    registration?.removeEventListener('updatefound', observeUpdate)
    observed?.removeEventListener('statechange', stateChanged)
  }
}
