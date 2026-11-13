import { browserApiFetch } from './browser-api'
import { isPrereleaseClient } from './prerelease-runtime'

/** Public formal projections still require the environment lease on prerelease. */
export function resourceFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (isPrereleaseClient()) return browserApiFetch(input, init)
  return init === undefined ? fetch(input) : fetch(input, init)
}
