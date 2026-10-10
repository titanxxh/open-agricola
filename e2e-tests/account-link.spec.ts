import { expect } from '@playwright/test'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:https'
import { test } from './server-fixtures'
import { FRONTEND_URL } from './fixtures'
import { createLocalUserForTests, createSession, validateSession } from '../server/auth'
import { readCookie, serializeSessionCookie, SESSION_COOKIE } from '../server/auth-cookies'
import { getDb } from '../server/db'
import { handleLinkedIdentities, handleOAuthCallback, handleOAuthLinkComplete, handleOAuthStart } from '../server/oauth/handler'
import { findIdentity } from '../server/oauth/store'

// Exercise the real UI, handlers, DB and cookie serializer on two HTTPS sites.
// Only provider authorization/token/profile responses are simulated; no personal accounts or secrets are used.
for (const provider of ['github', 'google'] as const) {
  for (const cancelled of [false, true]) {
    test(`${provider} binding under a partitioned session: ${cancelled ? 'cancel' : 'complete'}`, async ({ playwright }, testInfo) => {
      const directory = mkdtempSync(join(tmpdir(), 'agricola-account-link-'))
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'),
        '-days', '1', '-subj', '/CN=app.test', '-addext', 'subjectAltName=DNS:app.test,DNS:api.test'], { stdio: 'ignore' })
      const user = await createLocalUserForTests(`link_${randomUUID().slice(0, 8)}`, 'testpass123', 'Binding Test')
      const token = await createSession(user.id)
      const subject = `link-${randomUUID()}`
      const envKeys = ['NODE_ENV', 'PUBLIC_APP_ORIGIN', 'PUBLIC_API_BASE', 'CORS_ORIGIN'] as const
      const oldEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
      const realFetch = globalThis.fetch
      const requests: Array<{ path: string; cookie: boolean; method: string }> = []
      let challenge = ''
      let appOrigin = '', apiOrigin = ''
      let exchanges = 0
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (url === 'https://github.com/login/oauth/access_token' || url === 'https://oauth2.googleapis.com/token') {
          const body = provider === 'github' ? JSON.parse(String(init?.body)) : Object.fromEntries(new URLSearchParams(String(init?.body)))
          expect(body.code).toBe('test-code')
          expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(challenge)
          exchanges++
          return new Response(JSON.stringify({ access_token: 'simulated-provider-token' }))
        }
        if (url === 'https://api.github.com/user') return new Response(JSON.stringify({ id: subject, login: 'linked-github' }))
        if (url === 'https://api.github.com/user/emails') return new Response(JSON.stringify([]))
        if (url === 'https://openidconnect.googleapis.com/v1/userinfo') return new Response(JSON.stringify({ sub: subject, email: 'linked-google@example.test', email_verified: true }))
        return realFetch(input, init)
      }
      const server = createServer({ key: readFileSync(join(directory, 'key.pem')), cert: readFileSync(join(directory, 'cert.pem')) }, (req, res) => {
        void (async () => {
          const url = new URL(req.url ?? '/', apiOrigin)
          if (req.headers.host?.startsWith('api.test')) {
            requests.push({ path: url.pathname, cookie: !!readCookie(req.headers.cookie, SESSION_COOKIE), method: req.method ?? '' })
            const current = await validateSession(readCookie(req.headers.cookie, SESSION_COOKIE))
            res.setHeader('Access-Control-Allow-Origin', appOrigin)
            res.setHeader('Access-Control-Allow-Credentials', 'true')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
            if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
            if (url.pathname === '/api/auth/login') {
              res.setHeader('Set-Cookie', serializeSessionCookie(token!, { backendOrigin: apiOrigin, requestOrigin: req.headers.origin }))
            } else if (url.pathname.endsWith('/start')) {
              await handleOAuthStart(req, res, url, current); return
            } else if (url.pathname.endsWith('/callback')) {
              await handleOAuthCallback(req, res, url); return
            } else if (url.pathname.endsWith('/complete')) {
              await handleOAuthLinkComplete(req, res, url, current); return
            } else if (url.pathname === '/api/auth/identities') {
              await handleLinkedIdentities(req, res); return
            }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, user: current, enabled: false }))
            return
          }
          if (url.pathname === '/cookie-seed') {
            res.setHeader('Content-Type', 'text/html'); res.end('<html><body>Cookie setup</body></html>'); return
          }
          if (url.pathname === '/client/config.ts') {
            res.setHeader('Content-Type', 'text/javascript')
            res.end(`export const API_BASE=${JSON.stringify(apiOrigin)}; export const WS_BASE=''; export const SANDBOX_EXECUTOR='server';`)
            return
          }
          const upstream = await realFetch(`${FRONTEND_URL}${req.url}`, { redirect: 'manual' })
          res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'text/plain' })
          res.end(Buffer.from(await upstream.arrayBuffer()))
        })().catch(() => { res.writeHead(500); res.end('Local binding harness failed') })
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('missing HTTPS port')
      appOrigin = `https://app.test:${address.port}`
      apiOrigin = `https://api.test:${address.port}`
      process.env.NODE_ENV = 'production'
      process.env.PUBLIC_APP_ORIGIN = `${appOrigin}/`
      process.env.PUBLIC_API_BASE = apiOrigin
      process.env.CORS_ORIGIN = appOrigin
      const browser = await playwright.chromium.launch({ args: ['--host-resolver-rules=MAP app.test 127.0.0.1, MAP api.test 127.0.0.1', '--no-proxy-server'] })
      try {
        const context = await browser.newContext({ ignoreHTTPSErrors: true })
        const page = await context.newPage()
        await page.route(provider === 'github' ? 'https://github.com/login/oauth/authorize*' : 'https://accounts.google.com/o/oauth2/v2/auth*', async route => {
          const authorization = new URL(route.request().url())
          challenge = authorization.searchParams.get('code_challenge') ?? ''
          expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
          expect(challenge).toHaveLength(43)
          const params = new URLSearchParams({ state: authorization.searchParams.get('state')! })
          params.set(cancelled ? 'error' : 'code', cancelled ? 'access_denied' : 'test-code')
          await route.fulfill({ status: 302, headers: { Location: `${apiOrigin}/api/auth/oauth/${provider}/callback?${params}` }, body: '' })
        })
        await page.goto(`${appOrigin}/cookie-seed`)
        await page.evaluate(async api => { await fetch(`${api}/api/auth/login`, { method: 'POST', credentials: 'include' }) }, apiOrigin)
        expect((await context.cookies()).find(cookie => cookie.name === SESSION_COOKIE)?.partitionKey).toBe('https://app.test')
        await page.goto(`${appOrigin}/?page=settings`)
        await page.getByRole('button', { name: provider === 'github' ? '绑定 GitHub' : '绑定 Google' }).click()
        if (cancelled) {
          await expect(page.getByRole('alert')).toContainText('授权已取消')
          expect(await findIdentity(provider, subject)).toBeNull()
          expect(exchanges).toBe(0)
        } else {
          await expect(page.getByRole('status')).toHaveText('账号绑定成功')
          await expect(page.getByText(provider === 'github' ? 'linked-github' : 'linked-google@example.test', { exact: true })).toBeVisible()
          expect(await findIdentity(provider, subject)).toEqual({ userId: user.id })
          expect(exchanges).toBe(1)
        }
        expect(new URL(page.url()).search).toBe('?page=settings')
        expect(new URL(page.url()).hash).toBe('')
        const forPath = (suffix: string) => requests.find(request => request.method !== 'OPTIONS' && request.path.endsWith(suffix))
        expect(forPath('/me')?.cookie).toBe(true)
        expect(forPath('/start')?.cookie).toBe(true)
        expect(forPath('/callback')?.cookie).toBe(false)
        expect(forPath('/complete')?.cookie).toBe(true)
        await testInfo.attach('cookie-boundaries', { body: JSON.stringify(requests, null, 2), contentType: 'application/json' })
      } finally {
        await browser.close()
        await new Promise<void>(resolve => server.close(() => resolve()))
        globalThis.fetch = realFetch
        for (const key of envKeys) {
          if (oldEnv[key] === undefined) delete process.env[key]
          else process.env[key] = oldEnv[key]
        }
        await getDb().prepare('DELETE FROM auth_identities WHERE user_id = ?').run(user.id)
        await getDb().prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id)
        await getDb().prepare('DELETE FROM users WHERE id = ?').run(user.id)
        rmSync(directory, { recursive: true, force: true })
      }
    })
  }
}
