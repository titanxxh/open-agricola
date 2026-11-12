import { createServer, get, request, type IncomingHttpHeaders } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { expect, it, vi } from 'vitest'
import { createPrereleaseGateway, OWNER_VERIFICATION_COOKIE } from '../prerelease/gateway'
import { formalBrowserPolicyFixture } from './prerelease-browser-policy-fixture'

it('rejects ambiguous credentials and foreign browser requests and closes streams when formal protection changes', async () => {
  const formal = await formalBrowserPolicyFixture(), root = await mkdtemp(join(tmpdir(), 'pre-gateway-policy-'))
  const stateFile = join(root, 'gate.json'), origin = 'https://pre.agricola.test'
  const state = { format: 1, targetId: 'prerelease-test', channel: 'prerelease', mode: 'open', buildId: 'a'.repeat(40),
    generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', acceptance: { formalBuildId: formal.state.buildId } }
  await writeFile(stateFile, JSON.stringify(state))
  const seen: IncomingHttpHeaders[] = []
  const upstream = createServer((req, res) => { seen.push(req.headers); res.end('ok') })
  const ws = new WebSocketServer({ server: upstream })
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
  const address = upstream.address()
  if (!address || typeof address === 'string') throw new Error('Expected upstream port')
  const gateway = createPrereleaseGateway({ stateFile, targetId: state.targetId, origin, formal: formal.formal, ca: formal.ca, upstream: `http://127.0.0.1:${address.port}` })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening'); await gateway.refreshBrowserPolicy()
  const listener = gateway.server.address()
  if (!listener || typeof listener === 'string') throw new Error('Expected gateway port')
  const base = `http://127.0.0.1:${listener.port}`
  const read = (headers: Record<string, string> = {}, method = 'GET') => new Promise<number>((done, reject) => {
    const req = request(base, { method, agent: false, headers: { Host: 'pre.agricola.test', ...headers } }, response => {
      response.resume(); response.on('end', () => done(response.statusCode ?? 0))
    }); req.on('error', reject); req.end()
  })
  let client: WebSocket | undefined
  try {
    expect(await read({ Origin: 'https://app.agricola.test' })).toBe(403)
    expect(await read({}, 'POST')).toBe(403)
    expect(await read({ Cookie: '__Host-oa-pre-session=one; __Host-oa-pre-session=two' })).toBe(400)
    expect(seen).toHaveLength(0)
    expect(await read({ Origin: origin, Authorization: 'Bearer must-not-reach-candidate', 'X-OA-Principal': 'untrusted',
      Cookie: 'oa_session=parent; __Host-oa-session=formal; __Host-oa-pre-session=pre' })).toBe(200)
    expect(seen[0].cookie).toBe('__Host-oa-pre-session=pre')
    expect(seen[0].authorization).toBeUndefined(); expect(seen[0]['x-oa-principal']).toBeUndefined()
    for (const [path, browserOrigin] of [['/ws', 'https://app.agricola.test'], ['/unexpected', origin], ['/ws', '']]) {
      const socket = new WebSocket(base.replace('http:', 'ws:') + path, { headers: { Host: 'pre.agricola.test', ...(browserOrigin ? { Origin: browserOrigin } : {}) } })
      const status = await new Promise<number>((done, reject) => {
        socket.on('unexpected-response', (_req, response) => { response.resume(); done(response.statusCode ?? 0); socket.terminate() })
        socket.on('open', () => { socket.terminate(); reject(new Error('Unexpected upgrade')) }); socket.on('error', () => {})
      })
      expect(status).toBe(503)
    }
    client = new WebSocket(base.replace('http:', 'ws:') + '/ws', { headers: { Host: 'pre.agricola.test', Origin: origin } })
    await once(client, 'open')
    const closed = once(client, 'close')
    formal.state.version = 1; await gateway.refreshBrowserPolicy(); await closed
    expect(await read()).toBe(503)
    formal.state.version = 2; formal.state.buildId = 'c'.repeat(40); await gateway.refreshBrowserPolicy()
    expect(await read()).toBe(503)
    formal.state.buildId = state.acceptance.formalBuildId; await gateway.refreshBrowserPolicy()
    expect(await read()).toBe(200)
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 31_000)
    expect(await read()).toBe(503)
  } finally {
    vi.restoreAllMocks(); client?.terminate(); await gateway.close()
    for (const socket of ws.clients) socket.terminate()
    await new Promise<void>(done => ws.close(() => upstream.close(() => done())))
    await formal.close(); await rm(root, { recursive: true, force: true })
  }
})

it('fails closed, proxies only the pre Host, and stops HTTP and existing WebSocket input during maintenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agricola-pre-gateway-'))
  const formal = await formalBrowserPolicyFixture()
  const stateFile = join(root, 'gate.json')
  let requests = 0
  const cookies: Array<string | undefined> = []
  const candidateCookies = ['__Host-oa-pre-session=inert; Path=/; Secure; HttpOnly; SameSite=Lax', '__Host-oa-pre-handoff=inert; Path=/; Secure; HttpOnly; SameSite=Lax', 'pre_hint=inert; Path=/; Secure', 'shared_fixture=inert; Domain=.agricola.test; Path=/', `${OWNER_VERIFICATION_COOKIE}=inert; Path=/; Secure; HttpOnly`, '__Host-oa-pre-session=inert; Path=/nested; Secure; HttpOnly', '__Host-oa-pre-handoff=inert; Path=/; Secure']
  const upstream = createServer((req, res) => { requests++; cookies.push(req.headers.cookie); res.setHeader('Set-Cookie', candidateCookies); res.setHeader('Clear-Site-Data', '"cookies"'); res.end('pre-only') })
  const sockets = new WebSocketServer({ server: upstream })
  sockets.on('headers', headers => { for (const cookie of candidateCookies) headers.push(`Set-Cookie: ${cookie}`) })
  const messages: string[] = []
  sockets.on('connection', (socket, req) => { cookies.push(req.headers.cookie); socket.on('message', body => { messages.push(body.toString()); socket.send('committed') }) })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const address = upstream.address()
  if (!address || typeof address === 'string') throw new Error('Expected fixture TCP port')
  const gateway = createPrereleaseGateway({ stateFile, targetId: 'prerelease-test', origin: 'https://pre.agricola.test', upstream: `http://127.0.0.1:${address.port}`, formal: formal.formal, ca: formal.ca })
  gateway.server.listen(0, '127.0.0.1')
  await once(gateway.server, 'listening')
  const gatewayAddress = gateway.server.address()
  if (!gatewayAddress || typeof gatewayAddress === 'string') throw new Error('Expected fixture TCP port')
  const url = `http://127.0.0.1:${gatewayAddress.port}`
  const headers = { Host: 'pre.agricola.test', Origin: 'https://pre.agricola.test' }
  const read = (host = headers.Host, cookie = '') => new Promise<{ status: number; body: string; cookies: string[] | undefined; clearSiteData: string | string[] | undefined }>((done, reject) => {
    get(url, { headers: { Host: host, Cookie: cookie } }, response => {
      let body = ''
      response.on('data', data => { body += data.toString() })
      response.on('end', () => done({ status: response.statusCode ?? 0, body, cookies: response.headers['set-cookie'], clearSiteData: response.headers['clear-site-data'] }))
    }).on('error', reject)
  })
  let client: WebSocket | undefined
  let owner: WebSocket | undefined
  try {
    expect((await read()).status).toBe(503)
    expect(requests).toBe(0)
    const state = { format: 1, targetId: 'prerelease-test', channel: 'prerelease', mode: 'open', buildId: 'a'.repeat(40), generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', acceptance: { formalBuildId: formal.state.buildId } }
    await writeFile(stateFile, JSON.stringify(state))
    await gateway.refreshBrowserPolicy()
    const proxied = await read()
    expect(proxied.body).toBe('pre-only')
    expect(proxied.cookies).toEqual(candidateCookies.slice(0, 2))
    expect(proxied.clearSiteData).toBeUndefined()
    expect((await read('api.agricola.test')).status).toBe(421)
    expect(requests).toBe(1)
    client = new WebSocket(url.replace('http:', 'ws:') + '/ws', { headers })
    let upgradeCookies: string[] | undefined
    client.on('upgrade', response => { upgradeCookies = response.headers['set-cookie'] })
    await once(client, 'open')
    expect(upgradeCookies).toEqual(candidateCookies.slice(0, 2))
    const committed = once(client, 'message')
    client.send('accepted-before-maintenance')
    await committed
    const token = 'V'.repeat(43), cookie = `${OWNER_VERIFICATION_COOKIE}=${token}; oa_session=ignore-parent; __Host-oa-pre-session=pre-test`
    const proof = { targetId: 'prerelease-test', buildId: state.buildId, generation: state.generation, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 600_000 }
    await writeFile(join(root, 'verification.json'), JSON.stringify(proof))
    owner = new WebSocket(url.replace('http:', 'ws:') + '/ws', { headers: { ...headers, Cookie: cookie } })
    await once(owner, 'open')
    const closed = once(client, 'close')
    await writeFile(stateFile, JSON.stringify({ ...state, mode: 'maintenance' }))
    client.send('must-not-be-accepted')
    await closed
    expect(messages).toEqual(['accepted-before-maintenance'])
    expect((await read()).status).toBe(503)
    expect(requests).toBe(1)
    const stillPrivate = once(owner, 'message')
    owner.send('owner-verifies-real-pre-while-public-closed')
    await stillPrivate
    expect((await read(headers.Host, cookie)).body).toBe('pre-only')
    expect(cookies.filter(Boolean)).toEqual(['__Host-oa-pre-session=pre-test', '__Host-oa-pre-session=pre-test'])
    const ownerClosed = once(owner, 'close')
    await writeFile(join(root, 'verification.json'), JSON.stringify({ ...proof, expiresAt: Date.now() - 1 }))
    owner.send('expired-owner-must-not-run')
    await ownerClosed
    expect(messages).toEqual(['accepted-before-maintenance', 'owner-verifies-real-pre-while-public-closed'])
  } finally {
    client?.terminate()
    owner?.terminate()
    await gateway.close()
    for (const socket of sockets.clients) socket.terminate()
    await new Promise<void>(done => sockets.close(() => upstream.close(() => done())))
    await formal.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('rejects authority-changing HTTP and WS request targets before forwarding pre cookies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agricola-pre-target-'))
  const formal = await formalBrowserPolicyFixture()
  let leaked = 0
  const unintended = createServer((_req, res) => { leaked++; res.end('leaked') })
  unintended.listen(0, '127.0.0.1'); await once(unintended, 'listening')
  const address = unintended.address()
  if (!address || typeof address === 'string') throw new Error('Expected fixture port')
  const stateFile = join(root, 'gate.json')
  await writeFile(stateFile, JSON.stringify({ format: 1, channel: 'prerelease', targetId: 'prerelease-test', mode: 'open', buildId: 'a'.repeat(40), generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5' }))
  const gateway = createPrereleaseGateway({ stateFile, targetId: 'prerelease-test', origin: 'https://pre.agricola.test', upstream: 'http://127.0.0.1:1', formal: formal.formal, ca: formal.ca })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  const listener = gateway.server.address()
  if (!listener || typeof listener === 'string') throw new Error('Expected gateway port')
  const base = `http://127.0.0.1:${listener.port}`, path = `//127.0.0.1:${address.port}/collect`
  try {
    const status = await new Promise<number>((done, reject) => get(base, { path, headers: { Host: 'pre.agricola.test', Cookie: 'oa_session=private-pre' } }, response => {
      response.resume(); response.on('end', () => done(response.statusCode ?? 0))
    }).on('error', reject))
    expect(status).toBe(400)
    const socket = new WebSocket(base.replace('http:', 'ws:') + path, { headers: { Host: 'pre.agricola.test', Cookie: 'oa_session=private-pre' } })
    await new Promise<void>(done => { socket.on('unexpected-response', (_req, res) => { res.resume(); socket.terminate(); done() }); socket.on('error', () => done()) })
    expect(leaked).toBe(0)
  } finally {
    await gateway.close(); unintended.closeAllConnections()
    await new Promise<void>(done => unintended.close(() => done()))
    await formal.close()
    await rm(root, { recursive: true, force: true })
  }
})
