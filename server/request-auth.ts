import type { IncomingMessage } from 'node:http'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION, BROWSER_WS_PROTOCOL } from '../shared/contract/browser-auth'
import { authCookieNames, readCookie } from './auth-cookies'
import { isApiHost, isTrustedOrigin, normalizeOrigin } from './http-origin'
import { allowAnonymousAccess } from './anonymous-access'

type Admission = { ok: true } | { ok: false; status: 400 | 403 | 426; code: 'invalid_credentials' | 'csrf_rejected' | 'reload_required' }
type RouteAccess = 'public' | 'navigation' | 'service' | 'operations' | 'browser' | 'oauth-form' | 'application'
const accepted: Admission = { ok: true }
const denied: Admission = { ok: false, status: 403, code: 'csrf_rejected' }
const reload: Admission = { ok: false, status: 426, code: 'reload_required' }
const invalid: Admission = { ok: false, status: 400, code: 'invalid_credentials' }
const safe = (req: IncomingMessage) => req.method === 'GET' || req.method === 'HEAD'
const pathname = (req: IncomingMessage) => new URL(req.url ?? '/', 'http://localhost').pathname

function routeAccess(req: IncomingMessage): RouteAccess {
  const path = pathname(req)
  if (isOAuthStartForm(req)) return 'oauth-form'
  if (safe(req) && (['/api/health', '/api/auth/browser-policy', '/api/whats-new', '/api/auth/registration-policy', '/api/workshop/sandbox-contract', '/api/community/wechat-qr', '/api/community/feishu-qr'].includes(path)
    || /^\/(?:replay-viewers|replay-assets|card-art)\//.test(path)
    || path.startsWith('/api/v1/replays/') || path.startsWith('/api/workshop/public-cards/'))) return 'public'
  if (req.method === 'GET' && (/^\/api\/auth\/oauth\/(?:github|google)\/callback$/.test(path)
    || path === '/api/auth/verify-email' || path === '/api/v1/issue-submission-connection/github/callback')) return 'navigation'
  if (path.startsWith('/ops/')) return 'operations'
  if (path === '/internal/metrics' || ['/api/github/webhook', '/api/v1/github-app/webhook'].includes(path)
    || /^\/api\/prerelease\/(?:exchange|status|events|acknowledgements)$/.test(path)) return 'service'
  if (path === '/api/prerelease/entry' || path === '/api/prerelease/handoffs'
    || /^\/api\/auth\/(?:login|register|onboarding\/complete|password-reset\/(?:request|complete)|resend-verification)$/.test(path)
    || /^\/api\/auth\/oauth\/[^/]+\/(?:start|complete)$/.test(path)) return 'browser'
  return 'application'
}

export function isOAuthStartForm(req: IncomingMessage): boolean {
  return req.method === 'POST' && /^\/api\/auth\/oauth\/(?:github|google)\/start$/.test(pathname(req))
    && req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() === 'application/x-www-form-urlencoded'
}

function oauthFormAdmission(req: IncomingMessage): Admission {
  if (!isTrustedOrigin(req) || !isApiHost(req)) return denied
  const mode = req.headers['sec-fetch-mode'], destination = req.headers['sec-fetch-dest']
  const appOrigin = normalizeOrigin(process.env.PUBLIC_APP_ORIGIN)
  const apiOrigin = normalizeOrigin(process.env.PUBLIC_API_BASE)
  const localHttp = process.env.NODE_ENV !== 'production' && process.env.RELEASE_CHANNEL !== 'prerelease'
    && appOrigin?.startsWith('http:') && apiOrigin?.startsWith('http:') && req.headers.origin === appOrigin
    && mode === undefined && destination === undefined
  if (!(mode === 'navigate' && destination === 'document') && !localHttp) return denied
  return req.headers.authorization === undefined ? accepted : invalid
}

function bearer(req: IncomingMessage): string {
  const value = req.headers.authorization
  return typeof value === 'string' && /^Bearer [^\s,]+$/.test(value) ? value.slice(7) : ''
}

function native(req: IncomingMessage): boolean {
  return req.headers.origin === undefined && req.headers.cookie === undefined && !!bearer(req)
}

function sameOriginFetch(req: IncomingMessage): boolean {
  return req.headers.origin === undefined && req.headers['sec-fetch-site'] === 'same-origin' && isApiHost(req)
}

function browser(req: IncomingMessage): Admission {
  if (!isTrustedOrigin(req) && !sameOriginFetch(req)) return denied
  if (req.headers[BROWSER_AUTH_HEADER] !== String(BROWSER_AUTH_VERSION)) return reload
  if (req.headers.authorization !== undefined) return invalid
  if (process.env.NODE_ENV === 'production' && !isApiHost(req)) return denied
  return accepted
}

function navigation(req: IncomingMessage): Admission {
  const destination = req.headers['sec-fetch-dest']
  const mode = req.headers['sec-fetch-mode']
  if (destination !== undefined || mode !== undefined) {
    return destination === 'document' && mode === 'navigate' ? accepted : denied
  }
  return req.headers.origin === undefined ? accepted : denied
}

export function operationsAdmission(req: IncomingMessage): Admission {
  if (native(req)) return accepted
  if (req.headers.authorization !== undefined) return invalid
  if (process.env.NODE_ENV === 'production' && !isApiHost(req)) return denied
  if (pathname(req) === '/ops/start') return req.method === 'GET' ? navigation(req) : denied
  const apiOrigin = normalizeOrigin(process.env.PUBLIC_API_BASE)
  if (!apiOrigin) return denied
  if (req.headers.origin !== undefined) return req.headers.origin === apiOrigin ? accepted : denied
  if (!safe(req)) return denied
  if (sameOriginFetch(req)) return accepted
  const referer = typeof req.headers.referer === 'string' ? normalizeOrigin(req.headers.referer) : null
  if (referer === apiOrigin) return accepted
  if (req.headers['sec-fetch-dest'] === 'document' && req.headers['sec-fetch-mode'] === 'navigate'
    && (req.headers['sec-fetch-site'] === 'none' || referer === normalizeOrigin(process.env.PUBLIC_APP_ORIGIN))) return accepted
  return denied
}

export function httpAdmission(req: IncomingMessage): Admission {
  if (!req.url?.startsWith('/') || req.url.startsWith('//')) return denied
  switch (routeAccess(req)) {
    case 'public': return accepted
    case 'navigation': return navigation(req)
    case 'operations': return operationsAdmission(req)
    case 'service': return req.headers.origin === undefined && req.headers.cookie === undefined ? accepted : denied
    case 'browser': return browser(req)
    case 'oauth-form': return oauthFormAdmission(req)
    case 'application':
      if (native(req)) return accepted
      if (req.headers.origin === undefined && req.headers.cookie === undefined && req.headers.authorization === undefined
        && process.env.NODE_ENV !== 'production' && process.env.RELEASE_CHANNEL !== 'prerelease' && allowAnonymousAccess()
        && /^\/api\/(?:game\/|test\/|rooms(?:\/|$)|lobby\/)/.test(pathname(req))) return accepted
      return browser(req)
  }
}

/** Resolve the original transport without rewriting Cookie into Authorization. */
export function requestSessionToken(req: IncomingMessage, operations = false): string {
  if (process.env.RELEASE_CHANNEL === 'prerelease' && (operations || req.headers.authorization !== undefined)) return ''
  const access = routeAccess(req)
  if (access === 'public' || access === 'navigation' || access === 'service' || access === 'oauth-form' || !httpAdmission(req).ok) return ''
  if (req.headers.authorization !== undefined) return native(req) ? bearer(req) : ''
  return readCookie(req.headers.cookie, operations ? authCookieNames().operations : authCookieNames().session)
}

export function websocketAdmission(req: IncomingMessage): Admission {
  if (req.headers.authorization !== undefined) return invalid
  if (req.headers.origin === undefined) return req.headers.cookie === undefined ? accepted : denied
  if (!isTrustedOrigin(req) || (process.env.NODE_ENV === 'production' && !isApiHost(req))) return denied
  const protocols = req.headers['sec-websocket-protocol']?.split(',').map(value => value.trim()) ?? []
  return protocols.includes(BROWSER_WS_PROTOCOL) ? accepted : reload
}

export function websocketSessionToken(req: IncomingMessage): string {
  if (!websocketAdmission(req).ok || req.headers.origin === undefined) return ''
  return readCookie(req.headers.cookie, authCookieNames().session)
}
