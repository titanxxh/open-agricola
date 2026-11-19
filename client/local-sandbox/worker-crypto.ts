import { uuidFromRandomBytes } from '../utils/uuid.ts'

/** Opaque Chromium workers lack the secure-context-only randomUUID method. */
export function ensureRandomUUID(): void {
  if (typeof crypto.randomUUID === 'function') return
  // getRandomValues remains available; keep the worker's opaque origin intact.
  Object.defineProperty(crypto, 'randomUUID', { value: uuidFromRandomBytes })
}
