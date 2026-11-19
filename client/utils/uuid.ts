/** A version-4 UUID from `getRandomValues`, which insecure contexts and opaque Workers still provide. */
export function uuidFromRandomBytes(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** `crypto.randomUUID` when available; the HTTP LAN launcher is not a secure context and lacks it. */
export function randomUuid(): string {
  return typeof globalThis.crypto.randomUUID === 'function' ? globalThis.crypto.randomUUID() : uuidFromRandomBytes()
}
