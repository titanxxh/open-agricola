import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'

let reloadRequired = false
const reloadListeners = new Set<() => void>()

export const getBrowserReloadRequired = () => reloadRequired
export function subscribeBrowserReload(listener: () => void): () => void {
  reloadListeners.add(listener)
  return () => { reloadListeners.delete(listener) }
}

export async function browserApiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (reloadRequired) throw new Error('reload_required')
  const headers = new Headers(init?.headers)
  headers.set(BROWSER_AUTH_HEADER, String(BROWSER_AUTH_VERSION))
  const response = await fetch(input, { ...init, credentials: 'include', headers })
  if (response.status === 426) {
    const body: unknown = await response.clone().json().catch(() => null)
    if (body && typeof body === 'object' && 'code' in body && body.code === 'reload_required') {
      reloadRequired = true
      for (const listener of reloadListeners) listener()
    }
  }
  return response
}
