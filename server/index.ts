import { createServer } from 'node:http'
import type { ServerResponse } from 'node:http'
import { handleGameRoute } from './game-router.ts'
import { createWsServer, getRooms } from './room-manager.ts'

const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  })
  res.end(JSON.stringify(payload))
}

const server = createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/api/health') {
    sendJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'GET' && req.url === '/api/rooms') {
    sendJson(res, 200, { ok: true, rooms: getRooms() })
    return
  }

  if (req.url?.startsWith('/api/game/')) {
    const handled = await handleGameRoute(req, res)
    if (handled) return
  }

  sendJson(res, 404, { error: 'Not found' })
})

createWsServer(server)

const PORT = Number(process.env.BACKEND_PORT) || 5175
const HOST = process.env.BACKEND_HOST || undefined
server.listen(PORT, HOST, () => {
  const addr = HOST ? `http://${HOST}:${PORT}` : `http://localhost:${PORT}`
  console.log(`Server listening on ${addr}`)
  console.log(`WebSocket available at ws://${HOST || 'localhost'}:${PORT}/ws`)
})
