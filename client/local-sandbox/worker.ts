/**
 * Local-sandbox engine worker — thin onmessage shell around
 * `LocalSandboxCore`. `opaque-worker.ts` starts it as a self-contained Blob
 * Worker inside an opaque-origin iframe, so the engine and TypeScript compiler
 * stay out of the main bundle and Workshop code cannot reach page credentials.
 */
import { handleLocalSandboxRequest, LocalSandboxCore } from './worker-core.ts'
import { stripWorkerCapabilities } from './worker-capabilities.ts'
import { ensureRandomUUID } from './worker-crypto.ts'
import type { LocalSandboxRequest, LocalSandboxResponse } from './protocol.ts'

ensureRandomUUID()

// Strip dangerous worker/DOM APIs from this worker's global before any card
// code runs (see worker-capabilities.ts). The engine only needs
// onmessage/postMessage.
{
  const failures = stripWorkerCapabilities(self as unknown as Record<string, unknown>)
  if (failures.length) {
    console.warn(`[local-sandbox] could not remove worker globals: ${failures.join(', ')}`)
  }
}

const core = new LocalSandboxCore()

const post = (message: LocalSandboxResponse) => {
  ;(self as unknown as { postMessage(msg: LocalSandboxResponse): void }).postMessage(message)
}

self.onmessage = (event: MessageEvent<LocalSandboxRequest>) => {
  post(handleLocalSandboxRequest(core, event.data))
}

post({ kind: 'ready', origin: self.origin })
