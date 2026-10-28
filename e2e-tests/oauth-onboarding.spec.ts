import { expect, devices, type BrowserContext, type Request } from '@playwright/test'
import { createServer } from 'node:https'
import { createServer as createHttpServer } from 'node:http'
import { connect, type Socket } from 'node:net'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from './server-fixtures'
import { BACKEND_URL, FRONTEND_URL } from './fixtures'
import { validateSession } from '../server/auth'
import { ONBOARDING_COOKIE, SESSION_COOKIE, readCookie } from '../server/auth-cookies'
import { handleOAuthStart, handleOAuthCallback, handleOnboardingComplete, handleRegistrationPolicy } from '../server/oauth/handler'
import { findIdentity, getOnboardingTicket } from '../server/oauth/store'

test('OAuth login and registration navigate from an insecure HTTP LAN origin', async ({ playwright }) => {
  let origin = ''
  const starts: Array<{ provider: string; intent: string | null; hasChallenge: boolean }> = []
  const errors: string[] = []
  const server = createHttpServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', origin)
      if (url.pathname === '/client/config.ts') {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(`export const API_BASE=${JSON.stringify(origin)};export const WS_BASE='';export const SANDBOX_EXECUTOR='server';`)
        return
      }
      if (url.pathname.endsWith('/start')) {
        starts.push({ provider: url.pathname.split('/')[4] ?? '', intent: url.searchParams.get('intent'), hasChallenge: url.searchParams.has('onboardingChallenge') })
        res.setHeader('Content-Type', 'text/html')
        res.end('<h1>OAuth start reached</h1>')
        return
      }
      const upstream = await fetch(`${url.pathname.startsWith('/api/') ? BACKEND_URL : FRONTEND_URL}${req.url}`, { redirect: 'manual' })
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'text/plain' })
      res.end(Buffer.from(await upstream.arrayBuffer()))
    })().catch(error => {
      errors.push(error instanceof Error ? error.message : String(error))
      if (!res.headersSent) res.writeHead(500)
      res.end('HTTP navigation failed')
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing HTTP test port')
  origin = `http://lan.agricola.test:${address.port}`
  const browser = await playwright.chromium.launch({ args: ['--host-resolver-rules=MAP lan.agricola.test 127.0.0.1', '--no-proxy-server'] })
  try {
    const page = await browser.newPage()
    await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
    for (const provider of ['github', 'google'] as const) {
      for (const intent of ['login', 'register'] as const) {
        await page.goto(`${origin}/?page=login&authMode=${intent}`, { waitUntil: 'domcontentloaded' })
        expect(await page.evaluate(() => ({ secure: isSecureContext, digest: !!crypto.subtle }))).toEqual({ secure: false, digest: false })
        await page.locator(`a[href*="/api/auth/oauth/${provider}/start"][href*="intent=${intent}"]`).click()
        await expect(page.getByRole('heading', { name: 'OAuth start reached' })).toBeVisible()
      }
    }
    expect(starts).toEqual([
      { provider: 'github', intent: 'login', hasChallenge: false },
      { provider: 'github', intent: 'register', hasChallenge: false },
      { provider: 'google', intent: 'login', hasChallenge: false },
      { provider: 'google', intent: 'register', hasChallenge: false },
    ])
    expect(errors).toEqual([])
  } finally {
    await browser.close()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

// Persistent WebKit contexts enforce ITP; a default temporary context permits the cookie that #1406 loses.
for (const provider of ['github', 'google'] as const) {
  for (const mode of ['cross-site-itp', 'cross-site-allow', 'same-site-itp', 'cross-site-chromium'] as const) {
    test(`${provider} registration: ${mode}`, async ({ playwright }, testInfo) => {
      const appPath = mode === 'same-site-itp' ? '/' : '/open-agricola/'
      const directory = mkdtempSync(join(tmpdir(), 'agricola-onboarding-'))
      execFileSync('openssl', [
        'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'),
        '-days', '1', '-subj', '/CN=app.test',
        '-addext', 'subjectAltName=DNS:app.test,DNS:api.test,DNS:app.agricola.test,DNS:api.agricola.test',
      ], { stdio: 'ignore' })
      const subject = `onboarding-${randomUUID()}`
      const username = `iphone_${randomUUID().slice(0, 8)}`
      const password = 'local-onboarding-password-826'
      const keys = ['NODE_ENV', 'PUBLIC_APP_ORIGIN', 'PUBLIC_API_BASE', 'CORS_ORIGIN', 'ACCOUNT_REGISTRATION_POLICY'] as const
      const previousEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]))
      const realFetch = globalThis.fetch
      let appOrigin = ''
      let apiOrigin = ''
      let ticket = ''
      let completionCookie = false
      let ticketValidOnCompletion = false
      let completionBody: unknown
      const serverErrors: string[] = []
      const browserErrors: string[] = []

      // Only the external provider is substituted. Site UI, handlers, database and cookie policy are real.
      globalThis.fetch = async (input, init) => {
        const url = String(input)
        if (url === 'https://github.com/login/oauth/access_token' || url === 'https://oauth2.googleapis.com/token') {
          return new Response(JSON.stringify({ access_token: 'simulated-onboarding-token' }))
        }
        if (url === 'https://api.github.com/user') return new Response(JSON.stringify({ id: subject, login: username }))
        if (url === 'https://api.github.com/user/emails') {
          return new Response(JSON.stringify([{ email: `${username}@example.test`, primary: true, verified: true }]))
        }
        if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
          return new Response(JSON.stringify({ sub: subject, email: `${username}@example.test`, email_verified: true }))
        }
        return realFetch(input, init)
      }
      const server = createServer({
        key: readFileSync(join(directory, 'key.pem')), cert: readFileSync(join(directory, 'cert.pem')),
      }, (req, res) => {
        void (async () => {
          const url = new URL(req.url ?? '/', appOrigin)
          if (req.headers.host === 'github.com' || req.headers.host === 'accounts.google.com') {
            const callback = new URL(url.searchParams.get('redirect_uri') ?? apiOrigin)
            callback.searchParams.set('state', url.searchParams.get('state') ?? '')
            callback.searchParams.set('code', 'simulated-test-code')
            res.setHeader('Content-Type', 'text/html')
            res.end(`<a href="${callback.toString().replaceAll('&', '&amp;')}">Authorize local registration</a>`)
            return
          }
          if (req.headers.host?.startsWith('api.')) {
            res.setHeader('Access-Control-Allow-Origin', appOrigin)
            res.setHeader('Access-Control-Allow-Credentials', 'true')
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
            res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
            if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }
            if (url.pathname === '/cookie-seed') {
              res.writeHead(302, {
                'Set-Cookie': 'unpartitioned_probe=1; HttpOnly; Secure; SameSite=None; Path=/',
                Location: `${appOrigin}${appPath}?page=login&authMode=register&bg=none`,
              })
              res.end()
              return
            }
            if (url.pathname === '/cookie-partitioned') {
              res.setHeader('Set-Cookie', 'partitioned_probe=1; HttpOnly; Secure; SameSite=None; Partitioned; Path=/')
              res.end()
              return
            }
            if (url.pathname === '/cookie-check') {
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({
                unpartitioned: !!readCookie(req.headers.cookie, 'unpartitioned_probe'),
                partitioned: !!readCookie(req.headers.cookie, 'partitioned_probe'),
              }))
              return
            }
            if (url.pathname.endsWith('/start')) { await handleOAuthStart(req, res, url, null); return }
            if (url.pathname.endsWith('/callback')) {
              await handleOAuthCallback(req, res, url)
              const location = String(res.getHeader('Location'))
              ticket = new URLSearchParams(new URL(location).hash.slice(1)).get('onboardingTicket') ?? ''
              return
            }
            if (url.pathname === '/api/auth/onboarding/complete') {
              if (!completionBody) {
                completionCookie = !!readCookie(req.headers.cookie, ONBOARDING_COOKIE)
                ticketValidOnCompletion = !!await getOnboardingTicket(ticket)
              }
              await handleOnboardingComplete(req, res)
              return
            }
            if (url.pathname === '/api/auth/registration-policy') {
              // A slow response exposes navigation that cancels the previous page's policy fetch.
              await new Promise(resolve => setTimeout(resolve, 500))
              handleRegistrationPolicy(req, res)
              return
            }
            if (url.pathname === '/api/auth/me') {
              const user = await validateSession(readCookie(req.headers.cookie, SESSION_COOKIE))
              res.writeHead(user ? 200 : 401, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify(user ? { ok: true, user } : { ok: false, code: 'not_authenticated' }))
              return
            }
            res.setHeader('Content-Type', 'application/json')
            if (mode === 'same-site-itp' && ['/api/rooms', '/api/lobby/my-rooms'].includes(url.pathname)) {
              // Expose navigation that interrupts a lobby response after its headers arrive.
              res.setHeader('Cache-Control', 'no-store')
              res.write('{"ok":true,')
              await new Promise(resolve => setTimeout(resolve, 500))
              res.end('"rooms":[],"games":[],"enabled":false}')
              return
            }
            res.end(JSON.stringify({ ok: true, rooms: [], games: [], enabled: false }))
            return
          }
          if (url.pathname === '/client/config.ts') {
            res.setHeader('Content-Type', 'text/javascript')
            res.end(`export const API_BASE=${JSON.stringify(apiOrigin)};export const WS_BASE='';export const SANDBOX_EXECUTOR='server';`)
            return
          }
          const upstream = await realFetch(`${FRONTEND_URL}${req.url}`, { redirect: 'manual' })
          res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'text/plain' })
          res.end(Buffer.from(await upstream.arrayBuffer()))
        })().catch(error => {
          serverErrors.push(error instanceof Error ? error.message : String(error))
          if (!res.headersSent) res.writeHead(500)
          res.end('Local registration failed')
        })
      })
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Missing HTTPS test port')
      const sameSite = mode === 'same-site-itp'
      appOrigin = `https://${sameSite ? 'app.agricola.test' : 'app.test'}:${address.port}`
      apiOrigin = `https://${sameSite ? 'api.agricola.test' : 'api.test'}:${address.port}`
      const sockets = new Set<Socket>()
      const proxy = createHttpServer()
      proxy.on('connect', (request, socket, head) => {
        const target = new URL(`http://${request.url}`)
        const local = ['app.test', 'api.test', 'app.agricola.test', 'api.agricola.test', 'github.com', 'accounts.google.com'].includes(target.hostname)
        const upstream = connect(local ? address.port : Number(target.port) || 443, local ? '127.0.0.1' : target.hostname, () => {
          socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
          if (head.length) upstream.write(head)
          socket.pipe(upstream)
          upstream.pipe(socket)
        })
        for (const endpoint of [socket, upstream]) {
          sockets.add(endpoint)
          endpoint.on('close', () => sockets.delete(endpoint))
          endpoint.on('error', () => endpoint.destroy())
        }
      })
      await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve))
      const proxyAddress = proxy.address()
      if (!proxyAddress || typeof proxyAddress === 'string') throw new Error('Missing proxy test port')
      process.env.NODE_ENV = 'production'
      process.env.PUBLIC_APP_ORIGIN = `${appOrigin}${appPath}`
      process.env.PUBLIC_API_BASE = apiOrigin
      process.env.CORS_ORIGIN = appOrigin
      process.env.ACCOUNT_REGISTRATION_POLICY = 'open'
      let context: BrowserContext | undefined
      try {
        const browserType = mode === 'cross-site-chromium' ? playwright.chromium : playwright.webkit
        context = await browserType.launchPersistentContext(join(directory, 'browser-profile'), {
          ...devices['iPhone 13'], ignoreHTTPSErrors: true,
          args: mode === 'cross-site-chromium' ? ['--test-third-party-cookie-phaseout']
            : mode === 'cross-site-allow' ? ['--cookies-policy=always'] : ['--enable-itp', '--cookies-policy=no-third-party'],
          proxy: { server: `http://127.0.0.1:${proxyAddress.port}` },
        })
        const page = await context.newPage()
        if (mode === 'cross-site-chromium') {
          const cdp = await context.newCDPSession(page)
          await cdp.send('Network.enable')
          await cdp.send('Network.setCookieControls', { enableThirdPartyCookieRestriction: true })
        }
        await page.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'zh'))
        const isLobby = (raw: string) => {
          const url = new URL(raw)
          return url.origin === apiOrigin && ['/api/rooms', '/api/lobby/my-rooms'].includes(url.pathname)
        }
        page.on('pageerror', error => browserErrors.push(error.message))
        const policyRequests = new Set<Request>()
        const lobbyRequests = new Set<Request>()
        page.on('request', request => {
          if (request.url() === `${apiOrigin}/api/auth/registration-policy`) policyRequests.add(request)
          if (isLobby(request.url())) lobbyRequests.add(request)
        })
        page.on('requestfinished', request => { policyRequests.delete(request); lobbyRequests.delete(request) })
        page.on('requestfailed', request => {
          if (policyRequests.delete(request)) browserErrors.push(request.failure()?.errorText ?? 'Registration policy request failed')
          if (lobbyRequests.delete(request)) browserErrors.push(request.failure()?.errorText ?? 'Lobby request failed')
        })
        const loadPolicyPage = async (navigate: () => Promise<unknown>) => {
          const response = page.waitForResponse(`${apiOrigin}/api/auth/registration-policy`)
          await navigate()
          const policy = await response
          expect(policy.status()).toBe(200)
          expect(await policy.json()).toEqual({ ok: true, policy: 'open' })
          await expect.poll(() => policyRequests.size).toBe(0)
        }
        const loadLobbyPage = async (navigate: () => Promise<unknown>) => {
          const responses = Promise.all(['/api/rooms', '/api/lobby/my-rooms']
            .map(path => page.waitForResponse(`${apiOrigin}${path}`)))
          const [, loaded] = await Promise.all([navigate(), responses])
          for (const response of loaded) {
            expect(response.status()).toBe(200)
            expect(await response.json()).toMatchObject({ ok: true })
          }
          await expect(page.getByRole('button', { name: '创建多人游戏', exact: true })).toBeVisible()
          await expect.poll(() => lobbyRequests.size).toBe(0)
        }
        await loadPolicyPage(() => page.goto(`${apiOrigin}/cookie-seed`, { waitUntil: 'domcontentloaded' }))
        const cookieSupport = await page.evaluate(async origin => {
          await fetch(`${origin}/cookie-partitioned`, { credentials: 'include' })
          return (await fetch(`${origin}/cookie-check`, { credentials: 'include' })).json()
        }, apiOrigin)
        expect(cookieSupport.unpartitioned).toBe(mode === 'cross-site-allow' || sameSite)
        if (mode === 'cross-site-chromium') expect(cookieSupport.partitioned).toBe(true)
        const supportsSession = cookieSupport.partitioned || sameSite || mode === 'cross-site-allow'
        await page.locator(`a[href*="/api/auth/oauth/${provider}/start"][href*="intent=register"]`).click()
        await loadPolicyPage(() => page.getByRole('link', { name: 'Authorize local registration' }).click())
        await expect(page.locator('#onboarding-username')).toBeVisible()
        await expect(page).not.toHaveURL(/onboardingTicket/)
        expect(ticket).toMatch(/^[\w-]{43}$/)
        await loadPolicyPage(() => page.reload({ waitUntil: 'domcontentloaded' }))
        await page.locator('#onboarding-username').fill(username)
        await page.locator('#onboarding-password').fill(password)
        await page.locator('#onboarding-confirm-password').fill(password)
        const completion = page.waitForResponse(response => response.url() === `${apiOrigin}/api/auth/onboarding/complete` && response.request().method() === 'POST')
        const submitRegistration = () => page.getByRole('button', { name: '完成注册', exact: true }).click()
        if (supportsSession) await loadLobbyPage(submitRegistration)
        else await submitRegistration()
        const response = await completion
        completionBody = response.request().postDataJSON()
        expect(response.status()).toBe(200)
        expect(completionCookie).toBe(false)
        expect(ticketValidOnCompletion).toBe(true)
        const identity = await findIdentity(provider, subject)
        expect(identity).not.toBeNull()
        expect(await getOnboardingTicket(ticket)).toBeNull()
        if (!supportsSession) {
          // WPE's libsoup port cannot exercise Safari's CHIPS session support. Registration remains a real ITP regression.
          expect(process.platform).toBe('linux')
          testInfo.annotations.push({ type: 'limitation', description: 'Linux WPE lacks CHIPS: account creation is verified; iPhone session acceptance remains a device check.' })
          await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
        }
        if (supportsSession) await loadLobbyPage(() => page.reload({ waitUntil: 'domcontentloaded' }))
        else await page.reload({ waitUntil: 'domcontentloaded' })
        const me = await page.evaluate(async origin => (await fetch(`${origin}/api/auth/me`, { credentials: 'include' })).json(), apiOrigin)
        if (supportsSession) expect(me).toMatchObject({ ok: true, user: { id: identity?.userId, username } })
        else expect(me).toMatchObject({ ok: false, code: 'not_authenticated' })
        const replay = await page.evaluate(async ({ origin, body }) => {
          const result = await fetch(`${origin}/api/auth/onboarding/complete`, {
            method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
          })
          return { status: result.status, code: (await result.json()).code }
        }, { origin: apiOrigin, body: completionBody })
        expect(replay).toEqual({ status: 400, code: 'oauth_onboarding_expired' })
        expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('open-agricola-onboarding-')))).toEqual([])
        if (sameSite) {
          expect(new URL(page.url()).origin).toBe(appOrigin)
          expect(new URL(page.url()).pathname).toBe('/')
          expect((await context.cookies(apiOrigin)).find(cookie => cookie.name === SESSION_COOKIE)).toMatchObject({
            domain: new URL(apiOrigin).hostname, sameSite: 'Lax', secure: true, httpOnly: true,
          })
          await expect.poll(() => lobbyRequests.size).toBe(0)
          await context.clearCookies()
          await page.goto(`${appOrigin}/?page=login`, { waitUntil: 'domcontentloaded' })
          await expect(page.locator('#username')).toBeVisible()
          await page.locator(`a[href*="/api/auth/oauth/${provider}/start"][href*="intent=login"]`).click()
          await loadLobbyPage(() => page.getByRole('link', { name: 'Authorize local registration' }).click())
          await loadLobbyPage(() => page.reload({ waitUntil: 'domcontentloaded' }))
          expect(new URL(page.url()).origin).toBe(appOrigin)
          expect(new URL(page.url()).pathname).toBe('/')
          expect(await page.evaluate(async origin => (await fetch(`${origin}/api/auth/me`, { credentials: 'include' })).json(), apiOrigin))
            .toMatchObject({ ok: true, user: { id: identity?.userId, username } })
        }
        expect(serverErrors).toEqual([])
        expect(browserErrors).toEqual([])
        await testInfo.attach('registration-evidence', {
          body: JSON.stringify({ provider, mode, cookieSupport, completionCookie, ticketValidOnCompletion, status: response.status(), sessionSurvivedReload: me.ok, replay }),
          contentType: 'application/json',
        })
        await page.screenshot({ path: testInfo.outputPath('registered.png'), fullPage: true })
      } finally {
        if (context) await context.close()
        for (const socket of sockets) socket.destroy()
        await new Promise<void>(resolve => proxy.close(() => resolve()))
        await new Promise<void>(resolve => server.close(() => resolve()))
        globalThis.fetch = realFetch
        for (const key of keys) {
          if (previousEnv[key] === undefined) delete process.env[key]
          else process.env[key] = previousEnv[key]
        }
        rmSync(directory, { recursive: true, force: true })
      }
    })
  }
}
