import { readFileSync } from 'node:fs'
import { createServer, request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http'
import { join, resolve } from 'node:path'
import type { Duplex } from 'node:stream'
import { createFrontendHosting } from '../../server/frontend-hosting'
import { HOSTED_APP_PATH } from '../../shared/contract/protocol/app-location'

export type HostedReleaseApp = {
  appUrl: string
  apiUrl: string
  gameBuildId: string
  close(): Promise<void>
}

/** A loopback HTTP adapter for the compiled frontend and the isolated backend. */
export async function startHostedReleaseApp({ backendUrl, frontendOrigin, directory = 'dist' }: {
  backendUrl: string
  frontendOrigin: string
  directory?: string
}): Promise<HostedReleaseApp> {
  const backend = new URL(backendUrl), trustedOrigin = new URL(frontendOrigin)
  if (backend.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(backend.hostname)
    || backend.username || backend.password || backend.search || backend.hash || backend.pathname !== '/') {
    throw new Error('Hosted release rehearsal requires a loopback HTTP backend origin')
  }
  if (!['http:', 'https:'].includes(trustedOrigin.protocol) || trustedOrigin.username || trustedOrigin.password
    || trustedOrigin.search || trustedOrigin.hash || trustedOrigin.pathname !== '/') {
    throw new Error('The trusted frontend must be an HTTP or HTTPS origin')
  }
  const root = resolve(directory), metadata: unknown = JSON.parse(readFileSync(join(root, 'frontend-build.json'), 'utf8'))
  if (!metadata || typeof metadata !== 'object' || !('gameBuildId' in metadata)
    || typeof metadata.gameBuildId !== 'string' || !metadata.gameBuildId) {
    throw new Error('Build the hosted frontend before starting the release rehearsal')
  }
  const gameBuildId = metadata.gameBuildId, sockets = new Set<Duplex>(), requests = new Set<ClientRequest>()
  let appOrigin = '', hosting: ReturnType<typeof createFrontendHosting> | undefined, closing: Promise<void> | undefined
  const track = (socket: Duplex) => {
    if (sockets.has(socket)) return
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => socket.destroy())
  }
  const forwardedHeaders = (request: IncomingMessage) => {
    const headers = { ...request.headers, host: backend.host }
    if (headers.origin === appOrigin) headers.origin = trustedOrigin.origin
    return headers
  }
  const backendTarget = (request: IncomingMessage) => {
    const location = new URL(request.url ?? '/', appOrigin)
    return new URL(`${location.pathname}${location.search}`, backend)
  }
  const trackRequest = (request: ClientRequest) => {
    requests.add(request); request.on('close', () => requests.delete(request)); request.on('socket', track)
    return request
  }
  const server = createServer((request, response) => {
    void (async () => {
      if (!hosting) { response.writeHead(503); response.end('Hosted frontend is starting'); return }
      if (await hosting(request, response)) return
      const path = new URL(request.url ?? '/', appOrigin).pathname
      if (!/^\/api(?:\/|$)/.test(path)) { response.writeHead(404); response.end('Not found'); return }
      let cancelled = false
      const upstream = trackRequest(httpRequest(backendTarget(request), {
        method: request.method, headers: forwardedHeaders(request),
      }, result => { response.writeHead(result.statusCode ?? 502, result.headers); result.pipe(response) }))
      upstream.on('error', () => {
        if (cancelled || response.destroyed || response.writableEnded) return
        if (!response.headersSent) response.writeHead(502)
        response.end('Isolated backend unavailable')
      })
      request.on('aborted', () => { cancelled = true; upstream.destroy() })
      response.on('close', () => { if (!response.writableEnded) { cancelled = true; upstream.destroy() } })
      request.pipe(upstream)
    })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end('Hosted release adapter failed') })
  })
  server.on('connection', track)
  server.on('upgrade', (request, socket, head) => {
    const path = new URL(request.url ?? '/', backend).pathname
    if (!/^\/nodes\/[A-Za-z0-9-]+\/ws$/.test(path)) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return
    }
    const upstream = trackRequest(httpRequest(backendTarget(request), { headers: forwardedHeaders(request) }))
    const writeHead = (result: IncomingMessage) => {
      const headers = result.rawHeaders.reduce((text, value, index, values) => index % 2 ? text : `${text}${value}: ${values[index + 1]}\r\n`, '')
      socket.write(`HTTP/${result.httpVersion} ${result.statusCode ?? 502} ${result.statusMessage ?? ''}\r\n${headers}\r\n`)
    }
    upstream.on('upgrade', (result, transport, upstreamHead) => {
      track(transport); writeHead(result)
      if (head.length) transport.write(head)
      if (upstreamHead.length) socket.write(upstreamHead)
      socket.on('close', () => transport.destroy()); transport.on('close', () => socket.destroy())
      socket.pipe(transport).pipe(socket)
    })
    upstream.on('response', result => { writeHead(result); result.pipe(socket) })
    upstream.on('error', () => socket.destroy())
    socket.on('close', () => upstream.destroy())
    upstream.end()
  })
  const close = () => closing ??= (async () => {
    for (const request of requests) request.destroy()
    for (const socket of sockets) socket.destroy()
    await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()))
  })()
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Hosted release adapter requires a TCP port')
    appOrigin = `http://127.0.0.1:${address.port}`
    hosting = createFrontendHosting({ FRONTEND_ROOT: root, GAME_BUILD_ID: gameBuildId,
      PUBLIC_APP_ORIGIN: `${appOrigin}${HOSTED_APP_PATH}`, PUBLIC_API_BASE: appOrigin })
    return { appUrl: `${appOrigin}${HOSTED_APP_PATH}`, apiUrl: appOrigin, gameBuildId, close }
  } catch (error) { await close(); throw error }
}
