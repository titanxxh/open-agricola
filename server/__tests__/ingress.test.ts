import { createServer } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import { WebSocket, WebSocketServer } from 'ws'
import { expect, it } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { RoomDirectory } from '../game/room-directory'
import { createPublicIngress } from '../ingress'

it.each([false, true])('normalizes the nearest client address for HTTP and WS with trusted proxy=%s', async trustProxy => {
  const db = await createTestDatabase()
  const directory = new RoomDirectory(db)
  const ingress = createPublicIngress(directory, false, trustProxy)
  const app = createServer((req, res) => res.end(String(req.headers['x-forwarded-for'])))
  const wss = new WebSocketServer({ server: app, path: '/ws' })
  wss.on('connection', (socket, req) => socket.send(String(req.headers['x-forwarded-for'])))
  let socket: WebSocket | undefined
  try {
    app.listen(0, '127.0.0.1'); await once(app, 'listening')
    await directory.register('proxy-check', `http://127.0.0.1:${(app.address() as AddressInfo).port}`, 'test')
    await directory.activate('proxy-check')
    ingress.server.listen(0, '127.0.0.1'); await once(ingress.server, 'listening')
    const origin = `http://127.0.0.1:${(ingress.server.address() as AddressInfo).port}`
    const headers = { 'x-forwarded-for': '198.51.100.99, 203.0.113.8' }
    const expected = trustProxy ? '203.0.113.8' : '127.0.0.1'
    expect(await (await fetch(origin, { headers })).text()).toBe(expected)
    socket = new WebSocket(`${origin.replace('http:', 'ws:')}/nodes/proxy-check/ws`, { headers })
    expect((await once(socket, 'message'))[0].toString()).toBe(expected)
    socket.close(); await once(socket, 'close')
    expect(await (await fetch(origin, { headers: { 'x-forwarded-for': 'invalid' } })).text()).toBe('127.0.0.1')
  } finally {
    socket?.terminate()
    await ingress.shutdown()
    await new Promise<void>(done => wss.close(() => done()))
    await new Promise<void>(done => app.close(() => done()))
    await db.close()
  }
})

it('routes real HTTP with sandbox affinity and real WS by node while forwarding existing authentication cookies', async () => {
  const db = await createTestDatabase()
  const directory = new RoomDirectory(db)
  const apps = []
  const clients: WebSocket[] = []
  const ingress = createPublicIngress(directory, false)
  try {
    for (const id of ['one', 'two']) {
      const app = createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ node: id, path: req.url, cookie: req.headers.cookie })) })
      const wss = new WebSocketServer({ server: app, path: '/ws' })
      wss.on('connection', (socket, req) => socket.send(JSON.stringify({ node: id, cookie: req.headers.cookie, origin: req.headers.origin })))
      apps.push({ app, wss })
      app.listen(0, '127.0.0.1'); await once(app, 'listening')
      await directory.register(id, `http://127.0.0.1:${(app.address() as AddressInfo).port}`, 'test')
      await directory.activate(id)
    }
    ingress.server.listen(0, '127.0.0.1'); await once(ingress.server, 'listening')
    const origin = `http://127.0.0.1:${(ingress.server.address() as AddressInfo).port}`
    const first = await fetch(`${origin}/api/game/new-sandbox`, { method: 'POST', headers: { cookie: 'session=original' } })
    const cookie = first.headers.getSetCookie()[0]!.split(';')[0]!
    const firstBody = await first.json()
    const second = await fetch(`${origin}/api/game/state`, { headers: { cookie: `session=original; ${cookie}` } })
    expect(await second.json()).toMatchObject({ node: firstBody.node, path: '/api/game/state', cookie: `session=original; ${cookie}` })
    for (const id of ['one', 'two']) {
      const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/nodes/${id}/ws`, { headers: { cookie: 'session=original', origin } })
      clients.push(socket)
      const [message] = await once(socket, 'message')
      expect(JSON.parse(message.toString())).toEqual({ node: id, cookie: 'session=original', origin })
      socket.close(); await once(socket, 'close')
    }
  } finally {
    for (const socket of clients) socket.close()
    await ingress.shutdown()
    for (const { app, wss } of apps) { await new Promise<void>(resolve => wss.close(() => resolve())); await new Promise<void>(resolve => app.close(() => resolve())) }
    await db.close()
  }
})
