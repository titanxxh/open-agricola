/**
 * Worker Thread that runs isolated-vm code execution.
 *
 * This provides process-level crash isolation: if a V8 isolate triggers a
 * native crash (segfault in isolated-vm or V8 itself), only this worker
 * dies — the main server process and all other players are unaffected.
 *
 * Imports only isolate-runner.ts (which only depends on isolated-vm),
 * avoiding the full project module tree and its directory-import issues.
 *
 * Communication protocol:
 * - Async calls (validate): handled in main thread (needs project modules)
 * - Sync calls (invoke effect/listener): SharedArrayBuffer + Atomics
 */
import { parentPort } from 'node:worker_threads'
import { invokeEffect, invokeListener } from './isolate-runner.ts'
import type { EffectRequest, ListenerRequest } from './isolate-runner.ts'

if (!parentPort) throw new Error('Must be run as a Worker Thread')

const port = parentPort

port.on('message', (msg: {
  id: number
  type: 'invokeEffect' | 'invokeListener'
  data: unknown
  signal?: SharedArrayBuffer
  resultBuffer?: SharedArrayBuffer
}) => {
  const { type, data, signal, resultBuffer } = msg
  let response: unknown

  try {
    switch (type) {
      case 'invokeEffect': {
        response = { ok: true, result: invokeEffect(data as EffectRequest) }
        break
      }
      case 'invokeListener': {
        response = { ok: true, result: invokeListener(data as ListenerRequest) }
        break
      }
      default:
        response = { ok: false, error: `Unknown message type: ${type}` }
    }
  } catch (err) {
    response = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (signal && resultBuffer) {
    // Sync call path: write result into shared buffer, then notify
    const resultJson = JSON.stringify(response)
    const encoded = new TextEncoder().encode(resultJson)
    const view = new Uint8Array(resultBuffer)
    const lengthView = new DataView(resultBuffer)
    lengthView.setUint32(0, encoded.byteLength)
    view.set(encoded, 4)

    const signalArray = new Int32Array(signal)
    Atomics.store(signalArray, 0, 1)
    Atomics.notify(signalArray, 0)
  } else {
    // Async call path (not used currently, but available)
    port.postMessage({ id: msg.id, ...response as object })
  }
})

port.postMessage({ type: 'ready' })
