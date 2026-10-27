import { HOSTED_APP_PATH, type AppLocationResponse } from '../../shared/contract/protocol/app-location'

function readAppLocation(value: unknown): AppLocationResponse {
  if (value && typeof value === 'object' && 'mode' in value) {
    if (value.mode === 'disabled') return { mode: 'disabled' }
    if (value.mode === 'canonical' && 'appUrl' in value && typeof value.appUrl === 'string'
      && 'buildId' in value && typeof value.buildId === 'string' && value.buildId.trim()) {
      return { mode: 'canonical', appUrl: value.appUrl, buildId: value.buildId }
    }
  }
  throw new Error('Invalid application location response')
}

export async function canonicalAppLocation(currentHref: string, apiBase: string): Promise<string | null> {
  const current = new URL(currentHref)
  const api = new URL(apiBase || '/', current)
  const endpoint = `${api.href.replace(/\/$/, '')}/api/app-location`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  let location: AppLocationResponse
  try {
    const response = await fetch(endpoint, {
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
    })
    if (!response.ok) throw new Error('Application location is unavailable')
    const value: unknown = await response.json()
    location = readAppLocation(value)
  } finally {
    clearTimeout(timer)
  }
  if (location.mode === 'disabled') return null
  const destination = new URL(location.appUrl)
  if (!['http:', 'https:'].includes(destination.protocol) || apiBase && destination.origin !== api.origin
    || destination.pathname !== HOSTED_APP_PATH || destination.search || destination.hash
    || destination.username || destination.password
    || current.protocol === 'https:' && destination.protocol !== 'https:') {
    throw new Error('Invalid canonical application location')
  }
  if (current.origin === destination.origin && current.pathname === destination.pathname) return null
  destination.search = current.search
  destination.hash = current.hash
  if (current.origin !== destination.origin
    && (current.searchParams.get('page') === 'onboarding' || new URLSearchParams(current.hash.slice(1)).has('onboardingTicket'))) {
    destination.search = new URLSearchParams({
      page: 'login', authMode: 'register', authError: 'oauth_onboarding_expired',
    }).toString()
    destination.hash = ''
  }
  return destination.href
}
