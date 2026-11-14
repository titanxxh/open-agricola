import { assertPrereleaseResponseAllowed, bindPrereleaseRequest, observePrereleaseFailure } from './prerelease-runtime'
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
  bindPrereleaseRequest(input, headers)
  const response = await fetch(input, { ...init, credentials: 'include', headers })
  if ([400, 401, 403, 426, 503].includes(response.status)) {
    const preBody: unknown = await response.clone().json().catch(() => null)
    if (preBody && typeof preBody === 'object' && 'code' in preBody) {
      observePrereleaseFailure(preBody.code)
      if (preBody.code === 'public_card_execution_paused') window.dispatchEvent(new Event('oa-public-sandbox-paused'))
    }
  }
  if (response.status === 426) {
    const body: unknown = await response.clone().json().catch(() => null)
    if (body && typeof body === 'object' && 'code' in body && body.code === 'reload_required') {
      reloadRequired = true
      for (const listener of reloadListeners) listener()
    }
  }
  assertPrereleaseResponseAllowed(input)
  return response
}
