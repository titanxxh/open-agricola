import { createServer, get } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { createHash } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { expect, it } from 'vitest'
import { createPrereleaseGateway, OWNER_VERIFICATION_COOKIE } from '../prerelease/gateway'

it('fails closed, proxies only the pre Host, and stops HTTP and existing WebSocket input during maintenance', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agricola-pre-gateway-'))
  const stateFile = join(root, 'gate.json')
  let requests = 0
  const cookies: Array<string | undefined> = []
  const upstream = createServer((req, res) => { requests++; cookies.push(req.headers.cookie); res.end('pre-only') })
  const sockets = new WebSocketServer({ server: upstream })
  const messages: string[] = []
  sockets.on('connection', (socket, req) => { cookies.push(req.headers.cookie); socket.on('message', body => { messages.push(body.toString()); socket.send('committed') }) })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const address = upstream.address()
  if (!address || typeof address === 'string') throw new Error('Expected fixture TCP port')
  const gateway = createPrereleaseGateway({ stateFile, targetId: 'prerelease-test', origin: 'https://pre.agricola.test', upstream: `http://127.0.0.1:${address.port}` })
  gateway.server.listen(0, '127.0.0.1')
  await once(gateway.server, 'listening')
  const gatewayAddress = gateway.server.address()
  if (!gatewayAddress || typeof gatewayAddress === 'string') throw new Error('Expected fixture TCP port')
  const url = `http://127.0.0.1:${gatewayAddress.port}`
  const headers = { Host: 'pre.agricola.test' }
  const read = (host = headers.Host, cookie = '') => new Promise<{ status: number; body: string }>((done, reject) => {
    get(url, { headers: { Host: host, Cookie: cookie } }, response => {
      let body = ''
      response.on('data', data => { body += data.toString() })
      response.on('end', () => done({ status: response.statusCode ?? 0, body }))
    }).on('error', reject)
  })
  let client: WebSocket | undefined
  let owner: WebSocket | undefined
  try {
    expect((await read()).status).toBe(503)
    expect(requests).toBe(0)
    const state = { format: 1, targetId: 'prerelease-test', channel: 'prerelease', mode: 'open', buildId: 'a'.repeat(40), generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5' }
    await writeFile(stateFile, JSON.stringify(state))
    expect((await read()).body).toBe('pre-only')
    expect((await read('api.agricola.test')).status).toBe(421)
    expect(requests).toBe(1)
    client = new WebSocket(url.replace('http:', 'ws:'), { headers })
    await once(client, 'open')
    const committed = once(client, 'message')
    client.send('accepted-before-maintenance')
    await committed
    const token = 'V'.repeat(43), cookie = `${OWNER_VERIFICATION_COOKIE}=${token}; oa_session=pre-test`
    const proof = { targetId: 'prerelease-test', buildId: state.buildId, generation: state.generation, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 600_000 }
    await writeFile(join(root, 'verification.json'), JSON.stringify(proof))
    owner = new WebSocket(url.replace('http:', 'ws:'), { headers: { ...headers, Cookie: cookie } })
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
    expect(cookies.filter(Boolean)).toEqual(['oa_session=pre-test', 'oa_session=pre-test'])
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
    await rm(root, { recursive: true, force: true })
  }
})

it('rejects authority-changing HTTP and WS request targets before forwarding pre cookies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'agricola-pre-target-'))
  let leaked = 0
  const unintended = createServer((_req, res) => { leaked++; res.end('leaked') })
  unintended.listen(0, '127.0.0.1'); await once(unintended, 'listening')
  const address = unintended.address()
  if (!address || typeof address === 'string') throw new Error('Expected fixture port')
  const stateFile = join(root, 'gate.json')
  await writeFile(stateFile, JSON.stringify({ format: 1, channel: 'prerelease', targetId: 'prerelease-test', mode: 'open', buildId: 'a'.repeat(40), generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5' }))
  const gateway = createPrereleaseGateway({ stateFile, targetId: 'prerelease-test', origin: 'https://pre.agricola.test', upstream: 'http://127.0.0.1:1' })
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
    await rm(root, { recursive: true, force: true })
  }
})
