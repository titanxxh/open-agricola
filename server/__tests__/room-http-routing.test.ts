import { createServer, request } from 'node:http'
import { once } from 'node:events'
import type { Socket } from 'node:net'
import { expect, it, vi } from 'vitest'
import type { RoomDirectory } from '../game/room-directory'
import { forwardRoomRequest } from '../room-http-routing'

async function fixture(waitAt: 'route' | 'instances', completeRequest = false) {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>()
  const requestClosed = Promise.withResolvers<{ aborted: boolean; destroyed: boolean }>()
  const responseClosed = Promise.withResolvers<void>()
  const sockets = new Set<Socket>()
  let ownerConnections = 0, ownerRequests = 0, settled = false, handled: boolean | undefined, failure: unknown
  let forwarding: Promise<void> | undefined
  const owner = createServer((req, res) => { ownerRequests++; req.resume(); req.on('end', () => res.end('owner-response')) })
  owner.on('connection', socket => { ownerConnections++; sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  owner.listen(0, '127.0.0.1'); await once(owner, 'listening')
  const ownerAddress = owner.address()
  if (!ownerAddress || typeof ownerAddress === 'string') throw new Error('Owner fixture did not listen')
  const wait = async (stage: typeof waitAt) => { if (stage === waitAt) { entered.resolve(); await release.promise } }
  const directory: Pick<RoomDirectory, 'currentRoute' | 'instances'> = {
    currentRoute: async () => { await wait('route'); return { roomId: 'room', owner: { instanceId: 'owner', epoch: 1 }, wsPath: '/nodes/owner/ws' } },
    instances: async () => {
      await wait('instances')
      return [{ instance_id: 'owner', internal_url: `http://127.0.0.1:${ownerAddress.port}`, generation: 'test',
        status: 'ready', room_capacity: 1, lease_until: Date.now() + 30_000 }]
    },
  }
  const source = createServer((req, res) => {
    req.on('close', () => requestClosed.resolve({ aborted: req.aborted, destroyed: req.destroyed }))
    res.on('close', () => responseClosed.resolve())
    req.resume()
    forwarding = forwardRoomRequest(req, res, directory, 'source', 'room').then(
      result => { handled = result; settled = true }, error => { failure = error; settled = true },
    )
  })
  source.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  source.listen(0, '127.0.0.1'); await once(source, 'listening')
  const sourceAddress = source.address()
  if (!sourceAddress || typeof sourceAddress === 'string') throw new Error('Source fixture did not listen')
  const received = Promise.withResolvers<{ status: number; body: string }>()
  const client = request(`http://127.0.0.1:${sourceAddress.port}/api/rooms/room/dissolve`, {
    method: 'POST', headers: { 'Content-Length': completeRequest ? '0' : '3' }, agent: false,
  }, response => {
    let body = ''
    response.on('data', chunk => { body += chunk.toString() })
    response.on('end', () => received.resolve({ status: response.statusCode ?? 0, body }))
  })
  client.on('error', () => {})
  if (completeRequest) client.end()
  else client.write('a')
  await entered.promise
  return { client, requestClosed: requestClosed.promise, responseClosed: responseClosed.promise, response: received.promise,
    release: () => release.resolve(), state: () => ({ ownerConnections, ownerRequests, settled, handled, failure }),
    close: async () => {
      client.destroy(); release.resolve()
      for (const socket of sockets) socket.destroy()
      await Promise.all([new Promise<void>(done => owner.close(() => done())), new Promise<void>(done => source.close(() => done()))])
      await forwarding
    },
  }
}

it.each(['route', 'instances'] satisfies Array<'route' | 'instances'>)('does not connect to the owner when the caller aborts during %s lookup', async stage => {
  const running = await fixture(stage)
  try {
    running.client.destroy()
    expect(await running.requestClosed).toEqual({ aborted: true, destroyed: true })
    await running.responseClosed
    running.release()
    await vi.waitFor(() => expect(running.state()).toEqual({ ownerConnections: 0, ownerRequests: 0, settled: true, handled: true, failure: undefined }))
  } finally { await running.close() }
})

it('does not connect after a complete caller request loses its response during lookup', async () => {
  const running = await fixture('instances', true)
  try {
    expect(await running.requestClosed).toEqual({ aborted: false, destroyed: true })
    running.client.destroy(); await running.responseClosed
    running.release()
    await vi.waitFor(() => expect(running.state()).toEqual({ ownerConnections: 0, ownerRequests: 0, settled: true, handled: true, failure: undefined }))
  } finally { await running.close() }
})

it('forwards a completed POST whose request stream closed normally while the response remains open', async () => {
  const running = await fixture('route', true)
  try {
    expect(await running.requestClosed).toEqual({ aborted: false, destroyed: true })
    running.release()
    expect(await running.response).toEqual({ status: 200, body: 'owner-response' })
    await vi.waitFor(() => expect(running.state()).toEqual({ ownerConnections: 1, ownerRequests: 1, settled: true, handled: true, failure: undefined }))
  } finally { await running.close() }
})
