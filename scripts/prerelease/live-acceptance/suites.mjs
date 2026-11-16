// Owner-only live acceptance suites. Each returns a JSON-safe record of labels, statuses and timings.
import assert from 'node:assert/strict'
import { bounded, sleep, poll, pollTrue } from './browser.mjs'

/** Stable case labels per suite: failures are recorded under the same label as a pass, so the newest result wins. */
export const SUITE_CASES = {
  handoff: ['handoff'], boundary: ['visitor', 'ordinary', 'beta-boundary', 'revocation'], multihand: ['multihand-cooperation-viewer'], team: ['team-game'],
  sandbox: ['public-sandbox'], viewer: ['viewer-firefox', 'viewer-webkit'], continuity: ['continuity'], deletion: ['formal-account-deletion'], readback: ['public-readback'],
}

/** Engines each suite must pass on; acceptance requires every case of every suite except `readback` on each of them. */
export const SUITE_ENGINES = {
  handoff: ['chromium', 'firefox', 'webkit'], boundary: ['chromium', 'firefox', 'webkit'], multihand: ['chromium'], team: ['chromium'],
  sandbox: ['chromium'], viewer: ['firefox', 'webkit'], continuity: ['chromium'], deletion: ['chromium'], readback: ['chromium'],
}

/** Case labels one engine runs for a suite, in execution order. The Viewer suite runs one engine-named case. */
export const caseLabels = (suite, engine) => suite === 'viewer' ? [`viewer-${engine}`] : SUITE_CASES[suite]

/** Validates `--case a,b` against the suite before any remote work; null keeps every case. */
export function parseCaseSelection(suite, value) {
  if (value === undefined) return null
  const requested = value.split(',').map(name => name.trim()).filter(Boolean)
  if (!SUITE_CASES[suite]) throw new Error(`Unknown suite ${suite}`)
  if (!requested.length) throw new Error('--case needs at least one case label')
  const unknown = requested.filter(name => !SUITE_CASES[suite].includes(name))
  if (unknown.length) throw new Error(`Unknown ${suite} case ${unknown.join(', ')}; expected one of ${SUITE_CASES[suite].join(', ')}`)
  return requested
}

/** Indexes and labels of the plan cases one engine runs under a selection. */
export const selectCases = (suite, engine, requested) => caseLabels(suite, engine)
  .map((label, index) => ({ label, index })).filter(({ label }) => !requested || requested.includes(label))

/** Every (case, engine) pair acceptance needs a passing newest result for. */
export const REQUIRED_CASES = Object.entries(SUITE_ENGINES).filter(([suite]) => suite !== 'readback')
  .flatMap(([suite, engines]) => engines.flatMap(engine => caseLabels(suite, engine).map(label => ({ case: label, engine }))))

const within = (ms, fence = 31_000) => ms !== null && ms !== undefined && ms <= fence
const NOTICE = 'Your login or Beta access is no longer valid. Return to production to sign in and enter again.'
const byLabel = (accounts, label) => { const account = accounts.find(a => a.label === label); assert.ok(account, `Account ${label} is not configured`); return account }

/** Normal Beta handoff: host-only Secure HttpOnly Lax pre cookie, same identity after reload. */
export async function handoffCase(kit, browser, accounts) {
  const actor = byLabel(accounts, 'A'), r = { case: 'handoff', engine: browser.browserType().name(), version: browser.version() }
  const { context, blocked } = await kit.boundaryContext(browser); const side = {}
  try {
    const page = await context.newPage(); page.setDefaultTimeout(20_000)
    await kit.login(page, actor, () => { side.logged = true })
    r.sessionExchange = await kit.handoff(page)
    r.banner = (await page.locator('.prerelease-banner').innerText()).includes(kit.binding.build.slice(0, 12))
    const probe = await kit.probePage(context)
    const identity = async () => {
      const me = await kit.preFetch(probe, '/api/auth/me')
      const descriptor = await probe.evaluate(async bind => {
        const x = await fetch('/open-agricola/frontend-build.json', { cache: 'no-store', headers: { 'x-oa-browser-protocol': '2', 'x-oa-pre-build': bind.build, 'x-oa-pre-generation': bind.generation } })
        const body = await x.json(); return { build: body.gameBuildId, channel: body.releaseChannel, target: body.deploymentTarget }
      }, kit.binding)
      return { ...me, ...descriptor }
    }
    r.identity = await identity()
    const cookies = await context.cookies(kit.origins.pre), session = cookies.filter(c => c.name === '__Host-oa-pre-session')
    r.cookie = { count: session.length, hostOnly: session[0]?.domain === new URL(kit.origins.pre).host, secure: session[0]?.secure, httpOnly: session[0]?.httpOnly, sameSite: session[0]?.sameSite, formalCookieOnPre: cookies.some(c => c.name === '__Host-oa-session') }
    await page.reload({ waitUntil: 'domcontentloaded' }); r.afterReload = await identity()
    r.blocked = [...blocked]
    r.passed = r.banner && r.identity.status === 200 && r.identity.user === 'A' && r.identity.build === kit.binding.build && r.identity.channel === 'prerelease' && r.identity.target === 'prerelease-hosted'
      && r.cookie.count === 1 && r.cookie.hostOnly && r.cookie.secure && r.cookie.httpOnly && r.cookie.sameSite === 'Lax' && !r.cookie.formalCookieOnPre
      && r.afterReload.status === 200 && r.afterReload.user === 'A' && r.blocked.length === 0
  } finally { if (side.logged) r.formalLogout = await kit.formalPost(context, '/api/auth/logout').catch(() => 'failed'); await context.close() }
  return r
}

export async function visitorCase(kit, browser) {
  const r = { case: 'visitor' }; const { context, blocked } = await kit.boundaryContext(browser)
  try {
    const page = await context.newPage(); page.setDefaultTimeout(20_000)
    const direct = await page.goto(kit.origins.pre + '/open-agricola/', { waitUntil: 'domcontentloaded' }); await sleep(6000)
    r.directUrl = { status: direct.status(), lobbyVisible: await page.locator('.prerelease-banner').count() > 0 && (await kit.preCookieDigest(context)) !== null }
    await page.goto(kit.origins.pre + '/open-agricola/auth/start', { waitUntil: 'domcontentloaded' }); await sleep(6000)
    r.entry = { finalOrigin: new URL(page.url()).origin, preSession: (await kit.preCookieDigest(context)) !== null }
    const probe = await kit.probePage(context)
    r.http = {}; for (const path of ['/api/auth/me', '/api/rooms', '/api/lobby/my-rooms', '/api/lobby/ended-games']) r.http[path] = await kit.preFetch(probe, path)
    r.ws = await kit.wsProbe(probe, kit.wsUrl, kit.goodProtocols)
    r.blocked = [...blocked]
    r.passed = !r.directUrl.lobbyVisible && !r.entry.preSession && Object.values(r.http).every(v => v.status === 401) && !r.ws.opened
  } finally { await context.close() }
  return r
}

export async function ordinaryCase(kit, browser, accounts) {
  const r = { case: 'ordinary' }; const { context, blocked } = await kit.boundaryContext(browser); const side = {}
  try {
    const page = await context.newPage(); page.setDefaultTimeout(20_000)
    const calls = []; page.on('response', x => { const u = new URL(x.url()); if (u.origin === kit.origins.formalApi && u.pathname.startsWith('/api/prerelease/')) calls.push(`${x.request().method()} ${u.pathname} ${x.status()}`) })
    await kit.login(page, byLabel(accounts, 'C'), () => { side.logged = true })
    await page.goto(kit.origins.pre + '/open-agricola/auth/start', { waitUntil: 'domcontentloaded' }); await sleep(8000)
    r.entry = { finalOrigin: new URL(page.url()).origin, formalCalls: calls, preSession: (await kit.preCookieDigest(context)) !== null }
    const probe = await kit.probePage(context)
    r.http = { me: await kit.preFetch(probe, '/api/auth/me'), rooms: await kit.preFetch(probe, '/api/rooms') }
    r.ws = await kit.wsProbe(probe, kit.wsUrl, kit.goodProtocols)
    r.blocked = [...blocked]
    r.passed = !r.entry.preSession && !calls.some(v => v.startsWith('POST /api/prerelease/handoffs 2')) && Object.values(r.http).every(v => v.status === 401) && !r.ws.opened
  } finally { if (side.logged) r.formalLogout = await kit.formalPost(context, '/api/auth/logout').catch(() => 'failed'); await context.close() }
  return r
}

export async function betaBoundaryCase(kit, browser, accounts) {
  const r = kit.track({ case: 'beta-boundary' }); r.phase = 'context'; const { context, blocked } = await kit.boundaryContext(browser); const side = {}
  const { pre, formalApp, formalApi } = kit.origins
  try {
    const page = await context.newPage(); page.setDefaultTimeout(20_000)
    r.phase = 'enter'; await kit.login(page, byLabel(accounts, 'A'), () => { side.logged = true }); await kit.handoff(page); await sleep(2000)
    const probe = await kit.probePage(context)
    assert.equal((await kit.preFetch(probe, '/api/auth/me')).user, 'A')
    r.phase = 'old-client'
    r.oldClient = {
      wrongBuild: await kit.preFetch(probe, '/api/auth/me', { ...kit.binding, build: 'f'.repeat(40) }),
      wrongGeneration: await kit.preFetch(probe, '/api/auth/me', { ...kit.binding, generation: '00000000-0000-4000-8000-000000000000' }),
      oldProtocol: await kit.preFetch(probe, '/api/auth/me', kit.binding, { protocol: '1' }),
      noProtocol: await kit.preFetch(probe, '/api/auth/me', kit.binding, { protocol: null }),
      noBinding: await kit.preFetch(probe, '/api/auth/me', null),
      wsWrongBuild: await kit.wsProbe(probe, kit.wsUrl, ['oa.browser.v2', `oa.pre.build.${'f'.repeat(40)}`, kit.goodProtocols[2]]),
      wsOldProtocol: await kit.wsProbe(probe, kit.wsUrl, ['oa.browser.v1', kit.goodProtocols[1], kit.goodProtocols[2]]),
      wsControl: await kit.wsProbe(probe, kit.wsUrl, kit.goodProtocols),
    }
    r.phase = 'pre-to-formal'
    r.preToFormal = {
      http: await probe.evaluate(async api => { try { const x = await fetch(api + '/api/auth/me', { credentials: 'include', headers: { 'x-oa-browser-protocol': '2' } }); return { readable: true, status: x.status } } catch { return { readable: false } } }, formalApi),
      ws: await kit.wsProbe(probe, 'wss://' + new URL(formalApi).host + '/ws', ['oa.browser.v2']),
    }
    r.phase = 'parent-cookie'
    const before = await kit.preCookieDigest(context), parent = new URL(pre).host.split('.').slice(1).join('.')
    const formalPage = await context.newPage(); await formalPage.goto(formalApp, { waitUntil: 'domcontentloaded' })
    await formalPage.evaluate(domain => { document.cookie = `__Host-oa-pre-session=forged; domain=${domain}; path=/; secure`; document.cookie = `oa_parent_probe=1; domain=${domain}; path=/; secure; samesite=lax` }, parent)
    const all = await context.cookies([pre, formalApp, formalApi])
    r.parentCookie = { forgedHostCookieRejected: !all.some(c => c.name === '__Host-oa-pre-session' && c.domain.replace(/^\./, '') === parent),
      preSessionUnchanged: before !== null && (await kit.preCookieDigest(context)) === before,
      sessionCookiesHostOnly: all.filter(c => c.name.startsWith('__Host-')).every(c => !c.domain.startsWith('.') && c.domain !== parent),
      parentProbePresent: all.some(c => c.name === 'oa_parent_probe') }
    r.parentCookie.preIdentityStillOwn = (await kit.preFetch(probe, '/api/auth/me')).user === 'A'
    await context.clearCookies({ name: 'oa_parent_probe' }); await formalPage.close()
    r.phase = 'embed'
    const frameState = async target => { const rows = []
      for (const frame of target.frames().slice(1)) rows.push({ origin: (() => { try { return new URL(frame.url()).origin } catch { return 'unreadable' } })(),
        ...await bounded(frame.evaluate(() => ({ accountUi: !!document.querySelector('#username, .prerelease-banner, .app, [class*="lobby"]') })).catch(() => ({ accountUi: false })), 10_000, 'frame state', { accountUi: false }, kit.hung) })
      return rows }
    const docs = target => { const rows = []; target.on('response', x => { if (x.request().resourceType() === 'document' && x.request().frame() !== target.mainFrame()) {
      const h = x.headers(); rows.push({ origin: new URL(x.url()).origin, status: x.status(), xfo: h['x-frame-options'] ?? null, frameAncestors: (h['content-security-policy'] ?? '').match(/frame-ancestors[^;]*/)?.[0] ?? null }) } }); return rows }
    const opaque = await context.newPage(); const opaqueDocs = docs(opaque)
    await opaque.setContent(`<iframe src="${pre}/open-agricola/"></iframe><iframe src="${formalApp}/?page=prerelease-handoff"></iframe>`); await sleep(8000)
    const sameSite = await context.newPage(); const sameSiteDocs = docs(sameSite)
    await sameSite.goto(formalApp, { waitUntil: 'domcontentloaded' })
    await sameSite.evaluate(src => { const frame = document.createElement('iframe'); frame.src = src; document.body.append(frame) }, pre + '/open-agricola/'); await sleep(8000)
    const top = await context.newPage(); const topHeaders = (await top.goto(pre + '/open-agricola/', { waitUntil: 'domcontentloaded' })).headers()
    r.embed = { opaque: { docs: opaqueDocs, frames: await frameState(opaque) }, sameSiteFormalTop: { docs: sameSiteDocs, frames: await frameState(sameSite) },
      preTopLevel: { xfo: topHeaders['x-frame-options'] ?? null, frameAncestors: (topHeaders['content-security-policy'] ?? '').match(/frame-ancestors[^;]*/)?.[0] ?? null } }
    for (const extra of [opaque, sameSite, top]) await extra.close()
    r.phase = 'pre-logout'
    const t0 = Date.now()
    r.preLogout = { status: (await kit.preFetch(probe, '/api/auth/logout', kit.binding, { method: 'POST' })).status }
    r.preLogout.after = await kit.preFetch(probe, '/api/auth/me'); r.preLogout.formalMe = await kit.formalMe(context); r.preLogout.ms = Date.now() - t0
    r.phase = 'done'; r.blocked = [...blocked]
    const o = r.oldClient
    r.passed = [o.wrongBuild, o.wrongGeneration, o.oldProtocol, o.noProtocol, o.noBinding].every(v => v.status !== 200 && v.user === null)
      && !o.wsWrongBuild.opened && !o.wsOldProtocol.opened && o.wsControl.opened && o.wsControl.closeCode === null
      && !r.preToFormal.http.readable && !r.preToFormal.ws.opened
      && r.parentCookie.forgedHostCookieRejected && r.parentCookie.preSessionUnchanged && r.parentCookie.sessionCookiesHostOnly && r.parentCookie.preIdentityStillOwn
      && r.embed.opaque.frames.length === 2 && [...r.embed.opaque.frames, ...r.embed.sameSiteFormalTop.frames].every(v => !v.accountUi)
      && r.embed.sameSiteFormalTop.docs.some(v => v.origin === pre && /frame-ancestors 'none'/.test(v.frameAncestors ?? '') && v.xfo === 'DENY')
      && /frame-ancestors 'none'/.test(r.embed.preTopLevel.frameAncestors ?? '')
      && r.preLogout.status === 200 && r.preLogout.after.status === 401 && r.preLogout.formalMe === 200
  } finally { if (side.logged) r.formalLogout = await kit.formalPost(context, '/api/auth/logout').catch(() => 'failed'); await context.close() }
  return r
}

/** Two formal logins of the same Beta account each derive their own pre session and held socket. */
export async function revocationCase(kit, browser, accounts) {
  const A = byLabel(accounts, 'A'), r = kit.track({ case: 'revocation', phases: [] }), started = Date.now()
  // Each phase records when it began, so a failure names the step that stalled.
  const phase = name => { r.phase = name; r.phases.push([name, Date.now() - started]) }
  const snapshot = async (probe, name) => {
    const live = await kit.liveSockets(probe)
    assert.ok(live.ids.length > 0, `${name}: no held socket was open before the action`)
    return live
  }
  phase('contexts')
  const one = await kit.boundaryContext(browser), two = await kit.boundaryContext(browser)
  const enter = async (side, name) => {
    phase(`${name}:formal`)
    side.page ??= await side.context.newPage(); side.page.setDefaultTimeout(20_000)
    if (!side.formal || await kit.formalMe(side.context) !== 200) { await kit.login(side.page, A, () => { side.logged = true }); side.formal = true }
    phase(`${name}:handoff`); await kit.handoff(side.page); await sleep(2000)
    phase(`${name}:probe`); side.probe ??= await kit.probePage(side.context)
    assert.equal((await kit.preFetch(side.probe, '/api/auth/me')).user, 'A', name)
    phase(`${name}:socket`); assert.equal(await kit.holdSocket(side.probe), true, `${name} socket`)
  }
  try {
    await enter(one, 'one'); await enter(two, 'two')
    phase('logout'); let live = await snapshot(one.probe, 'one'); const liveTwo = await snapshot(two.probe, 'two')
    let t0 = Date.now(); r.currentLogout = { formal: await kit.formalPost(one.context, '/api/auth/logout') }; one.formal = false
    r.currentLogout.derived = await kit.untilDenied(one.probe, t0); r.currentLogout.derivedSockets = await kit.heldCut(one.probe, live)
    while (Date.now() - t0 < 33_000) await sleep(500)
    r.currentLogout.otherAfter33s = await kit.preFetch(two.probe, '/api/auth/me'); r.currentLogout.otherSocketAfter33s = await kit.heldCut(two.probe, liveTwo, 0)
    await enter(one, 'one-again')
    phase('logout-all'); live = await snapshot(one.probe, 'one-again'); const liveBoth = await snapshot(two.probe, 'two')
    t0 = Date.now(); r.logoutAll = { formal: await kit.formalPost(two.context, '/api/auth/logout-all') }; one.formal = false; two.formal = false
    const [a, b] = await Promise.all([kit.untilDenied(one.probe, t0), kit.untilDenied(two.probe, t0)])
    r.logoutAll.loginOne = a; r.logoutAll.loginTwo = b; r.logoutAll.sockets = [await kit.heldCut(one.probe, live), await kit.heldCut(two.probe, liveBoth)]
    await enter(one, 'one-before-revoke')
    phase('revoke'); live = await snapshot(one.probe, 'one-before-revoke')
    t0 = Date.now(); r.betaRevoke = { admin: await kit.betaAccess('revoke', A) }
    r.betaRevoke.http = await kit.untilDenied(one.probe, t0); r.betaRevoke.sockets = await kit.heldCut(one.probe, live)
    phase('reentry')
    const refused = one.page.waitForResponse(x => x.url() === kit.origins.formalApi + '/api/prerelease/handoffs', { timeout: 20_000 }).then(x => x.status(), () => null)
    await one.page.goto(kit.origins.pre + '/open-agricola/auth/start', { waitUntil: 'domcontentloaded' }); await sleep(6000)
    r.betaRevoke.reentry = { handoffStatus: await refused, preSession: (await kit.preFetch(one.probe, '/api/auth/me')).status }
    phase('grant'); r.betaRestore = { admin: await kit.betaAccess('grant', A) }
    await enter(one, 'one-after-grant'); r.betaRestore.sameIdentity = true; phase('done')
    r.passed = r.currentLogout.formal === 200 && within(r.currentLogout.derived.deniedAfterMs) && r.currentLogout.otherAfter33s.status === 200
      && r.currentLogout.otherSocketAfter33s.connectedAtStart > 0 && r.currentLogout.otherSocketAfter33s.closedAfterMs === null
      && r.logoutAll.formal === 200 && within(a.deniedAfterMs) && within(b.deniedAfterMs)
      && within(r.betaRevoke.http.deniedAfterMs) && r.betaRevoke.reentry.preSession !== 200 && r.betaRevoke.reentry.handoffStatus !== 200 && r.betaRestore.sameIdentity
      && [r.currentLogout.derivedSockets, ...r.logoutAll.sockets, r.betaRevoke.sockets].every(s => s.connectedAtStart > 0 && within(s.closedAfterMs))
  } finally {
    try { if (!(await kit.betaAccess('list', A)).beta) r.betaRestoredInFinally = await kit.betaAccess('grant', A) } catch { r.betaRestoreFailed = true; process.exitCode = 1 }
    for (const side of [one, two]) { if (side.logged) await kit.formalPost(side.context, '/api/auth/logout').catch(() => {}); await side.context.close() }
  }
  return r
}

/** Multihand with official cooperation rules: two principals, two seats each, in-game revocation, agreed end and the restricted Viewer. */
export async function multihandCase(kit, browser, accounts, guestLabel, out) {
  const r = { case: 'multihand-cooperation-viewer', guest: guestLabel }
  const A = byLabel(accounts, 'A'), G = byLabel(accounts, guestLabel)
  const hostSide = await kit.gameContext(browser), guestSide = await kit.gameContext(browser)
  try {
    const host = await hostSide.context.newPage(), guest = await guestSide.context.newPage(); host.setDefaultTimeout(30_000); guest.setDefaultTimeout(30_000)
    const hostWire = kit.observeGameSocket(host), guestWire = kit.observeGameSocket(guest)
    r.phase = 'enter'; await kit.enterPre(host, A, hostSide); await kit.enterPre(guest, G, guestSide)
    r.phase = 'create'
    await host.getByRole('button', { name: 'Multihand game', exact: true }).click()
    const cooperation = host.getByRole('checkbox', { name: 'Official cooperation rules', exact: true })
    r.cooperationDefaultUnchecked = !(await cooperation.isChecked()); await cooperation.check()
    await host.getByRole('button', { name: 'Create Game', exact: true }).click()
    await host.locator('.team-waiting-room').waitFor({ state: 'visible' })
    r.startDisabledBeforeFull = await host.getByRole('button', { name: 'Start game', exact: true }).isDisabled()
    const roomUrl = host.url(); r.roomId = new URL(roomUrl).searchParams.get('room'); assert.match(r.roomId, /^[a-f0-9-]{36}$/)
    await guest.goto(roomUrl); await pollTrue(async () => (await guest.locator('.team-waiting-room').innerText()).includes('4/4 seats filled'), 30_000, 'seats')
    await pollTrue(() => host.getByRole('button', { name: 'Start game', exact: true }).isEnabled(), 30_000, 'start enabled')
    r.phase = 'start'; await host.getByRole('button', { name: 'Start game', exact: true }).click()
    await poll(() => hostWire.joins.at(-1)?.controlledPlayerIndexes, [0, 2], 30_000, 'host seats')
    await poll(() => guestWire.joins.at(-1)?.controlledPlayerIndexes, [1, 3], 30_000, 'guest seats')
    await poll(() => hostWire.latest()?.payload.state.team?.playerTeams, [0, 1, 0, 1], 30_000, 'teams')
    r.teams = hostWire.latest().payload.state.team.playerTeams; r.cooperationRules = hostWire.latest().payload.state.team.configuration.cooperationRules
    r.phase = 'opening'; await playOpening(hostWire, seat => [host, guest][seat % 2], seat => [hostWire, guestWire][seat % 2], r)
    r.phase = 'actions'; r.actedSeats = await playActions(hostWire, seat => [host, guest][seat % 2], seat => [hostWire, guestWire][seat % 2], true)
    r.phase = 'reload'; await host.reload(); await poll(() => hostWire.joins.at(-1)?.controlledPlayerIndexes, [0, 2], 30_000, 'reload seats')
    await host.locator('.multihand-seat-controls').waitFor({ state: 'visible' })
    await host.getByRole('button', { name: 'View your hand', exact: true }).click()
    r.handOptions = await host.locator('.multihand-hand-dialog select option').count()
    await host.locator('.multihand-hand-dialog').getByRole('button', { name: 'Close', exact: true }).click()
    r.phase = 'revoke-in-game'
    const kept = guestWire.latest().version, live = hostWire.sockets().filter(s => s.closedAt === null && s.documentEndedAt === undefined)
    const t0 = Date.now(); r.revoke = { admin: await kit.betaAccess('revoke', A) }
    await host.getByText(NOTICE).waitFor({ state: 'visible', timeout: 35_000 }); r.revoke.noticeAfterMs = Date.now() - t0
    while (live.some(s => s.closedAt === null) && Date.now() - t0 < 31_000) await sleep(250)
    r.revoke.hostSocketsAtStart = live.length
    r.revoke.hostSocketsClosedAfterMs = live.length && live.every(s => s.closedAt !== null) ? Math.max(...live.map(s => s.closedAt - t0)) : null
    await sleep(5000); r.revoke.guestVersionUnchanged = guestWire.latest().version === kept
    r.revoke.guestConnected = guestWire.sockets().some(s => s.closedAt === null && s.documentEndedAt === undefined)
    r.restore = { admin: await kit.betaAccess('grant', A) }
    await kit.handoff(host); await host.goto(roomUrl)
    await poll(() => hostWire.joins.at(-1)?.controlledPlayerIndexes, [0, 2], 30_000, 'seats after re-grant')
    await pollTrue(() => hostWire.latest()?.version === kept, 30_000, 'state retained'); r.restore.sameVersion = true
    r.phase = 'end-by-agreement'; await kit.endByAgreement(host, [guest]); r.endedByAgreement = true
    r.phase = 'viewer'; Object.assign(r, await viewerChecks(kit, host, r.roomId, A, out, 'chromium'))
    r.passed = r.cooperationDefaultUnchecked && r.startDisabledBeforeFull && JSON.stringify(r.teams) === '[0,1,0,1]' && r.cooperationRules === true
      && JSON.stringify(r.actedSeats) === '[0,1,2,3]' && r.handOptions === 2 && within(r.revoke.noticeAfterMs) && r.revoke.guestVersionUnchanged && r.revoke.guestConnected
      && r.revoke.hostSocketsAtStart > 0 && within(r.revoke.hostSocketsClosedAfterMs) && r.restore.sameVersion && r.endedByAgreement && r.viewerPassed
      && hostSide.foreign.length === 0 && guestSide.foreign.length === 0
    r.phase = 'done'
  } finally {
    try { if (!(await kit.betaAccess('list', A)).beta) r.betaRestoredInFinally = await kit.betaAccess('grant', A) } catch { r.betaRestoreFailed = true; process.exitCode = 1 }
    for (const side of [hostSide, guestSide]) { if (side.logged) await kit.formalPost(side.context, '/api/auth/logout').catch(() => {}); await side.context.close() }
  }
  return r
}

async function playOpening(hostWire, pageOf, wireOf, r) {
  r.openingKinds = []
  for (let opening = 0; opening < 12; opening++) {
    const current = hostWire.latest()
    if (current.payload.interaction.stateId === 'idle') break
    assert.equal(current.payload.interaction.stateId, 'wait')
    const seat = current.payload.interaction.playerIndex, page = pageOf(seat), wire = wireOf(seat)
    await poll(() => wire.latest()?.version, current.version, 30_000, 'opening sync')
    const request = wire.latest().payload.interaction.request; r.openingKinds.push(request.kind)
    const control = request.kind === 'choice' && request.options.some(option => option.value === '__skip__' && !option.disabled)
      ? page.locator('.interaction-bar [data-choice-value="__skip__"]')
      : request.kind === 'confirm-player-switch' ? page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }) : null
    if (!control) throw new Error(`Unexpected opening interaction: ${request.kind}`)
    await control.click(); await pollTrue(() => (wire.latest()?.version ?? -1) > current.version, 30_000, 'opening advance')
    await poll(() => hostWire.latest()?.version, wire.latest().version, 30_000, 'opening host sync')
  }
  await poll(() => hostWire.latest()?.payload.interaction.stateId, 'idle', 30_000, 'idle')
}

async function playActions(hostWire, pageOf, wireOf, multihand) {
  const acted = new Set()
  for (let step = 0; step < 4; step++) {
    const state = hostWire.latest()
    const seat = state.payload.interaction.stateId === 'wait' ? state.payload.interaction.playerIndex : state.payload.state.currentPlayerIndex
    const page = pageOf(seat), wire = wireOf(seat)
    await poll(() => wire.latest()?.version, state.version, 30_000, 'action sync')
    if (multihand) await page.locator(`.multihand-operation[data-operation-player-id="p${seat + 1}"]`).first().waitFor({ state: 'visible' })
    const before = wire.latest().version
    await page.locator(['forest', 'clay-pit', 'reed-bank', 'grain-seeds'].map(id => `[data-action-id="${id}"] button:enabled`).join(', ')).first().click()
    await pollTrue(() => wire.latest().version > before, 30_000, 'action applied'); acted.add(seat)
    const pending = wire.latest().payload.interaction
    if (pending.stateId === 'wait' && ['confirm-next-player', 'confirm-player-switch'].includes(pending.request.kind)) {
      const previous = wire.latest().version
      await page.locator('.interaction-bar').getByRole('button', { name: 'Confirm switch', exact: true }).click()
      await pollTrue(() => wire.latest().version > previous, 30_000, 'switch confirmed')
    }
    await poll(() => hostWire.latest()?.version, wire.latest().version, 30_000, 'action host sync')
  }
  return [...acted].sort()
}

/** Restricted Viewer: credentialless sandboxed frame, data only through the parent bridge, cleared after Beta revocation. */
async function viewerChecks(kit, page, roomId, A, out, engine) {
  const requests = []
  page.on('request', x => { if (x.frame() !== page.mainFrame()) requests.push(x.allHeaders().then(h => ({ type: x.resourceType(), path: new URL(x.url()).pathname, cookies: (h.cookie ?? '').split(';').map(v => v.trim().split('=')[0]).filter(Boolean) }))) })
  const parentReads = []; page.on('response', x => { const u = new URL(x.url()); if (u.origin === kit.origins.pre && u.pathname.startsWith(`/api/v1/replays/${roomId}/`)) parentReads.push(x.status()) })
  await page.goto(`${kit.origins.pre}/open-agricola/?room=${roomId}&perspective=p1`)
  await page.frameLocator('iframe').locator('.replay-app').waitFor({ state: 'visible', timeout: 60_000 })
  const iframe = page.locator('iframe'); await sleep(2000)
  const seen = await Promise.all(requests)
  const credentialed = v => v.cookies.includes('__Host-oa-pre-session') || v.cookies.includes('__Host-oa-pre-verify')
  const viewer = { sandbox: await iframe.getAttribute('sandbox'), credentialless: await iframe.getAttribute('credentialless'), credentiallessSupported: await page.evaluate(() => 'credentialless' in HTMLIFrameElement.prototype),
    program: /\/replay-viewers\/[a-f0-9]{64}\/index\.html/.test(await iframe.getAttribute('src') ?? ''),
    iframeDataRequests: seen.filter(v => /\/api\/v1\/|\/replay-assets\//.test(v.path)).length, iframeCredentialedRequests: seen.filter(credentialed).length, parentReplayReads: parentReads }
  await page.screenshot({ path: `${out}/${engine}-viewer.png` })
  const t0 = Date.now(); const viewerRevoke = { admin: await kit.betaAccess('revoke', A) }
  await iframe.waitFor({ state: 'detached', timeout: 35_000 }); viewerRevoke.clearedAfterMs = Date.now() - t0
  viewerRevoke.accessScreen = await page.locator('.prerelease-access-screen').isVisible()
  const viewerRestore = { admin: await kit.betaAccess('grant', A) }
  // Browsers without credentialless support may attach cookies to the entry navigation; the gateway strips them for programs.
  const viewerPassed = viewer.sandbox === 'allow-scripts' && viewer.credentialless === '' && viewer.program && viewer.iframeDataRequests === 0
    && (!viewer.credentiallessSupported || viewer.iframeCredentialedRequests === 0) && within(viewerRevoke.clearedAfterMs) && viewerRevoke.accessScreen
  return { viewer, viewerRevoke, viewerRestore, viewerPassed }
}

export async function viewerCase(kit, browser, accounts, roomId, out) {
  const A = byLabel(accounts, 'A'), engine = browser.browserType().name(), r = { case: `viewer-${engine}`, version: browser.version() }; const side = await kit.gameContext(browser)
  try {
    const page = await side.context.newPage(); page.setDefaultTimeout(30_000)
    await kit.enterPre(page, A, side); Object.assign(r, await viewerChecks(kit, page, roomId, A, out, engine)); r.passed = r.viewerPassed
  } finally {
    try { if (!(await kit.betaAccess('list', A)).beta) r.betaRestoredInFinally = await kit.betaAccess('grant', A) } catch { r.betaRestoreFailed = true; process.exitCode = 1 }
    if (side.logged) await kit.formalPost(side.context, '/api/auth/logout').catch(() => {}); await side.context.close()
  }
  return r
}

/** Full Team game: four distinct Beta principals, one seat each, ended by agreement. */
export async function teamGameCase(kit, browser, accounts, labels, out) {
  const r = { case: 'team-game', players: labels }; const sides = []
  try {
    for (const name of labels) { const side = { name, actor: byLabel(accounts, name), ...(await kit.gameContext(browser)) }; side.page = await side.context.newPage(); side.page.setDefaultTimeout(30_000); side.wire = kit.observeGameSocket(side.page); sides.push(side) }
    r.phase = 'enter'; for (const side of sides) await kit.enterPre(side.page, side.actor, side)
    const host = sides[0]
    r.phase = 'create'; await host.page.getByRole('button', { name: 'Team game', exact: true }).click()
    await host.page.getByRole('button', { name: 'Create Game', exact: true }).click()
    await host.page.locator('.team-waiting-room').waitFor({ state: 'visible' })
    const roomUrl = host.page.url(); r.roomId = new URL(roomUrl).searchParams.get('room'); assert.match(r.roomId, /^[a-f0-9-]{36}$/)
    for (const side of sides.slice(1)) { await side.page.goto(roomUrl); await side.page.locator('.team-waiting-room').waitFor({ state: 'visible' }) }
    await pollTrue(async () => (await host.page.locator('.team-waiting-room').innerText()).includes('4/4 seats filled'), 30_000, 'four seats')
    await pollTrue(() => host.page.getByRole('button', { name: 'Start game', exact: true }).isEnabled(), 30_000, 'start enabled')
    r.phase = 'start'; await host.page.getByRole('button', { name: 'Start game', exact: true }).click()
    for (const side of sides) await pollTrue(() => (side.wire.joins.at(-1)?.controlledPlayerIndexes?.length ?? 0) === 1, 30_000, `${side.name} seat`)
    const seatOf = new Map(sides.map(side => [side.wire.joins.at(-1).controlledPlayerIndexes[0], side])); assert.equal(seatOf.size, 4)
    r.seats = Object.fromEntries(sides.map(side => [side.name, side.wire.joins.at(-1).controlledPlayerIndexes[0]]))
    await pollTrue(() => Array.isArray(host.wire.latest()?.payload.state.team?.playerTeams), 30_000, 'teams')
    r.teams = host.wire.latest().payload.state.team.playerTeams; r.mode = host.wire.latest().payload.state.team.configuration.mode
    r.phase = 'opening'; await playOpening(host.wire, seat => seatOf.get(seat).page, seat => seatOf.get(seat).wire, r)
    r.phase = 'actions'; r.actedPlayers = (await playActions(host.wire, seat => seatOf.get(seat).page, seat => seatOf.get(seat).wire, false)).map(seat => seatOf.get(seat).name).sort()
    await host.page.screenshot({ path: `${out}/chromium-team-game.png` })
    r.phase = 'end-by-agreement'; await kit.endByAgreement(host.page, sides.slice(1).map(side => side.page)); r.endedByAgreement = true
    r.passed = r.mode === 'team' && r.teams.length === 4 && new Set(r.teams).size === 2 && JSON.stringify(r.actedPlayers) === JSON.stringify([...labels].sort()) && r.endedByAgreement && sides.every(side => side.foreign.length === 0)
    r.phase = 'done'
  } finally { for (const side of sides) { if (side.logged) await kit.formalPost(side.context, '/api/auth/logout').catch(() => {}); await side.context.close().catch(() => {}) } }
  return r
}

/** Public sandbox in both execution modes; prerelease never writes the shared workshop or calls the formal API. */
export async function sandboxCase(kit, browser, accounts, out) {
  const r = { case: 'public-sandbox' }; const side = await kit.gameContext(browser)
  try {
    const page = await side.context.newPage(); page.setDefaultTimeout(30_000)
    const writes = [], formalCalls = []
    page.on('request', x => { const u = new URL(x.url()); if (u.origin === kit.origins.formalApi) formalCalls.push(`${x.method()} ${u.pathname}`); if (u.origin === kit.origins.pre && !['GET', 'HEAD'].includes(x.method())) writes.push(`${x.method()} ${u.pathname}`) })
    await kit.enterPre(page, byLabel(accounts, 'A'), side); formalCalls.length = 0; writes.length = 0
    await page.goto(`${kit.origins.pre}/open-agricola/?page=workshop`)
    await page.getByRole('heading', { name: 'Public card sandbox' }).waitFor({ state: 'visible' })
    r.authoringControls = await page.getByRole('button', { name: /Design|Generate|Publish/i }).count()
    r.catalog = await page.evaluate(async bind => { const x = await fetch('/api/workshop/public-sandbox/v1/cards', { credentials: 'include', cache: 'no-store', headers: { 'x-oa-browser-protocol': '2', 'x-oa-pre-build': bind.build, 'x-oa-pre-generation': bind.generation } }); return { status: x.status, cards: (await x.json()).cards?.length ?? null } }, kit.binding)
    r.formalCatalog = await fetch(kit.origins.formalApi + '/api/workshop/public-cards/v1/cards', { signal: AbortSignal.timeout(15_000) }).then(async x => ({ status: x.status, cards: (await x.json()).cards?.length ?? null }))
    const cards = page.locator('[data-testid="prerelease-workshop"] fieldset.prerelease-workshop-panel > div > label')
    r.listedCards = await cards.count()
    if (r.listedCards > 0) { r.cardName = (await cards.first().innerText()).trim().slice(0, 80); await cards.first().locator('input').check() }
    r.modes = {}
    for (const mode of ['server', 'browser']) {
      await page.getByRole('combobox', { name: 'Run game' }).selectOption(mode)
      const started = mode === 'server' ? page.waitForResponse(x => new URL(x.url()).pathname === '/api/game/new-sandbox' && x.request().method() === 'POST') : null
      await page.getByRole('button', { name: 'Start Sandbox', exact: true }).click()
      const result = { newSandbox: started ? (await started).status() : null }
      await page.frameLocator('iframe.sandbox-embed-frame').locator('.action-board').first().waitFor({ state: 'visible', timeout: 60_000 }); result.board = true
      if (mode === 'browser') result.savedGames = await pollTrue(() => page.evaluate(async () => (await indexedDB.databases()).some(d => d.name === 'open-agricola-local-sandbox')), 30_000, 'local save').then(() => true)
      await page.screenshot({ path: `${out}/chromium-sandbox-${mode}.png` })
      await page.getByRole('button', { name: 'Close sandbox', exact: true }).click().catch(() => {})
      r.modes[mode] = result
    }
    r.preWrites = [...new Set(writes)].sort(); r.formalCalls = [...new Set(formalCalls)].sort()
    r.passed = r.authoringControls === 0 && r.catalog.status === 200 && r.catalog.cards === r.formalCatalog.cards && r.listedCards === r.catalog.cards
      && r.modes.server?.newSandbox === 200 && r.modes.server.board && r.modes.browser?.board && r.modes.browser.savedGames
      && r.preWrites.every(v => /^POST \/api\/(game\/|workshop\/public-sandbox\/v1\/(inputs|status)$|observability\/telemetry$)/.test(v)) && r.formalCalls.length === 0
  } finally { if (side.logged) await kit.formalPost(side.context, '/api/auth/logout').catch(() => {}); await side.context.close() }
  return r
}

/** Retained data after a restart or upgrade: identity, archived game listing and Viewer for a known room. */
export async function continuityCase(kit, browser, accounts, roomId) {
  const r = { case: 'continuity', roomId: roomId ? 'given' : null }; const side = await kit.gameContext(browser)
  try {
    const page = await side.context.newPage(); page.setDefaultTimeout(30_000)
    await kit.enterPre(page, byLabel(accounts, 'A'), side); const probe = await kit.probePage(side.context)
    r.identity = await kit.preFetch(probe, '/api/auth/me')
    const ended = await probe.evaluate(async bind => { const x = await fetch('/api/lobby/ended-games', { credentials: 'include', cache: 'no-store', headers: { 'x-oa-browser-protocol': '2', 'x-oa-pre-build': bind.build, 'x-oa-pre-generation': bind.generation } }); return { status: x.status, body: await x.text() } }, kit.binding)
    r.endedGames = { status: ended.status, containsRoom: ended.body.includes(roomId) }
    await page.goto(`${kit.origins.pre}/open-agricola/?room=${roomId}&perspective=p1`)
    await page.frameLocator('iframe').locator('.replay-app').waitFor({ state: 'visible', timeout: 60_000 }); r.viewer = true
    r.passed = r.identity.status === 200 && r.identity.user === 'A' && r.endedGames.containsRoom && r.viewer
  } finally { if (side.logged) await kit.formalPost(side.context, '/api/auth/logout').catch(() => {}); await side.context.close() }
  return r
}

/** Formal self-service deletion of disposable accounts; each pre session must end within the fence. */
export async function deletionCase(kit, browser, accounts, labels) {
  const r = { case: 'formal-account-deletion', accounts: labels, results: {} }
  for (const name of labels) {
    const actor = byLabel(accounts, name), side = await kit.gameContext(browser), row = {}
    try {
      const page = await side.context.newPage(); page.setDefaultTimeout(30_000)
      await kit.enterPre(page, actor, side); const probe = await kit.probePage(side.context)
      row.before = await kit.preFetch(probe, '/api/auth/me')
      const t0 = Date.now(), response = await side.context.request.delete(kit.origins.formalApi + '/api/auth/account', { headers: { Origin: kit.origins.formalApp, 'x-oa-browser-protocol': '2' }, timeout: 30_000 })
      const body = await response.json().catch(() => null)
      row.deletion = { status: response.status(), ok: body?.ok ?? null, pending: body?.pending ?? null }
      row.preAfter = await kit.untilDenied(probe, t0)
      row.formalMeAfter = await kit.formalMe(side.context)
      row.formalReloginStatus = (await side.context.request.post(kit.origins.formalApi + '/api/auth/login', { headers: { Origin: kit.origins.formalApp, 'x-oa-browser-protocol': '2', 'Content-Type': 'application/json' }, data: { username: actor.username, password: actor.password }, timeout: 20_000 })).status()
      row.passed = row.before.user === name && [200, 202].includes(row.deletion.status) && row.deletion.ok === true && within(row.preAfter.deniedAfterMs) && row.formalMeAfter === 401 && row.formalReloginStatus !== 200
    } catch (error) { row.error = String(error.message).slice(0, 300) }
    finally { await side.context.close() }
    r.results[name] = row
  }
  r.passed = Object.values(r.results).every(v => v.passed)
  return r
}

/** Public readback after open, without private ingress: Beta enters, ordinary and visitor are refused. */
export async function readbackCase(kit, browser, accounts) {
  const r = { case: 'public-readback', results: {} }
  const plain = async () => { const context = await browser.newContext({ locale: 'en-US' }); await context.addInitScript(() => localStorage.setItem('open-agricola-locale-v2', 'en')); return context }
  for (const name of ['A', 'C']) {
    const context = await plain(), side = {}, row = {}
    try {
      const page = await context.newPage(); page.setDefaultTimeout(30_000)
      await kit.login(page, byLabel(accounts, name), () => { side.logged = true }); await sleep(3000)
      row.formalEntryControls = await page.evaluate(pre => [...document.querySelectorAll('a,button')].filter(e => (e.getAttribute('href') ?? '').startsWith(pre) || /prerelease/i.test(e.textContent ?? '')).length, kit.origins.pre)
      if (name === 'A') { await kit.handoff(page); row.banner = (await page.locator('.prerelease-banner').innerText()).includes(kit.binding.build.slice(0, 12)) }
      else { await page.goto(`${kit.origins.pre}/open-agricola/auth/start`, { waitUntil: 'domcontentloaded' }); await sleep(6000) }
      row.me = await kit.preFetch(await kit.probePage(context), '/api/auth/me')
    } catch (error) { row.error = String(error.message).slice(0, 300) }
    finally { if (side.logged) row.formalLogout = await kit.formalPost(context, '/api/auth/logout').catch(() => 'failed'); await context.close() }
    r.results[name] = row
  }
  const visitor = await plain(); const probe = await kit.probePage(visitor)
  r.results.visitor = { me: await kit.preFetch(probe, '/api/auth/me'), rooms: await kit.preFetch(probe, '/api/rooms') }; await visitor.close()
  const { A, C, visitor: v } = r.results
  r.passed = A.me?.status === 200 && A.me.user === 'A' && A.banner === true && A.formalEntryControls > 0 && C.me?.status === 401 && C.formalEntryControls === 0 && v.me.status === 401 && v.rooms.status === 401
  return r
}
