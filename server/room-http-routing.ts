import { request, type IncomingMessage, type ServerResponse } from 'node:http'
import type { RoomDirectory } from './game/room-directory'

/** Call only after application admission; the owner repeats admission and Room authorization. */
export async function forwardRoomRequest(req: IncomingMessage, res: ServerResponse, directory: RoomDirectory,
  instanceId: string, roomId: string): Promise<boolean> {
  const route = await directory.currentRoute(roomId)
  if (!route || route.owner.instanceId === instanceId) return false
  if (req.headers['x-oa-room-forwarded']) throw new Error('Room owner changed during forwarding')
  const owner = (await directory.instances()).find(instance => instance.instance_id === route.owner.instanceId)
  if (!owner) throw new Error('Room owner is unavailable')
  const target = new URL(owner.internal_url)
  await new Promise<void>((resolve, reject) => {
    const proxy = request({ hostname: target.hostname, port: target.port, method: req.method, path: req.url,
      headers: { ...req.headers, 'x-oa-room-forwarded': instanceId, connection: 'close' } }, upstream => {
      upstream.on('error', reject)
      upstream.on('end', resolve)
      res.writeHead(upstream.statusCode ?? 502, upstream.headers)
      upstream.pipe(res)
    })
    proxy.on('error', reject)
    req.on('aborted', () => { proxy.destroy(); resolve() })
    res.on('close', () => { if (!res.writableEnded) { proxy.destroy(); resolve() } })
    req.pipe(proxy)
  })
  return true
}
