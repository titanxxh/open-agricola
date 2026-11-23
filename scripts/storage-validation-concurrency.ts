import { availableParallelism } from 'node:os'

export const MAX_STORAGE_VALIDATION_CONCURRENCY = 64

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
