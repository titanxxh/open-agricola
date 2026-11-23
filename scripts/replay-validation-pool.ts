import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { validateReplay, type ReplayHeaderRow, type ReplayStepRow } from './replay-integrity'
import { MAX_STORAGE_VALIDATION_CONCURRENCY } from './storage-validation-concurrency'

const WORKER_ENTRY = join(import.meta.dirname, 'replay-validation-worker-entry.mjs')

export type ReplayValidationCounts = { stepCount: number; segmentCount: number }
export type ReplayValidationResult = { ok: true; counts: ReplayValidationCounts } | { ok: false; error: string }

type ValidationLane = { validate: (header: ReplayHeaderRow, rows: ReplayStepRow[]) => Promise<ReplayValidationCounts> }

/**
 * Listens for the worker's whole life: a crash or failed bootstrap while the
 * caller is still loading steps must reject the lane, not reach Node as an
 * unhandled 'error' event that ends the process.
 */
const workerLane = (worker: Worker): ValidationLane => {
  let failure: Error | null = null
  let job: { resolve: (counts: ReplayValidationCounts) => void; reject: (error: Error) => void } | null = null
  const fail = (error: Error) => { failure ??= error; job?.reject(failure); job = null }
  worker.on('error', error => fail(new Error(`replay validation worker failed: ${error.message}`)))
  worker.on('exit', code => fail(new Error(`replay validation worker exited: ${code}`)))
  worker.on('message', (result: ReplayValidationResult) => {
    const current = job; job = null
    if (!current) return
    if (result.ok) current.resolve(result.counts)
    else current.reject(new Error(result.error))
  })
  return { validate: (header, rows) => new Promise((resolve, reject) => {
    if (failure) { reject(failure); return }
    job = { resolve, reject }
    worker.postMessage({ header, rows })
  }) }
}

/**
 * Decodes and hash-checks every Replay Step. Replays are independent, so with
 * concurrency above one each worker thread takes the next replay, longest
 * first, while the caller's database loads stay on this thread.
 */
export async function validateReplays(
  headers: readonly ReplayHeaderRow[],
  loadSteps: (header: ReplayHeaderRow) => Promise<ReplayStepRow[]>,
  concurrency = 1,
  /** Replaceable only so tests can start a failing worker. */
  workerEntry = WORKER_ENTRY,
): Promise<ReplayValidationCounts> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > MAX_STORAGE_VALIDATION_CONCURRENCY) {
    throw new Error('Invalid storage validation concurrency')
  }
  const total: ReplayValidationCounts = { stepCount: 0, segmentCount: 0 }
  const add = (counts: ReplayValidationCounts) => { total.stepCount += counts.stepCount; total.segmentCount += counts.segmentCount }
  if (concurrency === 1 || headers.length <= 1) {
    for (const header of headers) add(validateReplay(header, await loadSteps(header)))
    return total
  }
  const queue = [...headers].sort((a, b) => b.latest_step_no - a.latest_step_no || a.room_id.localeCompare(b.room_id))
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => new Worker(workerEntry))
  try {
    const lanes = await Promise.allSettled(workers.map(workerLane).map(async lane => {
      try {
        for (let header = queue.shift(); header; header = queue.shift()) add(await lane.validate(header, await loadSteps(header)))
      } catch (error) {
        queue.length = 0 // Stop the other lanes after their current replay.
        throw error
      }
    }))
    const failed = lanes.find(lane => lane.status === 'rejected')
    if (failed) throw failed.reason
    return total
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()))
  }
}
