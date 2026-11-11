import type { PrereleaseEntry } from '../../shared/contract/prerelease-identity'
import { HOSTED_APP_PATH } from '../../shared/contract/protocol/app-location'

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function readPrereleaseEntry(value: unknown, formalOrigin: string): PrereleaseEntry {
  if (!object(value) || value.ok !== true || value.protocolVersion !== 1 || !object(value.entry)) throw new Error('Invalid prerelease entry')
  const entry = value.entry
  if (entry.kind === 'disabled') return { kind: 'disabled' }
  if (entry.kind !== 'available' || entry.channel !== 'prerelease' || typeof entry.startUrl !== 'string'
    || entry.returnTo !== `${formalOrigin}/`) throw new Error('Invalid prerelease target')
  const target = new URL(entry.startUrl)
  if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash
    || target.hostname === new URL(formalOrigin).hostname || target.pathname !== `${HOSTED_APP_PATH}auth/start`) throw new Error('Invalid prerelease target')
  return { kind: 'available', channel: 'prerelease', startUrl: target.href, returnTo: `${formalOrigin}/` }
}

type HandoffInput = { browserChallenge: string; state: string; targetOrigin: string; returnTo: string }
const opaque = (value: string | null): value is string => value !== null && /^[A-Za-z0-9_-]{43}$/.test(value)

export function readPrereleaseHandoff(fragment: string, formalOrigin: string): HandoffInput | undefined {
  const params = new URLSearchParams(fragment.replace(/^#/, ''))
  const browserChallenge = params.get('browserChallenge'), state = params.get('state')
  const targetOrigin = params.get('targetOrigin'), returnTo = params.get('returnTo')
  if (params.size !== 4 || !opaque(browserChallenge) || !opaque(state) || !targetOrigin || returnTo !== `${formalOrigin}/`) return undefined
  try {
    const target = new URL(targetOrigin)
    if (target.protocol !== 'https:' || target.origin !== targetOrigin || target.hostname === new URL(formalOrigin).hostname) return undefined
    return { browserChallenge, state, targetOrigin, returnTo }
  } catch { return undefined }
}

export class PrereleaseHandoffFailure extends Error {
  readonly kind: 'access' | 'unavailable' | 'invalid'
  constructor(kind: PrereleaseHandoffFailure['kind']) { super(`Prerelease handoff ${kind}`); this.kind = kind }
}

/** Issues one short-lived code, and accepts only the authority's configured callback. */
export async function preparePrereleaseHandoff(apiFetch: (path: string, init?: RequestInit) => Promise<Response>, input: HandoffInput, formalOrigin: string): Promise<string> {
  const decode = async (response: Response): Promise<unknown> => {
    if (response.status === 401 || response.status === 403) throw new PrereleaseHandoffFailure('access')
    if (!response.ok) throw new PrereleaseHandoffFailure('unavailable')
    return response.json()
  }
  const entry = readPrereleaseEntry(await decode(await apiFetch('/api/prerelease/entry')), formalOrigin)
  if (entry.kind !== 'available') throw new PrereleaseHandoffFailure('unavailable')
  if (new URL(entry.startUrl).origin !== input.targetOrigin || entry.returnTo !== input.returnTo) throw new PrereleaseHandoffFailure('invalid')
  const result = await decode(await apiFetch('/api/prerelease/handoffs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ protocolVersion: 1, channel: 'prerelease', targetOrigin: input.targetOrigin, browserChallenge: input.browserChallenge, returnTo: input.returnTo }),
  }))
  const callback = `${input.targetOrigin}${HOSTED_APP_PATH}auth/handoff`
  if (!object(result) || result.ok !== true || result.protocolVersion !== 1 || typeof result.code !== 'string' || !opaque(result.code)
    || typeof result.expiresAt !== 'number' || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now() || result.expiresAt > Date.now() + 60_000
    || result.callbackUrl !== callback || result.returnTo !== input.returnTo) throw new PrereleaseHandoffFailure('invalid')
  const destination = new URL(callback)
  destination.hash = new URLSearchParams({ protocolVersion: '1', code: result.code, state: input.state, browserChallenge: input.browserChallenge, returnTo: input.returnTo }).toString()
  return destination.href
}
