/// <reference lib="webworker" />

export const WORKER_CAPABILITY_MESSAGE = 'open-agricola:worker-capability-v1'
export type WorkerCapability = 'webPush' | 'turnPush'

export function installWorkerCapabilities(scope: ServiceWorkerGlobalScope) {
  scope.addEventListener('message', event => {
    const data: unknown = event.data
    if (!data || typeof data !== 'object' || !('type' in data) || data.type !== WORKER_CAPABILITY_MESSAGE
      || !('capability' in data)) return
    event.ports[0]?.postMessage(data.capability === 'webPush' || data.capability === 'turnPush')
  })
}
