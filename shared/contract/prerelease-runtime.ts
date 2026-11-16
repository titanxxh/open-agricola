import type { PrereleaseIdentitySubject } from './prerelease-identity'

export const PRERELEASE_BUILD_HEADER = 'x-oa-pre-build'
export const PRERELEASE_GENERATION_HEADER = 'x-oa-pre-generation'
export const PRERELEASE_BUILD_PROTOCOL_PREFIX = 'oa.pre.build.'
export const PRERELEASE_GENERATION_PROTOCOL_PREFIX = 'oa.pre.generation.'

export type PrereleaseRuntime = {
  buildId: string
  generationId: string
  appOrigin: string
  formalAppOrigin: string
  formalApiBase: string
  targetId: string
}

export type PrereleaseRuntimeResponse = { ok: true } & (
  | { channel: 'stable' }
  | ({ channel: 'prerelease' } & PrereleaseRuntime)
)

export type PrereleaseSessionResponse = {
  ok: true
  user: PrereleaseIdentitySubject & { isAdmin: false; betaAccess: true }
  prerelease: { buildId: string; generationId: string; expiresAt: number; validUntil: number; serverTime: number }
}

export type PrereleaseAccessErrorCode =
  | 'prerelease_auth_required'
  | 'prerelease_access_paused'
  | 'prerelease_access_expired'
  | 'prerelease_runtime_changed'
  | 'prerelease_readonly'
  | 'invalid_prerelease_handoff'

export type PrereleaseHandoffSessionResponse = PrereleaseSessionResponse & { returnPath: string }

/** Handoff may preserve a product locator, never a redirect or credential fragment. */
export function normalizePrereleaseReturnPath(value: string): string | undefined {
  if (value.length > 2048 || !value.startsWith('/open-agricola/') || (value.includes('\\') || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) return undefined
  try {
    const url = new URL(value, 'https://prerelease.invalid')
    if (url.origin !== 'https://prerelease.invalid' || url.pathname !== '/open-agricola/' || url.hash || url.username || url.password) return undefined
    const keys = new Set(['room', 'context', 'step', 'frame', 'perspective', 'page', 'bg', 'lang', 'hotseat', 'transport'])
    const seen = new Set<string>()
    for (const [key, item] of url.searchParams) {
      if (!keys.has(key) || seen.has(key) || item.length > 512) return undefined
      seen.add(key)
    }
    return `${url.pathname}${url.search}`
  } catch { return undefined }
}
