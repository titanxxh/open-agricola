const VERIFIER_KEY = 'open-agricola-onboarding-verifier'
const TICKET_KEY = 'open-agricola-onboarding-ticket'

const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export async function prepareOAuthOnboarding(href: string): Promise<string> {
  if (!globalThis.crypto?.subtle) return href
  const verifier = hex(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const url = new URL(href, window.location.href)
  url.searchParams.set('onboardingChallenge', challenge)
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.removeItem(TICKET_KEY)
  return url.toString()
}

export function readOnboardingCredentials(): { ticket: string; verifier: string } | undefined {
  const fragment = new URLSearchParams(window.location.hash.slice(1))
  const ticket = fragment.get('onboardingTicket')
  if (ticket !== null) {
    fragment.delete('onboardingTicket')
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${fragment.size ? `#${fragment}` : ''}`)
    if (/^[\w-]{43}$/.test(ticket)) sessionStorage.setItem(TICKET_KEY, ticket)
    else sessionStorage.removeItem(TICKET_KEY)
  }
  const storedTicket = ticket ?? sessionStorage.getItem(TICKET_KEY)
  if (storedTicket === null) return undefined
  return { ticket: storedTicket, verifier: sessionStorage.getItem(VERIFIER_KEY) ?? '' }
}

export function clearOnboardingCredentials(): void {
  sessionStorage.removeItem(TICKET_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
}
