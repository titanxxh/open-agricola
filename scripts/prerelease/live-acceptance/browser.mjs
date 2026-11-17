// Owner-only browser helpers for live prerelease acceptance. They log labels, statuses and timings only.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { configureOwnerVerification } from '../owner-browser.ts'

export const sleep = ms => new Promise(done => setTimeout(done, ms))

/** Firefox can leave evaluate() pending forever on blocked frames; every evaluation is bounded and recorded. */
export function bounded(promise, ms, label, fallback, hung) {
  let timer
  return Promise.race([promise.finally(() => clearTimeout(timer)), new Promise(done => { timer = setTimeout(() => { hung?.push(label); done(fallback) }, ms) })])
}

/**
 * Held sockets the page itself saw open just before an action, and when the last of them closed. Both times come
 * from the page clock. A watched socket missing from the rows (replaced document or hung evaluation) is unobserved:
 * it proves neither a close nor survival.
 */
export function snapshotCut(rows, snapshot) {
  const watched = snapshot.ids.map(id => rows[id])
  const unobserved = watched.some(row => row === undefined)
  const seen = watched.length > 0 && !unobserved
  return { connectedAtStart: watched.length, closedAfterMs: seen && watched.every(row => row.closedAt !== null) ? Math.max(...watched.map(row => row.closedAt - snapshot.pageNow)) : null,
    stillOpen: seen && watched.every(row => row.closedAt === null), codes: watched.map(row => row?.code ?? null), ...(unobserved ? { unobserved: true } : {}) }
}

/**
 * Retries once only when no HTTP response arrived (timeout or connection failure) and records why. A received
 * status is never retried, so an assertion still sees the first answer the server gave.
 */
export async function retryWithoutResponse(request, label, retries) {
  try { return await request() } catch (error) {
    retries.push(`${label}: ${String(error?.message ?? error).split('\n')[0].slice(0, 120)}`)
    return request()
  }
}

export async function poll(read, expected, timeout = 30_000, label = 'poll') {
  const end = Date.now() + timeout; let last
  for (;;) {
    last = await read()
    if (JSON.stringify(last) === JSON.stringify(expected)) return last
    if (Date.now() > end) throw new Error(`${label}: expected ${JSON.stringify(expected)}, saw ${JSON.stringify(last)?.slice(0, 120)}`)
    await sleep(250)
  }
}
export const pollTrue = (read, timeout = 30_000, label = 'condition') => poll(async () => !!(await read()), true, timeout, label)

/** One kit per run: origins, bindings and accounts come from the private acceptance config and prepared bindings. */
export function createKit({ origins, formalBuild, bindings, accounts, ownerCookie, loginBudget = null }) {
  const { pre, formalApp, formalApi } = origins
  const preHost = new URL(pre).host, binding = { build: bindings.candidateSha, generation: bindings.generation }
  const wsUrl = `wss://${preHost}/nodes/${bindings.instanceId}/ws`
  const goodProtocols = ['oa.browser.v2', `oa.pre.build.${binding.build}`, `oa.pre.generation.${binding.generation}`]
  const formalHeaders = { Origin: formalApp, 'x-oa-browser-protocol': '2' }
  const labels = new Map(accounts.map(a => [a.id, a.label]))
  const hung = [], retries = []
  const label = id => id == null ? null : labels.get(id) ?? 'other'
  const cookie = readFileSync(ownerCookie, 'utf8').trim()
  if (!/^__Host-oa-session=[A-Za-z0-9._~-]+$/.test(cookie)) throw new Error('Invalid formal owner cookie file')

  async function publicIsClosed() {
    const response = await fetch(pre + '/open-agricola/', { redirect: 'error', signal: AbortSignal.timeout(15_000) })
    assert.equal(response.status, 503); assert.equal(response.headers.has('set-cookie'), false)
  }
  /** Retries only network errors; any non-503 answer is a failure, never retried away. */
  async function publicStillClosed(report) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await publicIsClosed(); return true } catch (error) {
        report.publicCheckErrors = [...(report.publicCheckErrors ?? []), `${error.name}: ${String(error.message).slice(0, 120)}`]
        if (error.name === 'AssertionError') return false
        await sleep(3000)
      }
    }
    return false
  }
  async function betaAccess(action, account) {
    const headers = { Origin: formalApp, Cookie: cookie, 'x-oa-browser-protocol': '2', 'Content-Type': 'application/json' }
    const call = (method, body) => fetch(formalApi + '/api/admin/beta-access', { method, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) })
    if (action !== 'list') { const response = await call(action === 'grant' ? 'PUT' : 'DELETE', { userId: account.id }); assert.equal(response.status, 200, `Beta ${action}`) }
    const text = await (await call('GET')).text()
    return { action, account: account.label, beta: text.includes(`"${account.id}"`), at: new Date().toISOString() }
  }
  /** The read-only guard blocks game operations and foreign navigation for boundary runs. */
  async function readOnlyGuard(context) {
    const blocked = []
    await context.exposeBinding('__oaPrivateAcceptanceBlocked', () => { blocked.push('websocket') })
    await context.addInitScript(({ pre, formalApi }) => {
      localStorage.setItem('open-agricola-locale-v2', 'en')
      const Native = window.WebSocket
      window.__oaNativeWebSocket = Native
      window.WebSocket = class extends Native {
        constructor(url, protocols) {
          const parsed = new URL(url, location.href), api = location.origin === pre ? pre : formalApi
          const expected = new URL(api); expected.protocol = 'wss:'
          if (parsed.origin !== expected.origin || !/^\/(?:nodes\/[A-Za-z0-9-]+\/)?ws$/.test(parsed.pathname) || parsed.search || parsed.hash) {
            void window.__oaPrivateAcceptanceBlocked(); throw new Error('Read-only acceptance blocked a foreign socket')
          }
          super(url, protocols)
        }
        send(data) {
          let message; try { message = JSON.parse(String(data)) } catch { message = null }
          if (!['auth', 'getCommandScope', 'getCommandReceipt', 'getState', 'getHistory', 'getGameEndProposal', 'quoteFenceSelection'].includes(message?.type)) {
            void window.__oaPrivateAcceptanceBlocked(); throw new Error('Read-only acceptance blocked a game operation')
          }
          super.send(data)
        }
      }
    }, { pre, formalApi })
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method()
      if (request.isNavigationRequest() && ![formalApp, pre].includes(url.origin)) { blocked.push('foreign-navigation'); await route.abort('blockedbyclient'); return }
      const formalPost = url.origin === formalApi && ['/api/auth/login', '/api/auth/logout', '/api/prerelease/handoffs', '/api/observability/telemetry'].includes(url.pathname)
      const prePost = url.origin === pre && ['/api/prerelease/session', '/api/auth/logout', '/api/observability/telemetry'].includes(url.pathname)
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !(method === 'POST' && !url.search && !url.hash && (formalPost || prePost))) { blocked.push('http'); await route.abort('blockedbyclient'); return }
      await route.continue()
    })
    return blocked
  }
  /** Read-only boundary context; request interception makes Playwright report cookies, so never measure credentials here. */
  async function boundaryContext(browser) {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } })
    const blocked = await readOnlyGuard(context)
    if (bindings.verificationTokenFile) await configureOwnerVerification(context, pre, bindings.verificationTokenFile, error => retries.push(`owner verification: ${String(error?.message ?? error).split('\n')[0].slice(0, 120)}`))
    return { context, blocked }
  }
  /** Game context without interception (#1756): foreign main-frame navigations are recorded instead of blocked. */
  async function gameContext(browser) {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 960 } })
    await context.addInitScript(() => { localStorage.setItem('open-agricola-locale-v2', 'en'); window.__oaNativeWebSocket = window.WebSocket })
    const foreign = []
    context.on('page', page => page.on('framenavigated', frame => {
      try { const origin = new URL(frame.url()).origin; if (frame === page.mainFrame() && /^https?:/.test(origin) && ![formalApp, pre].includes(origin)) foreign.push(origin) } catch {}
    }))
    if (bindings.verificationTokenFile) await configureOwnerVerification(context, pre, bindings.verificationTokenFile, error => retries.push(`owner verification: ${String(error?.message ?? error).split('\n')[0].slice(0, 120)}`))
    return { context, foreign }
  }
  async function login(page, actor, armCleanup) {
    const response = await page.goto(formalApp, { waitUntil: 'domcontentloaded', timeout: 30_000 }); assert.equal(response.status(), 200)
    const live = await page.evaluate(async api => {
      const [frontend, policy] = await Promise.all([fetch('/frontend-build.json', { cache: 'no-store' }), fetch(api + '/api/auth/browser-policy', { cache: 'no-store' })])
      return { frontend: await frontend.json(), policy: await policy.json() }
    }, formalApi)
    assert.equal(live.frontend.gameBuildId, formalBuild); assert.equal(live.policy.buildId, formalBuild); assert.equal(live.policy.version, 2)
    await page.locator('#username').fill(actor.username); await page.locator('#password').fill(actor.password)
    // Every login takes a slot of the window's shared budget; a 429 waits out the server window and submits again.
    for (let attempt = 1; ; attempt++) {
      await loginBudget?.take()
      const request = page.waitForResponse(r => r.url() === formalApi + '/api/auth/login' && r.request().method() === 'POST', { timeout: 20_000 }).then(response => ({ response }), error => ({ error }))
      armCleanup()
      try { await page.locator('form:has(#password) button[type=submit]').click() } catch (error) { await request; throw error }
      const observed = await request
      if (observed.error) throw observed.error
      if (observed.response.status() === 429 && loginBudget && attempt < 3) { retries.push('formal login: 429, waited for the authentication window'); await loginBudget.rejected(); continue }
      assert.equal(observed.response.status(), 200)
      break
    }
    await page.locator('#password').waitFor({ state: 'detached' })
  }
  /** The banner renders on the handoff page before the session exchange; wait for the exchange itself. */
  async function handoff(page) {
    const exchanged = page.waitForResponse(r => r.url() === pre + '/api/prerelease/session' && r.request().method() === 'POST', { timeout: 60_000 })
    await page.goto(pre + '/open-agricola/auth/start', { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const exchange = await exchanged.catch(error => {
      // Name the hop that stalled without copying a query string that may carry a grant.
      const at = new URL(page.url()), host = at.host === preHost ? 'pre' : at.origin === formalApp ? 'formal-app' : at.protocol === 'about:' ? 'about' : 'other'
      throw new Error(`session exchange not observed; page at ${host}${at.pathname}: ${String(error.message).split('\n')[0]}`)
    })
    assert.equal(exchange.status(), 200)
    await page.locator('.prerelease-banner').waitFor({ state: 'visible', timeout: 30_000 })
    return exchange.status()
  }
  async function enterPre(page, actor, side) {
    if (!side.formal || await formalMe(page.context()) !== 200) { await login(page, actor, () => { side.logged = true }); side.formal = true }
    await handoff(page)
  }
  /** A JSON document on the pre origin runs no app code; probes from it are same-origin requests. */
  async function probePage(context) {
    const page = await context.newPage(); page.setDefaultTimeout(20_000)
    const response = await page.goto(pre + '/api/prerelease/runtime', { waitUntil: 'domcontentloaded' }); assert.equal(response.status(), 200)
    return page
  }
  async function preFetch(page, path, bind = binding, options = {}) {
    const value = await bounded(page.evaluate(async ({ path, bind, options }) => {
      const headers = {}
      if (options.protocol !== null) headers['x-oa-browser-protocol'] = options.protocol ?? '2'
      if (bind) { headers['x-oa-pre-build'] = bind.build; headers['x-oa-pre-generation'] = bind.generation }
      try {
        const response = await fetch(path, { method: options.method ?? 'GET', credentials: 'include', headers, cache: 'no-store' })
        const body = await response.json().catch(() => null)
        return { status: response.status, code: typeof body?.code === 'string' && /^[a-z_]{1,64}$/.test(body.code) ? body.code : null, user: body?.user?.id ?? null }
      } catch { return { status: 0, code: 'network-error', user: null } }
    }, { path, bind, options }), 30_000, `fetch ${path}`, { status: 0, code: 'evaluate-hung', user: null }, hung)
    return { ...value, user: label(value.user) }
  }
  function wsProbe(page, url, protocols, holdMs = 2500) {
    return bounded(page.evaluate(({ url, protocols, holdMs }) => new Promise(done => {
      const started = Date.now(), result = { opened: false, closeCode: null, serverClosedMs: null, error: false }
      let ws; try { ws = new window.__oaNativeWebSocket(url, protocols) } catch { done({ ...result, constructorThrew: true }); return }
      const finish = () => { try { ws.close() } catch {} done(result) }
      ws.onopen = () => { result.opened = true; setTimeout(finish, holdMs) }
      ws.onerror = () => { result.error = true }
      ws.onclose = event => { result.closeCode = event.code; result.serverClosedMs = Date.now() - started; done(result) }
      setTimeout(finish, 15_000)
    }), { url, protocols, holdMs }), 30_000, 'ws probe', { opened: false, closeCode: null, serverClosedMs: null, error: true, hung: true }, hung)
  }
  function holdSocket(page) {
    return bounded(page.evaluate(({ url, protocols }) => new Promise(done => {
      window.__oaHeld ??= []; window.__oaHeldSockets ??= []; const row = { openedAt: null, closedAt: null, code: null }; window.__oaHeld.push(row)
      const ws = new window.__oaNativeWebSocket(url, protocols); window.__oaHeldSockets.push(ws)
      ws.onopen = () => { row.openedAt = Date.now(); done(true) }
      ws.onclose = event => { row.closedAt = Date.now(); row.code = event.code; done(row.openedAt !== null) }
      setTimeout(() => done(row.openedAt !== null), 10_000)
    }), { url: wsUrl, protocols: goodProtocols }), 30_000, 'hold socket', false, hung)
  }
  /** Take immediately before the action: the held sockets the page reports OPEN, with the page clock. */
  async function liveSockets(page) {
    const snapshot = await bounded(page.evaluate(() => ({ pageNow: Date.now(), ids: (window.__oaHeldSockets ?? []).flatMap((ws, id) => ws.readyState === 1 ? [id] : []) })),
      15_000, 'live sockets', { pageNow: null, ids: [] }, hung)
    return { ...snapshot, takenAt: Date.now() }
  }
  /** Waits (up to waitMs after the snapshot) for every socket in it to close, then reports the cut on the page clock. */
  async function heldCut(page, snapshot, waitMs = 35_000) {
    for (;;) {
      const rows = await bounded(page.evaluate(() => window.__oaHeld ?? []), 15_000, 'held rows', [], hung)
      const cut = snapshotCut(rows, snapshot)
      if (cut.closedAfterMs !== null || cut.unobserved || Date.now() - snapshot.takenAt >= waitMs) return cut
      await sleep(250)
    }
  }
  async function preCookieDigest(context) {
    const rows = (await context.cookies(pre)).filter(c => c.name === '__Host-oa-pre-session')
    return rows.length === 1 ? createHash('sha256').update(rows[0].value).digest('hex') : null
  }
  /** Polls an idle authorized read every second; returns ms from t0 until the first non-200. */
  async function untilDenied(probe, t0, limitMs = 45_000) {
    for (;;) {
      const observed = await preFetch(probe, '/api/auth/me')
      if (observed.status !== 200) return { deniedAfterMs: Date.now() - t0, status: observed.status, code: observed.code }
      if (Date.now() - t0 > limitMs) return { deniedAfterMs: null, status: 200, code: null }
      await sleep(1000)
    }
  }
  const formalPost = async (context, path) => (await context.request.post(formalApi + path, { headers: formalHeaders, timeout: 15_000 })).status()
  const formalMe = async context => (await retryWithoutResponse(() => context.request.get(formalApi + '/api/auth/me', { headers: formalHeaders, timeout: 15_000 }), 'formal me', retries)).status()
  /** Records game socket frames; a reload replaces the document, whose sockets Playwright may never report closed. */
  function observeGameSocket(page) {
    const states = [], joins = [], sockets = []
    page.on('domcontentloaded', () => { const now = Date.now(); for (const s of sockets) if (s.closedAt === null && s.documentEndedAt === undefined && s.openedAt < now) s.documentEndedAt = now })
    page.on('websocket', socket => {
      const row = { host: new URL(socket.url()).host, openedAt: Date.now(), closedAt: null }
      sockets.push(row); socket.on('close', () => { row.closedAt = Date.now() })
      socket.on('framereceived', frame => { try { const event = JSON.parse(String(frame.payload)); if (event.type === 'stateUpdate') states.push(event); if (event.type === 'roomJoined') joins.push(event) } catch {} })
    })
    return { states, joins, sockets: () => sockets.filter(s => s.host === preHost), latest: () => states.at(-1) }
  }
  async function openGameEndControls(page) {
    const controls = page.locator('.header-menu').getByRole('region', { name: 'End game', exact: true })
    const menu = page.locator('.header-compact').getByRole('button', { name: 'Menu', exact: true })
    for (let i = 0; i < 10 && await controls.isHidden(); i++) { await menu.click(); await sleep(500) }
    await controls.waitFor({ state: 'visible' }); return controls
  }
  /** Proposing asks for window.confirm; Playwright would dismiss it and nothing would be sent. */
  async function endByAgreement(proposer, agreeing) {
    proposer.once('dialog', dialog => { void dialog.accept() })
    await (await openGameEndControls(proposer)).getByRole('button', { name: 'Propose ending the game', exact: true }).click()
    for (const page of agreeing) await (await openGameEndControls(page)).getByRole('button', { name: 'Agree', exact: true }).click()
    await proposer.getByRole('heading', { name: 'Ended by agreement', exact: true }).waitFor({ state: 'visible' })
  }
  const kit = { origins, binding, wsUrl, goodProtocols, hung, retries, label, publicIsClosed, publicStillClosed, betaAccess, boundaryContext, gameContext, login, handoff, enterPre,
    probePage, preFetch, wsProbe, holdSocket, liveSockets, heldCut, preCookieDigest, untilDenied, formalPost, formalMe, observeGameSocket, openGameEndControls, endByAgreement,
    /** The case result the CLI keeps, with its phase, if the case throws before returning it. */
    partial: null, track: result => (kit.partial = result) }
  return kit
}
