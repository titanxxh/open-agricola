/**
 * Executor client — runs custom card code in a Worker Thread for crash isolation.
 *
 * Two layers of protection:
 * 1. isolated-vm: V8 isolate with separate heap (JS-level security)
 * 2. Worker Thread: process-level crash boundary (native crash safety)
 *
 * If user code triggers a V8/native crash, only the worker dies.
 * The main server process auto-spawns a new worker and continues serving.
 *
 * Architecture:
 * - Validation/compilation runs in-process (needs project module tree)
 * - Effect/listener invocation runs in Worker Thread (only needs isolated-vm)
 *
 * Sync calls use SharedArrayBuffer + Atomics.wait to block the main thread.
 * This is safe because the game engine is fully synchronous and single-threaded.
 */
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type {
  CustomCodeEffectInvocation,
  CustomCodeEffectResult,
  CustomCodeListenerInvocation,
  CustomCodeListenerResult,
  CustomCodeValidateResult,
} from '../../shared/custom-code/types.ts'

const WORKER_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'executor-worker.ts',
)

// Max size for JSON-serialized results (1MB)
const RESULT_BUFFER_SIZE = 1024 * 1024
// Timeout for sync calls — longer than the isolate timeout (100ms) to account for startup + overhead
const SYNC_TIMEOUT_MS = 5000

let worker: Worker | null = null

function ensureWorker(): Worker {
  if (worker) return worker

  const w = new Worker(WORKER_SCRIPT, {
    // Node 22+ can strip TypeScript type annotations natively.
    execArgv: ['--experimental-strip-types', '--no-warnings'],
    // Worker-level resource limits as an extra safety net
    resourceLimits: {
      maxOldGenerationSizeMb: 64,
      maxYoungGenerationSizeMb: 16,
      codeRangeSizeMb: 16,
    },
  })

  w.on('error', (err: unknown) => {
    console.error('[executor-worker] Worker error:', err instanceof Error ? err.message : String(err))
  })

  w.on('exit', (code) => {
    if (code !== 0) {
      console.warn(`[executor-worker] Worker exited with code ${code}, will respawn on next call`)
    }
    worker = null
  })

  worker = w
  return w
}

/**
 * Synchronous call to the worker using SharedArrayBuffer + Atomics.wait.
 * Blocks the main thread until the worker completes (or times out).
 */
function callWorkerSync(type: string, data: unknown): unknown {
  const w = ensureWorker()

  const signal = new SharedArrayBuffer(4)
  const signalArray = new Int32Array(signal)
  const resultBuffer = new SharedArrayBuffer(RESULT_BUFFER_SIZE)

  Atomics.store(signalArray, 0, 0)
  // JSON-serialize data to strip functions (e.g., canBeExecutedByPlayer on GameState)
  // which can't survive the structured clone algorithm used by postMessage.
  const safeData = JSON.parse(JSON.stringify(data))
  w.postMessage({ id: -1, type, data: safeData, signal, resultBuffer })

  const waitResult = Atomics.wait(signalArray, 0, 0, SYNC_TIMEOUT_MS)
  if (waitResult === 'timed-out') {
    throw new Error('Worker execution timed out')
  }

  // Read result from shared buffer
  const lengthView = new DataView(resultBuffer)
  const length = lengthView.getUint32(0)
  if (length === 0 || length > RESULT_BUFFER_SIZE - 4) {
    throw new Error('Invalid result length from worker')
  }
  const encoded = new Uint8Array(resultBuffer, 4, length)
  const json = new TextDecoder().decode(encoded)
  const response = JSON.parse(json) as { ok: boolean; result?: unknown; error?: string }

  if (!response.ok) {
    throw new Error(response.error ?? 'Worker execution failed')
  }
  return response.result
}

// Validation runs in-process — it needs the AST validator, card compiler,
// and manifest extraction which depend on the full project module tree.
export const validateAndCompileCustomCodeRemote = async (
  source: string,
  cardId: string,
): Promise<CustomCodeValidateResult> => {
  const { validateAndCompileCustomCode } = await import('./engine.ts')
  return validateAndCompileCustomCode(source, cardId)
}

export const invokeCustomCodeEffectSync = (
  request: CustomCodeEffectInvocation,
): CustomCodeEffectResult => {
  try {
    return callWorkerSync('invokeEffect', request) as CustomCodeEffectResult
  } catch (error) {
    return {
      ok: false,
      error: `Worker error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export const invokeCustomCodeListenerSync = (
  request: CustomCodeListenerInvocation,
): CustomCodeListenerResult => {
  try {
    return callWorkerSync('invokeListener', request) as CustomCodeListenerResult
  } catch (error) {
    return {
      ok: false,
      error: `Worker error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
