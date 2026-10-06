import { createObservationDatabase } from './observability/database'
import type { PostgresDatabase } from './database/postgres'
import { createCollector } from './observability/collector'
import { metricsAuthorized } from './observability/http'
import { operationsMetrics } from './observability/metrics'
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import { RoomDirectory } from './game/room-directory'
import { getDb, initializeDatabase } from './db'
import { installShutdownHandlers } from './shutdown'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { clientIp } from './client-ip'

const AFFINITY_COOKIE = 'agricola_instance'
const jsonError = (res: ServerResponse, status: number, message: string) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify({ ok: false, code: 'instance_unavailable', message }))
}
const nodePath = /^\/nodes\/([A-Za-z0-9-]+)\/ws(?:\?(.*))?$/

/** One public origin. Routing cookies convey affinity only, never authentication. */
export function createPublicIngress(directory: RoomDirectory, secureCookies: boolean, trustProxy = process.env.REPLAY_TRUST_PROXY === 'true' || process.env.REPLAY_TRUST_PROXY === '1', observationDb?: PostgresDatabase) {
  const collect = createCollector(directory.db, 'ingress', undefined, undefined, undefined, observationDb)
  let next = 0
  const sockets = new Set<Duplex>()
  const forwarded = (req: IncomingMessage, upgrade = false) => ({
    ...req.headers,
    'x-forwarded-for': clientIp(req, trustProxy),
    'x-forwarded-proto': secureCookies ? 'https' : 'http',
    'x-forwarded-host': req.headers.host ?? '',
    connection: upgrade ? 'Upgrade' : 'close',
  })
  const server = createServer((req, res) => {
    operationsMetrics.http(req, res)
    void (async () => {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname
      if (path.startsWith('/internal/metrics')) {
        if (!metricsAuthorized(req)) { res.writeHead(401); res.end(); return }
        if (path === '/internal/metrics') {
          await collect()
          res.writeHead(200, { 'Content-Type': operationsMetrics.registry.contentType })
          res.end(await operationsMetrics.registry.metrics()); return
        }
        if (path === '/internal/metrics/targets') {
          const instances = await directory.instances()
          const targets = instances.map(instance => ({ targets: [req.headers.host ?? 'localhost:5175'], labels: {
            __metrics_path__: `/internal/metrics/app/${instance.instance_id}`, instance: `app-${new URL(instance.internal_url).port}`,
          } }))
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(targets)); return
        }
      }
      const instances = await directory.instances()
      const affinity = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith(`${AFFINITY_COOKIE}=`))?.slice(AFFINITY_COOKIE.length + 1)
      let selected: typeof instances[number] | undefined = instances.find(instance => instance.instance_id === affinity) ?? instances[next++ % instances.length]
      if (path.startsWith('/internal/metrics/app/')) {
        selected = instances.find(instance => instance.instance_id === path.slice('/internal/metrics/app/'.length))
        req.url = '/internal/metrics'
      } else if (path.startsWith('/internal/metrics/')) { res.writeHead(404); res.end(); return }
      const dissolve = /^\/api\/rooms\/([A-Za-z0-9-]+)\/dissolve$/.exec(req.url ?? '')
      if (req.method === 'POST' && dissolve && await directory.db.prepare('SELECT 1 FROM rooms WHERE id=?').get(dissolve[1])) {
        const owner = await directory.claim(dissolve[1]!)
        selected = instances.find(instance => instance.instance_id === owner.owner.instanceId)
      }
      if (!selected) { jsonError(res, 503, 'No application instance is ready'); return }
      const target = new URL(selected.internal_url)
      const proxy = httpRequest({ hostname: target.hostname, port: target.port, method: req.method, path: req.url, headers: forwarded(req) }, upstream => {
        const headers = { ...upstream.headers }
        if (selected.instance_id !== affinity) headers['set-cookie'] = [...(upstream.headers['set-cookie'] ?? []), `${AFFINITY_COOKIE}=${selected.instance_id}; Path=/; HttpOnly; ${secureCookies ? 'SameSite=None; Secure' : 'SameSite=Lax'}`]
        res.writeHead(upstream.statusCode ?? 502, headers)
        upstream.pipe(res)
      })
      proxy.on('error', () => { if (!res.headersSent) jsonError(res, 503, 'Application instance is unavailable'); else res.destroy() })
      req.on('aborted', () => proxy.destroy())
      res.on('close', () => { if (!res.writableEnded) proxy.destroy() })
      req.pipe(proxy)
    })().catch(() => { if (!res.headersSent) jsonError(res, 503, 'Instance directory is unavailable'); else res.destroy() })
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  server.on('upgrade', (req, socket, head) => {
    void (async () => {
      const match = nodePath.exec(req.url ?? '')
      if (!match) { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return }
      const selected = (await directory.instances()).find(instance => instance.instance_id === match[1])
      if (!selected) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return }
      const target = new URL(selected.internal_url)
      const proxy = httpRequest({ hostname: target.hostname, port: target.port, path: `/ws${match[2] ? `?${match[2]}` : ''}`, headers: forwarded(req, true) })
      proxy.on('upgrade', (response, upstream, upstreamHead) => {
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${response.rawHeaders.reduce((lines, value, index, headers) => index % 2 ? lines : `${lines}${value}: ${headers[index + 1]}\r\n`, '')}\r\n`)
        if (head.length) upstream.write(head)
        if (upstreamHead.length) socket.write(upstreamHead)
        upstream.on('error', () => socket.destroy())
        socket.on('error', () => upstream.destroy())
        socket.on('close', () => upstream.destroy())
        upstream.on('close', () => socket.destroy())
        socket.pipe(upstream).pipe(socket)
      })
      proxy.on('response', response => { socket.end(`HTTP/1.1 ${response.statusCode ?? 502} Upgrade Rejected\r\nConnection: close\r\n\r\n`); response.resume() })
      proxy.on('error', () => socket.destroy())
      socket.on('close', () => proxy.destroy())
      proxy.end()
    })().catch(() => socket.destroy())
  })
  return {
    server,
    shutdown: async () => {
      const closed = new Promise<void>(done => server.close(() => done()))
      for (const socket of sockets) socket.end()
      await closed
      await observationDb?.close()
    },
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await initializeDatabase()
  const ingress = createPublicIngress(new RoomDirectory(getDb()), process.env.PUBLIC_API_BASE?.startsWith('https:') === true, undefined, createObservationDatabase())
  const port = Number(process.env.BACKEND_PORT) || 5175
  ingress.server.listen(port, process.env.BACKEND_HOST ?? '127.0.0.1', () => console.log(`[ingress] Public backend listening on ${port}`))
  installShutdownHandlers(async () => { await ingress.shutdown(); await getDb().close() })
}
