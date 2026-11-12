import type { IncomingMessage } from 'node:http'
import { getDomain } from 'tldts'
import { BROWSER_AUTH_HEADER } from '../shared/contract/browser-auth'

export function isSameSite(first: URL, second: URL): boolean {
  const siteHost = (url: URL) => getDomain(url.hostname, { allowPrivateDomains: true }) ?? url.hostname
  return first.protocol === second.protocol && siteHost(first) === siteHost(second)
}

export function corsHeaders(options: {
  methods?: string
  headers?: string
} = {}): Record<string, string> {
  const origin = normalizeOrigin(process.env.PUBLIC_APP_ORIGIN) ?? normalizeOrigin(process.env.CORS_ORIGIN) ?? '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': options.methods ?? 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': options.headers ?? `Content-Type, Authorization, ${BROWSER_AUTH_HEADER}`,
    Vary: 'Origin',
    ...(origin !== '*' ? { 'Access-Control-Allow-Credentials': 'true' } : {}),
  }
}

export function normalizeOrigin(raw: string | string[] | undefined | null): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value || value === '*') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

export function getRequestOrigin(req: IncomingMessage): string {
  const host = req.headers.host ?? 'localhost'
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http'
  return `${proto}://${host}`
}

export function trustedOrigins(): Set<string> {
  const set = new Set<string>()
  for (const raw of [
    process.env.PUBLIC_APP_ORIGIN ? undefined : process.env.CORS_ORIGIN,
    process.env.PUBLIC_APP_ORIGIN,
    process.env.PUBLIC_API_BASE,
  ]) {
    const origin = normalizeOrigin(raw)
    if (origin) set.add(origin)
  }
  return set
}

export function isTrustedOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  return typeof origin === 'string' && normalizeOrigin(origin) === origin && trustedOrigins().has(origin)
}

export function isApiHost(req: IncomingMessage): boolean {
  const apiOrigin = normalizeOrigin(process.env.PUBLIC_API_BASE)
  return !!apiOrigin && req.headers.host === new URL(apiOrigin).host
}
