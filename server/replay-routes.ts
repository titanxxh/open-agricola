import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, join } from 'node:path'
import type { GameContextErrorCode } from '../shared/contract/protocol/game-context.ts'
import type {
  ReplayAnchorResponse,
  ReplayManifestResponse,
  ReplaySegmentResponse,
} from '../shared/contract/protocol/replay.ts'
import { loadReplayViewerBuild } from './game/replay-viewer-build.ts'
import { ReplayStore } from './game/replay-store.ts'

const MANIFEST_ROUTE = /^\/api\/v1\/replays\/([^/]+)\/manifest$/
const SEGMENT_ROUTE = /^\/api\/v1\/replays\/([^/]+)\/segments\/(\d+)$/
const ANCHOR_ROUTE = /^\/api\/v1\/replays\/([^/]+)\/anchors\/(\d+)$/
const VIEWER_ROUTE = /^\/replay-viewers\/([a-f0-9]{64})\/(.+)$/
const ASSET_ROUTE = /^\/replay-assets\/([a-f0-9]{64})$/
const CONTEXT_ID = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024
const READ_LIMIT_PER_MINUTE = 240

type ReplayResponse = ReplayManifestResponse | ReplaySegmentResponse | ReplayAnchorResponse

const statusForCode = (code: GameContextErrorCode): number => {
  switch (code) {
    case 'invalid_context_link':
      return 400
    case 'login_required':
      return 401
    case 'not_participant':
      return 403
    case 'unknown_context':
      return 404
    case 'anchor_mismatch':
    case 'context_changed':
      return 409
    case 'context_expired':
    case 'context_removed':
      return 410
    case 'rate_limited':
      return 429
    case 'replay_segment_unavailable':
    case 'viewer_unavailable':
      return 503
  }
}

const publicHeaders = (contentType: string, cacheControl: string): Record<string, string> => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Expose-Headers': 'ETag',
  'Cache-Control': cacheControl,
  'Content-Type': contentType,
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Content-Type-Options': 'nosniff',
})

const sendJson = (
  req: IncomingMessage,
  res: ServerResponse,
  response: ReplayResponse,
): void => {
  let status = response.ok ? 200 : statusForCode(response.code)
  let body = JSON.stringify(response)
  if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
    status = 503
    body = JSON.stringify({
      ok: false,
      code: 'replay_segment_unavailable',
      lifecycle: 'completed',
      message: 'Replay response exceeds the public size limit',
    })
  }
  const headers = publicHeaders('application/json; charset=utf-8', 'no-cache')
  if (status === 200) {
    const etag = `"${createHash('sha256').update(body).digest('hex')}"`
    headers.ETag = etag
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers)
      res.end()
      return
    }
  }
  res.writeHead(status, headers)
  res.end(body)
}

const sendInvalidLink = (req: IncomingMessage, res: ServerResponse): void =>
  sendJson(req, res, {
    ok: false,
    code: 'invalid_context_link',
    message: 'Invalid replay link',
  })

const decodeRoomId = (raw: string): string | null => {
  try {
    const roomId = decodeURIComponent(raw)
    return roomId.length <= 128 && CONTEXT_ID.test(roomId) ? roomId : null
  } catch {
    return null
  }
}

const parseStepNo = (raw: string): number | null => {
  const value = Number(raw)
  return Number.isSafeInteger(value) && value >= 0 ? value : null
}

const clientIp = (req: IncomingMessage): string => {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') {
    return forwarded.split(',').at(-1)?.trim() || req.socket.remoteAddress || 'unknown'
  }
  return req.socket.remoteAddress ?? 'unknown'
}

export class ReplayReadLimiter {
  private readonly reads = new Map<string, { count: number; resetAt: number }>()
  private readonly max: number
  private readonly now: () => number
  private nextCleanupAt = 0

  constructor(
    max = READ_LIMIT_PER_MINUTE,
    now: () => number = Date.now,
  ) {
    this.max = max
    this.now = now
  }

  allow(ip: string): boolean {
    if (process.env.DISABLE_RATE_LIMIT === '1') return true
    const now = this.now()
    if (now >= this.nextCleanupAt) {
      for (const [key, entry] of this.reads) {
        if (entry.resetAt <= now) this.reads.delete(key)
      }
      this.nextCleanupAt = now + 60_000
    }
    const current = this.reads.get(ip)
    if (!current || current.resetAt <= now) {
      this.reads.set(ip, { count: 1, resetAt: now + 60_000 })
      return true
    }
    current.count += 1
    return current.count <= this.max
  }
}

const mimeType = (path: string): string => {
  switch (extname(path).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

const safeViewerPath = (raw: string): string | null => {
  try {
    const path = decodeURIComponent(raw)
    const parts = path.split('/')
    if (
      !path
      || path.startsWith('/')
      || path.includes('\\')
      || parts.some((part) => !part || part === '.' || part === '..')
    ) return null
    return path
  } catch {
    return null
  }
}

const serveViewerFile = (
  res: ServerResponse,
  root: string,
  buildId: string,
  rawPath: string,
): void => {
  const build = loadReplayViewerBuild(root, buildId)
  const path = safeViewerPath(rawPath)
  if (
    !build
    || !path
    || (path !== 'manifest.json' && !(path in build.files))
  ) {
    res.writeHead(404, publicHeaders('application/json; charset=utf-8', 'no-cache'))
    res.end(JSON.stringify({ ok: false, code: 'viewer_unavailable', message: 'Replay viewer not found' }))
    return
  }
  const filePath = join(build.directory, path)
  if (!existsSync(filePath)) {
    res.writeHead(404, publicHeaders('application/json; charset=utf-8', 'no-cache'))
    res.end(JSON.stringify({ ok: false, code: 'viewer_unavailable', message: 'Replay viewer not found' }))
    return
  }
  const body = readFileSync(filePath)
  const hash = createHash('sha256').update(body).digest('hex')
  if (hash !== (path === 'manifest.json' ? buildId : build.files[path])) {
    res.writeHead(503, publicHeaders('application/json; charset=utf-8', 'no-cache'))
    res.end(JSON.stringify({ ok: false, code: 'viewer_unavailable', message: 'Replay viewer failed its integrity check' }))
    return
  }
  const headers = publicHeaders(mimeType(path), 'public, max-age=31536000, immutable')
  headers.ETag = `"${hash}"`
  if (path === 'index.html') {
    headers['Content-Security-Policy'] = [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors *",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ')
  }
  res.writeHead(200, headers)
  res.end(body)
}

const assetMimeType = (body: Buffer): string => {
  if (body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png'
  }
  if (body[0] === 0xff && body[1] === 0xd8) return 'image/jpeg'
  if (body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp'
  }
  return 'application/octet-stream'
}

const serveReplayAsset = (
  res: ServerResponse,
  root: string,
  hash: string,
): void => {
  const path = join(root, hash)
  if (!existsSync(path)) {
    res.writeHead(404, publicHeaders('application/json; charset=utf-8', 'no-cache'))
    res.end(JSON.stringify({ ok: false, code: 'replay_segment_unavailable', message: 'Replay asset not found' }))
    return
  }
  const body = readFileSync(path)
  if (createHash('sha256').update(body).digest('hex') !== hash) {
    res.writeHead(503, publicHeaders('application/json; charset=utf-8', 'no-cache'))
    res.end(JSON.stringify({ ok: false, code: 'replay_segment_unavailable', message: 'Replay asset failed its integrity check' }))
    return
  }
  res.writeHead(200, {
    ...publicHeaders(assetMimeType(body), 'public, max-age=31536000, immutable'),
    ETag: `"${hash}"`,
  })
  res.end(body)
}

export function handleReplayRoute(
  req: IncomingMessage,
  res: ServerResponse,
  store: ReplayStore,
  options: {
    viewerRoot: string
    assetRoot: string
    limiter: ReplayReadLimiter
  },
): boolean {
  if (req.method !== 'GET' || !req.url) return false
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const viewerMatch = VIEWER_ROUTE.exec(url.pathname)
  if (viewerMatch) {
    serveViewerFile(res, options.viewerRoot, viewerMatch[1]!, viewerMatch[2]!)
    return true
  }
  const assetMatch = ASSET_ROUTE.exec(url.pathname)
  if (assetMatch) {
    serveReplayAsset(res, options.assetRoot, assetMatch[1]!)
    return true
  }

  const manifestMatch = MANIFEST_ROUTE.exec(url.pathname)
  const segmentMatch = SEGMENT_ROUTE.exec(url.pathname)
  const anchorMatch = ANCHOR_ROUTE.exec(url.pathname)
  if (!manifestMatch && !segmentMatch && !anchorMatch) return false
  if (!options.limiter.allow(clientIp(req))) {
    sendJson(req, res, {
      ok: false,
      code: 'rate_limited',
      message: 'Too many replay requests',
    })
    return true
  }
  const match = manifestMatch ?? segmentMatch ?? anchorMatch
  const roomId = decodeRoomId(match![1]!)
  if (!roomId) {
    sendInvalidLink(req, res)
    return true
  }
  if (manifestMatch) {
    const response = store.manifest(roomId)
    if (
      response.ok
      && !loadReplayViewerBuild(options.viewerRoot, response.viewerBuildId)
    ) {
      sendJson(req, res, {
        ok: false,
        code: 'viewer_unavailable',
        lifecycle: 'completed',
        message: 'Replay viewer is unavailable',
      })
      return true
    }
    sendJson(req, res, response)
    return true
  }
  if (segmentMatch) {
    const checkpointStepNo = parseStepNo(segmentMatch[2]!)
    if (checkpointStepNo === null) {
      sendInvalidLink(req, res)
      return true
    }
    sendJson(req, res, store.segment(roomId, checkpointStepNo))
    return true
  }
  const stepNo = parseStepNo(anchorMatch![2]!)
  const frameHash = url.searchParams.get('frame') ?? ''
  if (stepNo === null || !/^[a-f0-9]{64}$/.test(frameHash)) {
    sendInvalidLink(req, res)
    return true
  }
  sendJson(req, res, store.anchor(roomId, stepNo, frameHash))
  return true
}
