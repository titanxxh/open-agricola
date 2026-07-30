import { handleLocalSandboxRequest, LocalSandboxCore } from '../worker-core.ts'
import type { LocalSandboxRequest, LocalSandboxResponse } from '../protocol.ts'
import type { WorkerLike } from '../local-transport.ts'

/**
 * In-process stand-in for the module worker: drives a real LocalSandboxCore
 * through the same handleLocalSandboxRequest used by worker.ts. `swallow`
 * simulates runaway card code — the request never gets an answer.
 */
export class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: LocalSandboxResponse }) => void) | null = null
  terminated = false
  private readonly core = new LocalSandboxCore()
  private readonly swallow: (request: LocalSandboxRequest) => boolean

  constructor(swallow: (request: LocalSandboxRequest) => boolean = () => false) {
    this.swallow = swallow
    queueMicrotask(() => this.onmessage?.({ data: { kind: 'ready' } }))
  }

  postMessage(request: LocalSandboxRequest): void {
    if (this.swallow(request)) return
    queueMicrotask(() => {
      if (this.terminated) return
      this.onmessage?.({ data: handleLocalSandboxRequest(this.core, request) })
    })
  }

  terminate(): void {
    this.terminated = true
  }
}
