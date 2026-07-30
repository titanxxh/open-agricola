/**
 * Capability removal for the local-sandbox worker global.
 *
 * Several of these (indexedDB, caches, navigator) are read-only WebIDL getters
 * on WorkerGlobalScope, so a plain assignment throws and leaves them intact.
 * Defining an own `undefined` data property shadows the inherited getter, which
 * also covers the case where card code recovers `globalThis` via a computed
 * Function-constructor escape. Returns the keys that could NOT be removed so the
 * caller can log them instead of assuming success.
 *
 * This is defense-in-depth, not a real isolate — the authoritative boundary for
 * third-party published cards remains the server isolated-vm executor.
 */
export const DANGEROUS_WORKER_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB',
  'caches', 'navigator', 'Request', 'Response', 'Headers', 'EventSource',
]

export function stripWorkerCapabilities(scope: Record<string, unknown>): string[] {
  const failures: string[] = []
  for (const key of DANGEROUS_WORKER_GLOBALS) {
    try {
      Object.defineProperty(scope, key, { value: undefined, writable: false, configurable: true })
    } catch {
      try { scope[key] = undefined } catch { /* ignore */ }
    }
    if (scope[key] !== undefined) failures.push(key)
  }
  return failures
}
