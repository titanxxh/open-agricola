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
 * This is defense-in-depth: the security boundary for Workshop code is the
 * opaque-origin iframe that hosts this Worker (ADR 0052).
 */
export const DANGEROUS_WORKER_GLOBALS = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB',
  'caches', 'navigator', 'Request', 'Response', 'Headers', 'EventSource',
  // Nested-worker construction: a fresh worker global would resurrect the
  // capabilities removed here, so deny the ways to spin one up.
  'Worker', 'SharedWorker', 'Blob', 'URL', 'MessageChannel', 'BroadcastChannel',
]

export function stripWorkerCapabilities(scope: Record<string, unknown>): string[] {
  const failures: string[] = []
  for (const key of DANGEROUS_WORKER_GLOBALS) {
    try {
      // non-configurable + non-writable: card code can't `delete scope[key]` to
      // re-expose the inherited WorkerGlobalScope getter, nor redefine it.
      Object.defineProperty(scope, key, { value: undefined, writable: false, configurable: false })
    } catch {
      try { scope[key] = undefined } catch { /* ignore */ }
    }
    if (scope[key] !== undefined) failures.push(key)
  }
  return failures
}
