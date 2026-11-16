import { availableParallelism } from 'node:os'
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { validateReplay, type ReplayHeaderRow, type ReplayStepRow } from './replay-integrity'

const WORKER_ENTRY = join(import.meta.dirname, 'replay-validation-worker-entry.mjs')
export const MAX_STORAGE_VALIDATION_CONCURRENCY = 64

export type ReplayValidationCounts = { stepCount: number; segmentCount: number }
export type ReplayValidationResult = { ok: true; counts: ReplayValidationCounts } | { ok: false; error: string }

/**
 * Unset keeps the single-threaded default for online jobs that share the host
 * with players. `auto` uses every available CPU and is only for stopped
 * applications or a dedicated validation machine.
 */
export function storageValidationConcurrency(value: string | undefined): number {
  if (value === undefined || value === '') return 1
  if (value === 'auto') return Math.min(availableParallelism(), MAX_STORAGE_VALIDATION_CONCURRENCY)
  const count = /^[1-9]\d*$/.test(value) ? Number(value) : NaN
  if (!(count <= MAX_STORAGE_VALIDATION_CONCURRENCY)) throw new Error('Invalid STORAGE_VALIDATION_CONCURRENCY')
  return count
}

const validateInWorker = (worker: Worker, header: ReplayHeaderRow, rows: ReplayStepRow[]): Promise<ReplayValidationCounts> =>
  new Promise((resolve, reject) => {
    const settle = (callback: () => void) => {
      worker.off('message', onMessage); worker.off('error', onError); worker.off('exit', onExit)
      callback()
    }
    const onMessage = (result: ReplayValidationResult) => settle(() => result.ok ? resolve(result.counts) : reject(new Error(result.error)))
    const onError = (error: Error) => settle(() => reject(new Error(`replay validation worker failed: ${error.message}`)))
    const onExit = (code: number) => settle(() => reject(new Error(`replay validation worker exited: ${code}`)))
    worker.on('message', onMessage); worker.on('error', onError); worker.on('exit', onExit)
    worker.postMessage({ header, rows })
  })

/**
 * Decodes and hash-checks every Replay Step. Replays are independent, so with
 * concurrency above one each worker thread takes the next replay, longest
 * first, while the caller's database loads stay on this thread.
 */
export async function validateReplays(
  headers: readonly ReplayHeaderRow[],
  loadSteps: (header: ReplayHeaderRow) => Promise<ReplayStepRow[]>,
  concurrency = 1,
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
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, () => new Worker(WORKER_ENTRY))
  try {
    const lanes = await Promise.allSettled(workers.map(async worker => {
      try {
        for (let header = queue.shift(); header; header = queue.shift()) add(await validateInWorker(worker, header, await loadSteps(header)))
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
