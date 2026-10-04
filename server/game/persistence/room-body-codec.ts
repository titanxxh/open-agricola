import { gunzipSync, gzipSync } from 'node:zlib'

const encoding = 'gzip-base64-v1'

/** Encode an already serialized small Room body; histories remain separate records. */
export const encodeRoomBody = (
  json: string,
  queryFields?: { state: object; sessionCursor: object },
): string => {
  const compressed = gzipSync(json, { level: 1 }).toString('base64')
  const envelope = JSON.stringify({ roomBodyEncoding: encoding, data: compressed, ...queryFields })
  return Buffer.byteLength(envelope) < Buffer.byteLength(json) ? envelope : json
}

/** Raw JSON bodies remain readable alongside the internal compression envelope. */
export const parseRoomBody = (json: string): unknown => {
  const body = JSON.parse(json) as unknown
  if (!body || typeof body !== 'object' || !Object.hasOwn(body, 'roomBodyEncoding')) return body
  const envelope = body as { roomBodyEncoding: unknown; data?: unknown }
  if (envelope.roomBodyEncoding !== encoding || typeof envelope.data !== 'string') {
    throw new Error('Invalid Room body encoding')
  }
  return JSON.parse(gunzipSync(Buffer.from(envelope.data, 'base64')).toString('utf8')) as unknown
}
