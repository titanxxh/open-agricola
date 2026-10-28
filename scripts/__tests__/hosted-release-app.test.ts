import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request, type IncomingMessage, type OutgoingHttpHeaders, type Server, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Duplex } from 'node:stream'
import { expect, it } from 'vitest'
import { startHostedReleaseApp, type HostedReleaseApp } from '../../e2e-tests/helpers/hosted-release-app'

async function withHostedBackend<Control>(configure: (server: Server) => Control,
  run: (hosted: HostedReleaseApp, control: Control) => Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), 'hosted-release-app-'))
  writeFileSync(join(directory, 'index.html'), '<!doctype html><title>Release fixture</title>')
  writeFileSync(join(directory, 'frontend-build.json'), JSON.stringify({ format: 1, gameBuildId: 'test-release-build', basePath: '/open-agricola/' }))
  const backend = createServer(), sockets = new Set<Duplex>(), control = configure(backend)
  backend.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)) })
  let hosted: HostedReleaseApp | undefined
  try {
    await new Promise<void>((resolve, reject) => { backend.once('error', reject); backend.listen(0, '127.0.0.1', resolve) })
    const address = backend.address()
    if (!address || typeof address === 'string') throw new Error('The fixture needs a loopback TCP port')
    hosted = await startHostedReleaseApp({ backendUrl: `http://127.0.0.1:${address.port}`, frontendOrigin: 'http://127.0.0.1:5173', directory })
    await run(hosted, control)
  } finally {
    try { await hosted?.close() } finally {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve, reject) => backend.close(error => error ? reject(error) : resolve()))
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

function openResponse(url: string, headers: OutgoingHttpHeaders = {}): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const outgoing = request(url, { headers, agent: false }, resolve)
    outgoing.on('error', reject)
    outgoing.end()
  })
}

function firstByte(response: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    response.once('data', (chunk: unknown) => resolve(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)))
    response.once('error', reject)
  })
}

function termination(response: IncomingMessage): Promise<'end' | 'aborted' | 'error' | 'timeout'> {
  return new Promise(resolve => {
    const finish = (event: 'end' | 'aborted' | 'error' | 'timeout') => { clearTimeout(deadline); resolve(event) }
    const deadline = setTimeout(() => finish('timeout'), 500)
    response.once('end', () => finish('end'))
    response.once('aborted', () => finish('aborted'))
    response.once('error', () => finish('error'))
  })
}

it('forwards API status, body and Set-Cookie and closes idempotently', async () => {
  await withHostedBackend(backend => {
    backend.on('request', (_incoming, response) => {
      response.writeHead(201, { 'Content-Type': 'application/json', 'Set-Cookie': ['session=fixture; HttpOnly; SameSite=Lax', 'other=value; Path=/'] })
      response.end('{"created":true}')
    })
  }, async hosted => {
    const response = await openResponse(`${hosted.apiUrl}/api/probe`), chunks: string[] = []
    response.on('data', (chunk: unknown) => chunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)))
    expect(await termination(response)).toBe('end')
    expect(response.statusCode).toBe(201)
    expect(chunks.join('')).toBe('{"created":true}')
    expect(response.headers['set-cookie']).toEqual(['session=fixture; HttpOnly; SameSite=Lax', 'other=value; Path=/'])
    await Promise.all([hosted.close(), hosted.close()])
    await expect(openResponse(`${hosted.apiUrl}/api/probe`)).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })
})

it.each([
  { name: 'an HTTP API response', path: '/api/probe', headers: {}, event: 'request' },
  { name: 'a rejected WebSocket upgrade', path: '/nodes/n1/ws', headers: { Connection: 'Upgrade', Upgrade: 'websocket' }, event: 'upgrade' },
])('aborts the client when the backend interrupts $name', async ({ path, headers, event }) => {
  await withHostedBackend(backend => {
    const upstreams = new Set<ServerResponse | Duplex>(), received: { event: string; path: string | undefined }[] = []
    backend.on('request', (incoming, response) => {
      received.push({ event: 'request', path: incoming.url }); upstreams.add(response)
      response.writeHead(503, { 'Content-Length': '100' }); response.write('x')
    })
    backend.on('upgrade', (incoming, socket) => {
      received.push({ event: 'upgrade', path: incoming.url }); upstreams.add(socket)
      socket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 100\r\n\r\nx')
    })
    return { received, abort: () => { for (const upstream of upstreams) upstream.destroy() } }
  }, async (hosted, control) => {
    const response = await openResponse(`${hosted.apiUrl}${path}`, headers)
    expect(response.statusCode).toBe(503)
    expect(await firstByte(response)).toBe('x')
    expect(control.received).toEqual([{ event, path }])
    const completed = termination(response)
    control.abort()
    expect(['aborted', 'error']).toContain(await completed)
  })
})
