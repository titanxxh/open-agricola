import type { IncomingMessage } from 'node:http'

export function corsHeaders(options: {
  methods?: string
  headers?: string
} = {}): Record<string, string> {
  const origin = process.env.CORS_ORIGIN || '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': options.methods ?? 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': options.headers ?? 'Content-Type, Authorization',
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

export function trustedOrigins(req: IncomingMessage): Set<string> {
  const set = new Set<string>()
  for (const raw of [
    process.env.CORS_ORIGIN,
    process.env.PUBLIC_APP_ORIGIN,
    process.env.PUBLIC_API_BASE,
    getRequestOrigin(req),
  ]) {
    const origin = normalizeOrigin(raw)
    if (origin) set.add(origin)
  }
  return set
}

export function isTrustedOrigin(req: IncomingMessage): boolean {
  const origin = normalizeOrigin(req.headers.origin)
  return !origin || trustedOrigins(req).has(origin)
}
