import { assertPrereleaseResponseAllowed, bindPrereleaseRequest, observePrereleaseFailure } from './prerelease-runtime'
import { browserProtocolFetch, getBrowserReloadRequired } from './browser-protocol'

export { getBrowserReloadRequired, subscribeBrowserReload } from './browser-protocol'

export async function browserApiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (getBrowserReloadRequired()) throw new Error('reload_required')
  const headers = new Headers(init?.headers)
  bindPrereleaseRequest(input, headers)
  const response = await browserProtocolFetch(input, { ...init, headers })
  if ([400, 401, 403, 426, 503].includes(response.status)) {
    const preBody: unknown = await response.clone().json().catch(() => null)
    if (preBody && typeof preBody === 'object' && 'code' in preBody) observePrereleaseFailure(preBody.code)
  }
  assertPrereleaseResponseAllowed(input)
  return response
}
