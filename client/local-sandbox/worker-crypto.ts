/** Opaque Chromium workers lack the secure-context-only randomUUID method. */
export function ensureRandomUUID(): void {
  if (typeof crypto.randomUUID === 'function') return
  // getRandomValues remains available; keep the worker's opaque origin intact.
  Object.defineProperty(crypto, 'randomUUID', { value: () => {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 15) | 64
    bytes[8] = (bytes[8] & 63) | 128
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  } })
}
