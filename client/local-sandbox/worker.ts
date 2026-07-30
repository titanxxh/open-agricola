/**
 * Local-sandbox engine worker — thin onmessage shell around
 * `LocalSandboxCore`. Loaded lazily via `new Worker(new URL(...))` only when
 * the workshop runs in browser-executor mode, so the engine + typescript
 * compiler stay out of the main bundle.
 */
import { LocalSandboxCore } from './worker-core.ts'
import type { LocalSandboxRequest, LocalSandboxResponse } from './protocol.ts'

const core = new LocalSandboxCore()

const post = (message: LocalSandboxResponse) => {
  ;(self as unknown as { postMessage(msg: LocalSandboxResponse): void }).postMessage(message)
}

self.onmessage = (event: MessageEvent<LocalSandboxRequest>) => {
  const request = event.data
  try {
    const result = request.kind === 'init'
      ? core.init(request.config, request.viewer)
      : request.kind === 'restore'
        ? core.restore(request.persisted, request.viewer)
        : core.call(request.method, request.args, request.viewer)
    post({ kind: 'result', id: request.id, ok: true, ...result })
  } catch (error) {
    post({
      kind: 'result',
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

post({ kind: 'ready' })
