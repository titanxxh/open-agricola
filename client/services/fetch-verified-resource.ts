import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

export async function fetchVerifiedResource(
  url: string,
  expectedSha256: string,
  options: Pick<RequestInit, 'credentials' | 'redirect'> = {},
  fetchResource: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<Response> {
  for (const cache of ['force-cache', 'reload'] satisfies RequestCache[]) {
    const response = await fetchResource(url, { ...options, cache })
    if (!response.ok && cache === 'reload') return response
    if (response.ok) {
      const bytes = new Uint8Array(await response.clone().arrayBuffer())
      if (bytesToHex(sha256(bytes)) === expectedSha256) return response
    }
    await response.body?.cancel().catch(() => undefined)
  }
  throw new Error(`Resource checksum mismatch: ${url}`)
}
