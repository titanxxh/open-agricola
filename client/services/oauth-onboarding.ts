import { BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth'

const VERIFIER_KEY = 'open-agricola-onboarding-verifier'
const TICKET_KEY = 'open-agricola-onboarding-ticket'

const hex = (bytes: Uint8Array): string => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export async function startOAuthOnboarding(href: string): Promise<void> {
  const url = new URL(href, window.location.href)
  if (globalThis.crypto?.subtle) {
    const verifier = hex(crypto.getRandomValues(new Uint8Array(32)))
    const challenge = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
    url.searchParams.set('onboardingChallenge', challenge)
    sessionStorage.setItem(VERIFIER_KEY, verifier)
    sessionStorage.removeItem(TICKET_KEY)
  }
  const form = document.createElement('form')
  form.method = 'POST'
  form.target = '_self'
  const fields = new URLSearchParams(url.search)
  fields.set('protocol', String(BROWSER_AUTH_VERSION))
  url.search = ''
  url.hash = ''
  form.action = url.toString()
  for (const [name, value] of fields) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.append(input)
  }
  document.body.append(form)
  try { form.submit() } finally { form.remove() }
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
