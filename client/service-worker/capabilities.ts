/// <reference lib="webworker" />

export const WORKER_CAPABILITY_MESSAGE = 'open-agricola:worker-capability-v1'
export type WorkerCapability = 'offlineEncyclopedia' | 'webPush'

export function installWorkerCapabilities(scope: ServiceWorkerGlobalScope, capabilities: Record<WorkerCapability, boolean>) {
  scope.addEventListener('message', event => {
    const data: unknown = event.data
    if (!data || typeof data !== 'object' || !('type' in data) || data.type !== WORKER_CAPABILITY_MESSAGE
      || !('capability' in data) || (data.capability !== 'offlineEncyclopedia' && data.capability !== 'webPush')) return
    event.ports[0]?.postMessage(capabilities[data.capability])
  })
}
