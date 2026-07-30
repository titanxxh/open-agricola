/**
 * Local-sandbox engine worker — thin onmessage shell around
 * `LocalSandboxCore`. Loaded lazily via `new Worker(new URL(...))` only when
 * the workshop runs in browser-executor mode, so the engine + typescript
 * compiler stay out of the main bundle.
 */
import { handleLocalSandboxRequest, LocalSandboxCore } from './worker-core.ts'
import type { LocalSandboxRequest, LocalSandboxResponse } from './protocol.ts'

const core = new LocalSandboxCore()

const post = (message: LocalSandboxResponse) => {
  ;(self as unknown as { postMessage(msg: LocalSandboxResponse): void }).postMessage(message)
}

self.onmessage = (event: MessageEvent<LocalSandboxRequest>) => {
  post(handleLocalSandboxRequest(core, event.data))
}

post({ kind: 'ready' })
