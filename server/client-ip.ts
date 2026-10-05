import type { IncomingMessage } from 'node:http'
import { isIP } from 'node:net'

/** Trust only the nearest proxy's appended address, never an arbitrary prefix. */
export function clientIp(req: IncomingMessage, trustProxy = process.env.REPLAY_TRUST_PROXY === 'true' || process.env.REPLAY_TRUST_PROXY === '1'): string {
  if (trustProxy && typeof req.headers['x-forwarded-for'] === 'string') {
    const address = req.headers['x-forwarded-for'].split(',').at(-1)?.trim()
    if (address && isIP(address)) return address
  }
  return req.socket.remoteAddress ?? 'unknown'
}
