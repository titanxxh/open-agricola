import { parentPort } from 'node:worker_threads'
import { validateReplay, type ReplayHeaderRow, type ReplayStepRow } from './replay-integrity'
import type { ReplayValidationResult } from './replay-validation-pool'

// Structured cloning turns a Buffer into a plain Uint8Array; reattach a Buffer
// view over the same bytes before decoding.
type TransferredStep = Omit<ReplayStepRow, 'payload_gzip'> & { payload_gzip: Uint8Array }

parentPort!.on('message', ({ header, rows }: { header: ReplayHeaderRow; rows: TransferredStep[] }) => {
  let result: ReplayValidationResult
  try {
    const steps = rows.map(row => ({ ...row, payload_gzip: Buffer.from(row.payload_gzip.buffer, row.payload_gzip.byteOffset, row.payload_gzip.byteLength) }))
    result = { ok: true, counts: validateReplay(header, steps) }
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  parentPort!.postMessage(result)
})
