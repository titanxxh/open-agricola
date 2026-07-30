/**
 * Local-sandbox engine worker — thin onmessage shell around
 * `LocalSandboxCore`. Loaded lazily via `new Worker(new URL(...))` only when
 * the workshop runs in browser-executor mode, so the engine + typescript
 * compiler stay out of the main bundle.
 */
import { handleLocalSandboxRequest, LocalSandboxCore } from './worker-core.ts'
import type { LocalSandboxRequest, LocalSandboxResponse } from './protocol.ts'

// Capability removal: strip dangerous worker/DOM APIs from this worker's global
// before any card code runs. The engine only needs onmessage/postMessage, so a
// card that escapes the executor's lexical shadow (e.g. by recovering the
// Function constructor via a computed `['con'+'structor']` property access to
// reach globalThis) still finds fetch/IndexedDB/etc. gone. This is
// defense-in-depth, NOT a real isolate — the authoritative boundary for
// third-party published cards remains the server isolated-vm executor; browser
// mode is the single-player workshop dry-run of the author's own cards (#605).
{
  const g = self as unknown as Record<string, unknown>
  for (const key of [
    'fetch', 'XMLHttpRequest', 'WebSocket', 'importScripts', 'indexedDB',
    'caches', 'navigator', 'Request', 'Response', 'Headers', 'EventSource',
  ]) {
    try { g[key] = undefined } catch { /* non-configurable — leave as is */ }
  }
}

const core = new LocalSandboxCore()

const post = (message: LocalSandboxResponse) => {
  ;(self as unknown as { postMessage(msg: LocalSandboxResponse): void }).postMessage(message)
}

self.onmessage = (event: MessageEvent<LocalSandboxRequest>) => {
  post(handleLocalSandboxRequest(core, event.data))
}

post({ kind: 'ready' })
