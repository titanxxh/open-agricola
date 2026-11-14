import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocket, WebSocketServer } from 'ws'
import { expect, it, vi } from 'vitest'
import { createPrereleaseGateway, OWNER_VERIFICATION_COOKIE } from '../prerelease/gateway'
import { formalBrowserPolicyFixture } from './prerelease-browser-policy-fixture'

const origin = 'https://pre.agricola.test'
const host = 'pre.agricola.test'
const ownerCookie = `${OWNER_VERIFICATION_COOKIE}=${'V'.repeat(43)}`
const viewerPath = `/replay-viewers/${'c'.repeat(64)}/assets/viewer.js`

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'pre-classification-'))
  const formal = await formalBrowserPolicyFixture()
  const generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5'
  const healthyCycle = 'ee4d6c82-676f-4dcc-a570-52377b3b32f5'
  const verificationFile = join(root, 'verification.json')
  await writeFile(join(root, 'gate.json'), JSON.stringify({ format: 1, channel: 'prerelease', targetId: 'prerelease-test',
    mode: 'maintenance', buildId: 'a'.repeat(40), generation }))
  await writeFile(join(root, 'storage-guard.json'), JSON.stringify({ format: 1, targetId: 'prerelease-test', fingerprint: 'f'.repeat(64),
    status: 'healthy', healthyCycle, observedAt: Date.now(), validUntil: Date.now() + 120_000, operationsAllowed: true }))
  await writeFile(verificationFile, JSON.stringify({ targetId: 'prerelease-test', buildId: 'a'.repeat(40), generation,
    healthyCycle, tokenHash: createHash('sha256').update('V'.repeat(43)).digest('hex'), expiresAt: Date.now() + 600_000 }))
  const requests: string[] = [], messages: string[] = []
  const upstream = createServer((req, res) => {
    requests.push(req.url ?? '')
    if (req.url === '/stream') { res.write('before revocation'); return }
    res.end('candidate-only')
  })
  const sockets = new WebSocketServer({ server: upstream })
  sockets.on('connection', socket => socket.on('message', body => { messages.push(body.toString()); socket.send('accepted') }))
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
  const upstreamAddress = upstream.address()
  if (!upstreamAddress || typeof upstreamAddress === 'string') throw new Error('Expected upstream port')
  // Trigger only the permission sweep, without sleeping or changing lease clocks.
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  const gateway = createPrereleaseGateway({ stateFile: join(root, 'gate.json'), targetId: 'prerelease-test', origin,
    upstream: `http://127.0.0.1:${upstreamAddress.port}`, formal: formal.formal, ca: formal.ca })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening'); await gateway.refreshBrowserPolicy()
  const address = gateway.server.address()
  if (!address || typeof address === 'string') throw new Error('Expected gateway port')
  let gatewayClosed = false
  const closeGateway = async () => {
    if (gatewayClosed) return
    gatewayClosed = true
    await gateway.close()
  }
  return { gateway, port: address.port, verificationFile, requests, messages, closeGateway, close: async () => {
    try { await closeGateway() } finally {
      vi.useRealTimers()
      for (const socket of sockets.clients) socket.terminate()
      await new Promise<void>(done => sockets.close(() => done()))
      upstream.closeAllConnections()
      await new Promise<void>(done => upstream.close(() => done()))
      await formal.close()
      await rm(root, { recursive: true, force: true })
    }
  } }
}

type ClassificationCase = { name: string; path: string; headers: Record<string, string>; revoked: boolean; status: number }
const cases: ClassificationCase[] = [
  { name: 'ordinary archive reader', path: '/api/v1/replays/fixture/manifest', headers: {}, revoked: false, status: 503 },
  { name: 'current owner', path: '/', headers: { Cookie: ownerCookie }, revoked: false, status: 200 },
  { name: 'credentialless Viewer', path: viewerPath, headers: { Origin: 'null' }, revoked: false, status: 200 },
  { name: 'revoked owner', path: '/', headers: { Cookie: ownerCookie }, revoked: true, status: 503 },
  { name: 'revoked Viewer', path: viewerPath, headers: { Origin: 'null' }, revoked: true, status: 503 },
]

it.each(cases)('classifies $name after a permission sweep instead of resetting its pending TCP connection', async scenario => {
  const value = await fixture()
  const accepted = once(value.gateway.server, 'connection')
  type Outcome = { kind: 'response'; status: number | undefined; body: string } | { kind: 'error'; message: string }
  const pending = request({ hostname: '127.0.0.1', port: value.port, path: scenario.path, method: 'GET', agent: false,
    headers: { Host: host, ...scenario.headers } })
  const outcome = new Promise<Outcome>(resolve => {
    pending.on('response', response => {
      let body = ''
      response.on('data', chunk => { body += chunk.toString() })
      response.on('end', () => resolve({ kind: 'response', status: response.statusCode, body }))
      response.on('error', error => resolve({ kind: 'error', message: error.message }))
    })
    pending.on('error', error => resolve({ kind: 'error', message: error.message }))
  })
  pending.setTimeout(2000, () => pending.destroy(new Error('Gateway did not return an HTTP decision')))
  try {
    await accepted
    if (scenario.revoked) await writeFile(value.verificationFile, '{}')
    await vi.advanceTimersByTimeAsync(1000)
    pending.end()
    expect(await outcome).toEqual({ kind: 'response', status: scenario.status, body: scenario.status === 200
      ? 'candidate-only' : JSON.stringify({ ok: false, code: 'prerelease_maintenance' }) })
    expect(value.requests).toEqual(scenario.status === 200 ? [scenario.path] : [])
  } finally { pending.destroy(); await value.close() }
})

it('still closes classified HTTP streams and WebSockets on revocation and forwards no later message', async () => {
  const value = await fixture()
  const pending = request({ hostname: '127.0.0.1', port: value.port, path: '/stream', agent: false,
    headers: { Host: host, Cookie: ownerCookie } })
  const stream = new Promise<{ closed: Promise<void> }>((resolve, reject) => {
    pending.on('response', response => {
      response.on('error', () => {})
      const closed = new Promise<void>(done => { response.once('close', () => done()) })
      response.once('data', () => resolve({ closed }))
    })
    pending.on('error', reject)
  })
  let client: WebSocket | undefined
  try {
    pending.end()
    const openedStream = await stream
    client = new WebSocket(`ws://127.0.0.1:${value.port}/ws`, { headers: { Host: host, Origin: origin, Cookie: ownerCookie } })
    await once(client, 'open')
    const reply = once(client, 'message')
    client.send('before revocation'); await reply
    const closed = once(client, 'close')
    await writeFile(value.verificationFile, '{}')
    client.send('must not reach candidate')
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.all([openedStream.closed, closed])
    expect(value.messages).toEqual(['before revocation'])
  } finally { pending.destroy(); client?.terminate(); await value.close() }
})

it('global shutdown also destroys connections that have not sent any HTTP headers', async () => {
  const value = await fixture()
  const accepted = once(value.gateway.server, 'connection')
  const socket = connect(value.port, '127.0.0.1')
  socket.on('error', () => {})
  try {
    await accepted
    const closed = once(socket, 'close')
    await value.closeGateway(); await closed
    expect(socket.destroyed).toBe(true)
    expect(value.requests).toEqual([])
  } finally { socket.destroy(); await value.close() }
})
