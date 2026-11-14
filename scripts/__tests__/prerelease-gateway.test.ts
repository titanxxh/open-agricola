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

const healthyCycle = 'ee4d6c82-676f-4dcc-a570-52377b3b32f5'
const recoveredCycle = 'ff4d6c82-676f-4dcc-a570-52377b3b32f5'

function healthyGuard(cycle = healthyCycle) {
  const observedAt = Date.now()
  return { format: 1, targetId: 'prerelease-test', fingerprint: 'f'.repeat(64), status: 'healthy', healthyCycle: cycle, observedAt, validUntil: observedAt + 120_000, operationsAllowed: true }
}

it('rejects ambiguous credentials and foreign browser requests and closes streams when formal protection changes', async () => {
  const formal = await formalBrowserPolicyFixture(), root = await mkdtemp(join(tmpdir(), 'pre-gateway-policy-'))
  await writeFile(join(root, 'storage-guard.json'), JSON.stringify(healthyGuard()))
  const stateFile = join(root, 'gate.json'), origin = 'https://pre.agricola.test'
  const state = { format: 1, targetId: 'prerelease-test', channel: 'prerelease', mode: 'open', buildId: 'a'.repeat(40),
    generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', acceptance: { healthyCycle, formalBuildId: formal.state.buildId } }
  await writeFile(stateFile, JSON.stringify(state))
  const seen: IncomingHttpHeaders[] = []
  const upgraded: Array<{ path: string | undefined; headers: IncomingHttpHeaders }> = []
  const messages: string[] = []
  const upstream = createServer((req, res) => { seen.push(req.headers); res.end('ok') })
  const ws = new WebSocketServer({ server: upstream })
  ws.on('connection', (socket, req) => {
    upgraded.push({ path: req.url, headers: req.headers })
    socket.on('message', body => { messages.push(body.toString()) })
  })
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
  const upgradeStatus = (path: string, headers: Record<string, string> = {}) => new Promise<number>((done, reject) => {
    const req = request(base, { path, agent: false, headers: {
      Host: 'pre.agricola.test', Origin: origin, Connection: 'Upgrade', Upgrade: 'websocket',
      'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==', 'Sec-WebSocket-Version': '13', ...headers,
    } }, response => {
      response.resume(); response.on('end', () => done(response.statusCode ?? 0))
    })
    req.on('upgrade', (_response, socket) => { socket.destroy(); reject(new Error(`Unexpected upgrade: ${path}`)) })
    req.on('error', reject); req.end()
  })
  let client: WebSocket | undefined
  try {
    expect(await read({ Origin: 'https://app.agricola.test' })).toBe(403)
    expect(await read({}, 'POST')).toBe(403)
    expect(await read({ Cookie: '__Host-oa-pre-session=one; __Host-oa-pre-session=two' })).toBe(400)
    expect(seen).toHaveLength(0)
    expect(await read({ Origin: origin, Authorization: 'Bearer must-not-reach-candidate', 'X-OA-Principal': 'untrusted',
      Cookie: 'oa_session=parent; __Host-oa-session=formal; __Host-oa-pre-session=pre',
      'X-OA-Pre-Build': 'opaque-build-binding', 'X-OA-Pre-Generation': 'opaque-generation-binding' })).toBe(200)
    expect(seen[0]['x-oa-pre-build']).toBe('opaque-build-binding')
    expect(seen[0]['x-oa-pre-generation']).toBe('opaque-generation-binding')
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
    const routedPath = '/nodes/f81d4fae-7dec-11d0-a765-00a0c91e6bf6/ws?resume=room%2Fone&attempt=2'
    for (const path of [
      '/nodes//ws', '/nodes/node_id/ws', '/nodes/node.id/ws', '/nodes/node%2Fid/ws', '/nodes/%6eode/ws',
      '/nodes/node/ws/', '/nodes/node/ws/extra', '/nodes/node/http', '/nodes/node//ws',
      '/nodes/node/../node/ws', '/nodes/node/%2e%2e/node/ws', '/not-a-route/../ws',
      '/nodes/node/ws#fragment', '/nodes/node/ws?room=one#fragment',
    ]) expect(await upgradeStatus(path), path).toBe(503)
    expect(await upgradeStatus(routedPath, { Host: 'app.agricola.test' })).toBe(503)
    expect(await upgradeStatus(routedPath, { Origin: 'https://app.agricola.test' })).toBe(503)
    expect(await upgradeStatus(routedPath, { Cookie: '__Host-oa-pre-session=one; __Host-oa-pre-session=two' })).toBe(400)
    expect(upgraded).toHaveLength(0)
    client = new WebSocket(base.replace('http:', 'ws:') + routedPath, { headers: { Host: 'pre.agricola.test', Origin: origin,
      Authorization: 'Bearer must-not-reach-candidate', 'X-OA-Principal': 'untrusted',
      Cookie: 'oa_session=parent; __Host-oa-session=formal; __Host-oa-pre-session=pre' } })
    await once(client, 'open')
    expect(upgraded).toHaveLength(1)
    expect(upgraded[0].path).toBe(routedPath)
    expect(upgraded[0].headers).toMatchObject({ host: 'pre.agricola.test', origin,
      cookie: '__Host-oa-pre-session=pre', 'x-forwarded-host': 'pre.agricola.test', 'x-forwarded-proto': 'https' })
    expect(upgraded[0].headers.authorization).toBeUndefined()
    expect(upgraded[0].headers['x-oa-principal']).toBeUndefined()
    const closed = once(client, 'close')
    formal.state.version = 1; await gateway.refreshBrowserPolicy(); await closed
    expect(await read()).toBe(503)
    formal.state.version = 2; formal.state.buildId = 'c'.repeat(40); await gateway.refreshBrowserPolicy()
    expect(await read()).toBe(503)
    formal.state.buildId = state.acceptance.formalBuildId; await gateway.refreshBrowserPolicy()
    expect(await read()).toBe(200)
    client = new WebSocket(base.replace('http:', 'ws:') + routedPath, { headers: { Host: 'pre.agricola.test', Origin: origin } })
    await once(client, 'open')
    const guardClosed = once(client, 'close')
    await writeFile(join(root, 'storage-guard.json'), JSON.stringify({ status: 'latched' }))
    client.send('storage-latch-must-not-forward')
    await guardClosed
    expect(await read()).toBe(503)
    expect(messages).toEqual([])
    await writeFile(join(root, 'storage-guard.json'), JSON.stringify(healthyGuard()))
    await writeFile(join(root, 'storage-guard.json'), JSON.stringify(healthyGuard(recoveredCycle)))
    expect(await read()).toBe(503)
    expect(await upgradeStatus(routedPath)).toBe(503)
    await writeFile(stateFile, JSON.stringify({ ...state, acceptance: { ...state.acceptance, healthyCycle: recoveredCycle } }))
    expect(await read()).toBe(200)
    client = new WebSocket(base.replace('http:', 'ws:') + routedPath, { headers: { Host: 'pre.agricola.test', Origin: origin } })
    await once(client, 'open')
    const leaseExpired = once(client, 'close')
    const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now + 31_000)
    client.send('expired-policy-must-not-forward')
    await leaseExpired
    expect(messages).toEqual([])
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
  await writeFile(join(root, 'storage-guard.json'), JSON.stringify(healthyGuard()))
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
    const state = { format: 1, targetId: 'prerelease-test', channel: 'prerelease', mode: 'open', buildId: 'a'.repeat(40), generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', acceptance: { healthyCycle, formalBuildId: formal.state.buildId } }
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
    const proof = { healthyCycle, targetId: 'prerelease-test', buildId: state.buildId, generation: state.generation, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 600_000 }
    await writeFile(join(root, 'verification.json'), JSON.stringify(proof))
    owner = new WebSocket(url.replace('http:', 'ws:') + '/nodes/bb4d6c82-676f-4dcc-a570-52377b3b32f5/ws?owner=verification', { headers: { ...headers, Cookie: cookie } })
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
    const incidentClosed = once(owner, 'close')
    await writeFile(join(root, 'storage-guard.json'), JSON.stringify(healthyGuard(recoveredCycle)))
    owner.send('old-cycle-owner-must-not-run'); await incidentClosed
    expect((await read(headers.Host, cookie)).status).toBe(503)
    const exchange = () => new Promise<number>((done, reject) => {
      const req = request(url + '/__prerelease_verify', { method: 'POST', headers }, response => {
        response.resume(); response.on('end', () => done(response.statusCode ?? 0))
      }); req.on('error', reject); req.end(JSON.stringify({ token }))
    })
    expect(await exchange()).toBe(403)
    await writeFile(join(root, 'verification.json'), JSON.stringify({ ...proof, healthyCycle: recoveredCycle }))
    expect(await exchange()).toBe(204)
    expect((await read(headers.Host, cookie)).status).toBe(200)
    owner = new WebSocket(url.replace('http:', 'ws:') + '/ws', { headers: { ...headers, Cookie: cookie } })
    await once(owner, 'open')
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
  const forwardedCookies: Array<string | undefined> = []
  const upstream = createServer((req, res) => { forwardedCookies.push(req.headers.cookie); res.end('candidate-open') })
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
  const upstreamAddress = upstream.address()
  if (!upstreamAddress || typeof upstreamAddress === 'string') throw new Error('Expected upstream port')
  let leaked = 0
  const unintended = createServer((_req, res) => { leaked++; res.end('leaked') })
  unintended.listen(0, '127.0.0.1'); await once(unintended, 'listening')
  const address = unintended.address()
  if (!address || typeof address === 'string') throw new Error('Expected fixture port')
  await writeFile(join(root, 'storage-guard.json'), JSON.stringify(healthyGuard()))
  const stateFile = join(root, 'gate.json')
  const state = { format: 1, channel: 'prerelease', targetId: 'prerelease-test', mode: 'open', buildId: 'a'.repeat(40),
    generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', acceptance: { healthyCycle, formalBuildId: formal.state.buildId } }
  await writeFile(stateFile, JSON.stringify(state))
  const gateway = createPrereleaseGateway({ stateFile, targetId: state.targetId, origin: 'https://pre.agricola.test',
    upstream: `http://127.0.0.1:${upstreamAddress.port}`, formal: formal.formal, ca: formal.ca })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening'); await gateway.refreshBrowserPolicy()
  const listener = gateway.server.address()
  if (!listener || typeof listener === 'string') throw new Error('Expected gateway port')
  const base = `http://127.0.0.1:${listener.port}`, path = `//127.0.0.1:${address.port}/collect`
  const headers = { Host: 'pre.agricola.test', Origin: 'https://pre.agricola.test', Cookie: '__Host-oa-pre-session=real-pre-cookie' }
  const read = (path: string) => new Promise<{ status: number; body: string }>((done, reject) => get(base, { path, agent: false, headers }, response => {
    let body = ''
    response.on('data', chunk => { body += chunk.toString() })
    response.on('end', () => done({ status: response.statusCode ?? 0, body })); response.on('error', reject)
  }).on('error', reject))
  let socket: WebSocket | undefined
  try {
    expect(await read('/')).toEqual({ status: 200, body: 'candidate-open' })
    expect(forwardedCookies).toEqual(['__Host-oa-pre-session=real-pre-cookie'])
    expect((await read(path)).status).toBe(400)
    const client = new WebSocket(base.replace('http:', 'ws:') + path, { headers }); socket = client
    const status = await new Promise<number>((done, reject) => {
      let responseReceived = false
      client.on('unexpected-response', (_req, res) => { responseReceived = true; res.resume(); done(res.statusCode ?? 0); client.terminate() })
      client.on('open', () => { client.terminate(); reject(new Error('Unexpected authority-changing WebSocket upgrade')) })
      client.on('error', error => { if (!responseReceived) reject(error) })
    })
    expect(status).toBe(503)
    expect(forwardedCookies).toEqual(['__Host-oa-pre-session=real-pre-cookie'])
    expect(leaked).toBe(0)
  } finally {
    socket?.terminate()
    await gateway.close(); unintended.closeAllConnections(); upstream.closeAllConnections()
    await Promise.all([
      new Promise<void>(done => unintended.close(() => done())),
      new Promise<void>(done => upstream.close(() => done())),
    ])
    await formal.close()
    await rm(root, { recursive: true, force: true })
  }
})

it('admits credentialless opaque-origin Viewer programs without opening private or credential-bearing reads', async () => {
  const formal = await formalBrowserPolicyFixture(), root = await mkdtemp(join(tmpdir(), 'pre-viewer-program-'))
  const stateFile = join(root,'gate.json')
  await writeFile(join(root,'storage-guard.json'),JSON.stringify(healthyGuard()))
  await writeFile(stateFile,JSON.stringify({format:1,targetId:'prerelease-test',channel:'prerelease',mode:'open',buildId:'a'.repeat(40),
    generation:'bb4d6c82-676f-4dcc-a570-52377b3b32f5',acceptance:{healthyCycle,formalBuildId:formal.state.buildId}}))
  const seen: Array<{path:string|undefined;headers:IncomingHttpHeaders}> = []
  const upstream = createServer((req,res)=>{seen.push({path:req.url,headers:req.headers});res.setHeader('Access-Control-Allow-Origin','*');res.end('immutable program')})
  upstream.listen(0,'127.0.0.1'); await once(upstream,'listening')
  const address = upstream.address()
  if(!address || typeof address === 'string') throw new Error('Missing program upstream')
  const gateway = createPrereleaseGateway({stateFile,targetId:'prerelease-test',origin:'https://pre.agricola.test',formal:formal.formal,ca:formal.ca,upstream:`http://127.0.0.1:${address.port}`})
  gateway.server.listen(0,'127.0.0.1'); await once(gateway.server,'listening'); await gateway.refreshBrowserPolicy()
  const listener = gateway.server.address()
  if(!listener || typeof listener === 'string') throw new Error('Missing program gateway')
  const program = `/replay-viewers/${'b'.repeat(64)}/assets/viewer.js`
  const read = (path:string,headers:Record<string,string | undefined>={},method='GET')=>new Promise<number>((resolve,reject)=>{
    const req=request(`http://127.0.0.1:${listener.port}`,{path,method,agent:false,
      headers:Object.fromEntries(Object.entries({host:'pre.agricola.test',origin:'null',...headers}).filter(([,value])=>value!==undefined))},response=>{response.resume();response.on('end',()=>resolve(response.statusCode??0))})
    req.on('error',reject);req.end()
  })
  try {
    expect(await read(program)).toBe(200)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toMatchObject({path:program,headers:{origin:'null',host:'pre.agricola.test'}})
    expect(seen[0].headers.cookie).toBeUndefined();expect(seen[0].headers.authorization).toBeUndefined()
    const deniedHeaders: Record<string,string>[] = [{cookie:'__Host-oa-pre-session=private'},{authorization:'Bearer private'},{'proxy-authorization':'Basic private'},{'x-oa-browser-protocol':'2'},{'sec-websocket-protocol':'oa-browser-v2'},{'x-open-agricola-client-capabilities':'private'},{'x-oa-pre-build':'a'.repeat(40)},{'x-oa-pre-generation':'bb4d6c82-676f-4dcc-a570-52377b3b32f5'},{origin:'https://sibling.agricola.test'}]
    for(const headers of deniedHeaders) expect(await read(program,headers)).toBe(403)
    for(const path of ['/api/v1/replays/room/manifest',`/replay-assets/${'b'.repeat(64)}`,`/card-art/image.png`,program.replace('b'.repeat(64),'current'),program+'/../viewer.js',program.replace('viewer.js','%2e%2e/private'),program+'?unexpected=private']) expect(await read(path)).toBe(403)
    expect(await read(program,{},'POST')).toBe(403)
    expect(seen).toHaveLength(1)
    await writeFile(stateFile,JSON.stringify({format:1,targetId:'prerelease-test',channel:'prerelease',mode:'maintenance',buildId:'a'.repeat(40),generation:'bb4d6c82-676f-4dcc-a570-52377b3b32f5'}))
    expect(await read(program)).toBe(503)
    expect(seen).toHaveLength(1)
    const verification = { targetId: 'prerelease-test', buildId: 'a'.repeat(40), generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5',
      healthyCycle, tokenHash: createHash('sha256').update('V'.repeat(43)).digest('hex'), expiresAt: Date.now() + 600_000 }
    const verificationFile = join(root, 'verification.json')
    await writeFile(verificationFile, JSON.stringify(verification))
    expect(await read(program)).toBe(200)
    const entry = `/replay-viewers/${'b'.repeat(64)}/index.html`
    expect(await read(entry + '?room=fixture&bridge=opaque', { origin: undefined })).toBe(200)
    expect(seen.at(-1)?.path).toBe(entry)
    expect(await read(entry + '?room=fixture', { origin: undefined,
      cookie: `${OWNER_VERIFICATION_COOKIE}=${'V'.repeat(43)}; __Host-oa-pre-session=private`, 'x-oa-pre-build': 'a'.repeat(40) })).toBe(200)
    expect(seen.at(-1)).toMatchObject({ path: entry })
    expect(seen.at(-1)?.headers.cookie).toBeUndefined()
    expect(seen.at(-1)?.headers['x-oa-pre-build']).toBeUndefined()
    for (const headers of deniedHeaders) expect(await read(program, headers)).toBe(403)
    for (const path of ['/', '/api/v1/replays/room/manifest', `/replay-assets/${'b'.repeat(64)}`]) {
      expect(await read(path, { origin: undefined })).toBe(503)
    }
    for (const invalid of [{ targetId: 'prerelease-other' }, { buildId: 'c'.repeat(40) }, { generation: 'other' },
      { healthyCycle: recoveredCycle }, { tokenHash: '' }, { expiresAt: Date.now() - 1 }, { expiresAt: Date.now() + 700_000 }]) {
      await writeFile(verificationFile, JSON.stringify({ ...verification, ...invalid }))
      expect(await read(program)).toBe(503)
    }
    await writeFile(verificationFile, JSON.stringify(verification))
    expect(await read(program)).toBe(200)
    formal.state.version = 1
    await gateway.refreshBrowserPolicy()
    expect(await read(program)).toBe(503)
  } finally {await gateway.close();upstream.closeAllConnections();await new Promise<void>(resolve=>upstream.close(()=>resolve()));await formal.close();await rm(root,{recursive:true,force:true})}
})
