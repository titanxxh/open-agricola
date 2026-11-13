// @covers scripts/prerelease/
import { test, expect, type PlaywrightWorkerArgs } from '@playwright/test'
import { createServer as httpServer, request } from 'node:http'
import { createServer as httpsServer } from 'node:https'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { createPrereleaseGateway, OWNER_VERIFICATION_COOKIE } from '../scripts/prerelease/gateway'
import { configureOwnerVerification } from '../scripts/prerelease/owner-browser'

async function fixture(playwright: PlaywrightWorkerArgs['playwright'], engine: 'chromium' | 'firefox' | 'webkit', mode: 'open' | 'maintenance') {
  const root = mkdtempSync(join(tmpdir(), 'pre-owner-browser-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=api.agricola.test',
    '-addext', 'subjectAltName=DNS:app.agricola.test,DNS:api.agricola.test,DNS:pre.agricola.test', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem')], { stdio: 'ignore' })
  const ca = readFileSync(join(root, 'cert.pem'))
  const seen: string[] = [], sockets = new Set<Duplex>()
  const track = (socket: Duplex) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => socket.destroy()) }
  const upstream = httpServer((req, res) => {
    seen.push(req.headers.cookie ?? '')
    res.setHeader('Set-Cookie', ['__Host-oa-pre-session=inert-pre; Path=/; Secure; HttpOnly; SameSite=Lax',
      'parent_fixture=inert; Domain=agricola.test; Path=/; Secure', `${OWNER_VERIFICATION_COOKIE}=inert; Path=/; Secure; HttpOnly`])
    res.setHeader('Clear-Site-Data', '"cookies"')
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><title>Private pre candidate</title><main>Candidate content</main>')
  })
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
  const upstreamAddress = upstream.address()
  if (!upstreamAddress || typeof upstreamAddress === 'string') throw new Error('Expected upstream port')
  let gatewayPort = 0
  const formal = { appOrigin: '', apiOrigin: '' }, capability = { version: 2, buildId: 'b'.repeat(40) }
  const tls = httpsServer({ key: readFileSync(join(root, 'key.pem')), cert: ca }, (req, res) => {
    const host = new URL(`https://${req.headers.host}`).hostname
    if (host === 'api.agricola.test') {
      if (req.url === '/api/auth/browser-policy') {
        res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify({ ...capability, ...formal }))
      } else {
        res.setHeader('Set-Cookie', '__Host-oa-session=inert-formal; Path=/; Secure; HttpOnly; SameSite=Lax')
        res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Formal API fixture</title>')
      }
      return
    }
    if (host === 'app.agricola.test') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Formal Pages fixture</title>'); return }
    if (host !== 'pre.agricola.test') { res.writeHead(421); res.end(); return }
    // Revocation closes authorized gateway sockets. Each probe needs a new connection to observe its HTTP status.
    const outgoing = request({ hostname: '127.0.0.1', port: gatewayPort, path: req.url, method: req.method, headers: req.headers, agent: false }, response => {
      res.writeHead(response.statusCode ?? 500, response.headers); response.pipe(res)
    })
    outgoing.on('error', () => res.destroy()); req.pipe(outgoing)
  })
  tls.on('connection', track)
  tls.listen(0, '127.0.0.1'); await once(tls, 'listening')
  const tlsAddress = tls.address()
  if (!tlsAddress || typeof tlsAddress === 'string') throw new Error('Expected TLS port')
  formal.apiOrigin = `https://api.agricola.test:${tlsAddress.port}`
  formal.appOrigin = `https://app.agricola.test:${tlsAddress.port}`
  const origin = `https://pre.agricola.test:${tlsAddress.port}`, token = 'V'.repeat(43), generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5'
  const stateFile = join(root, 'gate.json'), tokenFile = join(root, 'token')
  writeFileSync(tokenFile, token, { mode: 0o600 })
  writeFileSync(stateFile, JSON.stringify({ format: 1, channel: 'prerelease', targetId: 'prerelease-test', buildId: 'a'.repeat(40), generation, mode,
    acceptance: mode === 'open' ? { formalBuildId: capability.buildId } : null }))
  writeFileSync(join(root, 'verification.json'), JSON.stringify({ targetId: 'prerelease-test', buildId: 'a'.repeat(40), generation,
    tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 600_000 }))
  const gateway = createPrereleaseGateway({ stateFile, targetId: 'prerelease-test', origin, formal, ca,
    lookup: (_hostname, options, callback) => {
      if (options.all) callback(null, [{ address: '127.0.0.1', family: 4 }])
      else callback(null, '127.0.0.1', 4)
    }, upstream: `http://127.0.0.1:${upstreamAddress.port}` })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  const gatewayAddress = gateway.server.address()
  if (!gatewayAddress || typeof gatewayAddress === 'string') throw new Error('Expected gateway port')
  gatewayPort = gatewayAddress.port
  await gateway.refreshBrowserPolicy()
  const proxy = httpServer((_req, res) => { res.writeHead(400); res.end() })
  proxy.on('connect', (req, socket, head) => {
    track(socket)
    if (![formal.appOrigin, formal.apiOrigin, origin].some(value => new URL(value).host === req.url)) { socket.destroy(); return }
    const remote = connect(tlsAddress.port, '127.0.0.1'); track(remote)
    remote.once('connect', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) remote.write(head); socket.pipe(remote); remote.pipe(socket) })
    socket.once('close', () => remote.destroy()); remote.once('close', () => socket.destroy())
  })
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening')
  const proxyAddress = proxy.address()
  if (!proxyAddress || typeof proxyAddress === 'string') throw new Error('Expected proxy port')
  const browser = await playwright[engine].launch({ proxy: { server: `http://127.0.0.1:${proxyAddress.port}` } })
  return { browser, origin, formal, tokenFile, root, gateway, capability, seen, close: async () => {
    await browser.close(); await gateway.close()
    for (const socket of sockets) socket.destroy()
    for (const server of [tls, upstream, proxy]) server.closeAllConnections()
    await Promise.all([tls, upstream, proxy].map(server => new Promise<void>(done => server.close(() => done()))))
    rmSync(root, { recursive: true, force: true })
  } }
}

test('private owner verification isolates its Secure HttpOnly cookie on same-site HTTPS hosts @webkit', async ({ playwright, browserName }) => {
  const value = await fixture(playwright, browserName, 'maintenance')
  const owner = await value.browser.newContext({ ignoreHTTPSErrors: true }), ordinary = await value.browser.newContext({ ignoreHTTPSErrors: true })
  try {
    expect((await ordinary.request.get(value.origin)).status()).toBe(503)
    await configureOwnerVerification(owner, value.origin, value.tokenFile)
    expect((await owner.cookies(value.origin)).find(cookie => cookie.name === OWNER_VERIFICATION_COOKIE)).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' })
    const page = await owner.newPage(); await page.goto(value.origin)
    await expect(page.getByText('Candidate content')).toBeVisible()
    expect(await page.evaluate(() => document.cookie)).toBe('')
    expect(value.seen[0]).toBe('')
    expect(value.seen.every(cookie => !cookie.includes(OWNER_VERIFICATION_COOKIE))).toBe(true)
    expect((await ordinary.request.get(value.origin)).status()).toBe(503)
    writeFileSync(join(value.root, 'verification.json'), '{}')
    expect((await owner.request.get(value.origin)).status()).toBe(503)
  } finally { await owner.close(); await ordinary.close(); await value.close() }
})

test('same-parent HTTPS cookies stay isolated and a formal policy rollback closes pre @webkit', async ({ playwright, browserName }) => {
  const value = await fixture(playwright, browserName, 'open')
  const context = await value.browser.newContext({ ignoreHTTPSErrors: true })
  try {
    const page = await context.newPage(); await page.goto(value.formal.apiOrigin); await page.goto(value.formal.appOrigin)
    const response = await page.goto(value.origin)
    expect(await response?.headerValue('set-cookie')).toBe('__Host-oa-pre-session=inert-pre; Path=/; Secure; HttpOnly; SameSite=Lax')
    expect(await response?.headerValue('clear-site-data')).toBeNull()
    await page.evaluate(() => {
      document.cookie = '__Host-oa-session=inert-shadow; Domain=agricola.test; Path=/; Secure'
      document.cookie = 'oa_session=inert-legacy; Domain=agricola.test; Path=/; Secure'
    })
    expect((await context.cookies(value.formal.apiOrigin)).filter(cookie => cookie.name === '__Host-oa-session').map(cookie => cookie.value)).toEqual(['inert-formal'])
    expect((await context.cookies(value.origin)).some(cookie => cookie.name === 'parent_fixture')).toBe(false)
    await page.reload()
    expect(value.seen.at(-1)).toBe('__Host-oa-pre-session=inert-pre')
    value.capability.version = 1
    await value.gateway.refreshBrowserPolicy()
    expect((await context.request.get(value.origin)).status()).toBe(503)
  } finally { await context.close(); await value.close() }
})
