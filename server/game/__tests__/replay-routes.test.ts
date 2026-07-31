import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleReplayRoute, ReplayReadLimiter } from '../../replay-routes.ts'
import type { ReplayStore } from '../replay-store.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: vi.fn(actual.readFile) }
})

type CapturedResponse = {
  status: number
  headers: Record<string, string>
  body: Buffer
}

const response = (): { captured: CapturedResponse; res: ServerResponse } => {
  const captured: CapturedResponse = {
    status: 0,
    headers: {},
    body: Buffer.alloc(0),
  }
  return {
    captured,
    res: {
      writeHead(status: number, headers: Record<string, string>) {
        captured.status = status
        captured.headers = headers
        return this
      },
      end(body?: string | Buffer) {
        captured.body = Buffer.isBuffer(body)
          ? body
          : Buffer.from(body ?? '')
        return this
      },
    } as unknown as ServerResponse,
  }
}

const streamingResponse = (): {
  captured: CapturedResponse
  res: ServerResponse
  done: Promise<void>
} => {
  const captured: CapturedResponse = {
    status: 0,
    headers: {},
    body: Buffer.alloc(0),
  }
  const chunks: Buffer[] = []
  const stream = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      callback()
    },
  })
  Object.assign(stream, {
    writeHead(status: number, headers: Record<string, string>) {
      captured.status = status
      captured.headers = headers
      return this
    },
  })
  return {
    captured,
    res: stream as unknown as ServerResponse,
    done: new Promise((resolve) => {
      stream.on('finish', () => {
        captured.body = Buffer.concat(chunks)
        resolve()
      })
    }),
  }
}

const request = (
  url: string,
  headers: Record<string, string> = {},
): IncomingMessage => ({
  method: 'GET',
  url,
  headers: { host: 'localhost', ...headers },
  socket: { remoteAddress: '127.0.0.1' },
} as unknown as IncomingMessage)

describe('public replay routes', () => {
  let root: string
  let viewerRoot: string
  let assetRoot: string
  let buildId: string
  let store: ReplayStore

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'open-agricola-replay-routes-'))
    viewerRoot = join(root, 'viewers')
    assetRoot = join(root, 'assets')
    mkdirSync(viewerRoot)
    mkdirSync(assetRoot)
    const index = Buffer.from('<!doctype html><title>Replay</title>')
    const app = Buffer.from('console.log("replay")')
    const manifest = Buffer.from(JSON.stringify({
      entrypoint: 'index.html',
      files: {
        'index.html': createHash('sha256').update(index).digest('hex'),
        'app.js': createHash('sha256').update(app).digest('hex'),
      },
    }))
    buildId = createHash('sha256').update(manifest).digest('hex')
    const directory = join(viewerRoot, buildId)
    mkdirSync(directory)
    writeFileSync(join(directory, 'index.html'), index)
    writeFileSync(join(directory, 'app.js'), app)
    writeFileSync(join(directory, 'manifest.json'), manifest)
    vi.stubEnv('REPLAY_TRUST_PROXY', 'false')
    store = {
      manifest: vi.fn(() => ({
        ok: true,
        kind: 'replayManifest',
        apiVersion: 1,
        roomId: 'room-1',
        schemaVersion: 1,
        viewerBuildId: buildId,
        gameBuildId: 'game-1',
        firstStepNo: 0,
        lastStepNo: 1,
        missingPrefix: false,
        participants: [],
        segments: [{ checkpointStepNo: 0, firstStepNo: 0, lastStepNo: 1 }],
        steps: [],
        corruptRanges: [],
        customCards: [],
      })),
      segment: vi.fn(() => ({
        ok: true,
        kind: 'replaySegment',
        apiVersion: 1,
        roomId: 'room-1',
        schemaVersion: 1,
        viewerBuildId: buildId,
        checkpointStepNo: 0,
        steps: [],
      })),
      anchor: vi.fn(() => ({
        ok: false,
        code: 'anchor_mismatch',
        lifecycle: 'completed',
        message: 'Replay anchor does not match the archived frame',
      })),
    } as unknown as ReplayStore
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  })

  const handle = (
    req: IncomingMessage,
    limiter = new ReplayReadLimiter(),
  ): CapturedResponse => {
    const { captured, res } = response()
    expect(handleReplayRoute(req, res, store, {
      viewerRoot,
      assetRoot,
      limiter,
    })).toBe(true)
    return captured
  }

  const handleStream = async (
    req: IncomingMessage,
    limiter = new ReplayReadLimiter(),
  ): Promise<CapturedResponse> => {
    const { captured, res, done } = streamingResponse()
    expect(handleReplayRoute(req, res, store, {
      viewerRoot,
      assetRoot,
      limiter,
    })).toBe(true)
    await done
    return captured
  }

  it('serves an ETag-revalidated public manifest without credential headers', () => {
    const first = handle(request('/api/v1/replays/room-1/manifest'))
    expect(first.status).toBe(200)
    expect(first.headers).toMatchObject({
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
      'Content-Type': 'application/json; charset=utf-8',
    })
    expect(first.headers).not.toHaveProperty('Set-Cookie')

    const second = handle(request('/api/v1/replays/room-1/manifest', {
      'if-none-match': first.headers.ETag!,
    }))
    expect(second.status).toBe(304)
    expect(second.body).toHaveLength(0)
  })

  it('serves only hash-verified immutable viewer files', async () => {
    const first = await handleStream(request(`/replay-viewers/${buildId}/index.html`))
    expect(first.status).toBe(200)
    expect(first.headers['Cache-Control']).toContain('immutable')
    expect(first.headers['Content-Security-Policy']).toContain("form-action 'none'")
    expect(first.headers['Content-Security-Policy']).toContain(
      "img-src 'self' data: https://raw.githubusercontent.com https://x.boardgamearena.net",
    )
    expect(first.headers['Content-Security-Policy']).toContain(
      "font-src 'self' https://x.boardgamearena.net",
    )
    expect(first.headers['Content-Security-Policy']).not.toContain(
      "script-src 'self' https:",
    )

    writeFileSync(join(viewerRoot, buildId, 'app.js'), 'tampered')
    expect((await handleStream(request(`/replay-viewers/${buildId}/index.html`))).status).toBe(200)
    expect((await handleStream(request(`/replay-viewers/${buildId}/app.js`))).status).toBe(503)

    writeFileSync(join(viewerRoot, buildId, 'index.html'), 'tampered')
    expect((await handleStream(request(`/replay-viewers/${buildId}/index.html`))).status).toBe(503)
    expect((await handleStream(request(`/replay-viewers/${buildId}/unknown.js`))).status).toBe(404)

    rmSync(join(viewerRoot, buildId, 'index.html'))
    expect((await handleStream(request(`/replay-viewers/${buildId}/index.html`))).status).toBe(503)
  })

  it('revalidates content-addressed replay images and rejects corruption', async () => {
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1])
    const hash = createHash('sha256').update(image).digest('hex')
    writeFileSync(join(assetRoot, hash), image)
    const first = await handleStream(request(`/replay-assets/${hash}`))
    expect(first.status).toBe(200)
    expect(first.headers['Content-Type']).toBe('image/png')
    expect(first.headers['Cache-Control']).toBe('public, max-age=0, must-revalidate')

    rmSync(join(assetRoot, hash))
    expect((await handleStream(request(`/replay-assets/${hash}`, {
      'if-none-match': first.headers.ETag!,
    }))).status).toBe(404)
    writeFileSync(join(assetRoot, hash), 'tampered')
    expect((await handleStream(request(`/replay-assets/${hash}`))).status).toBe(503)
  })

  it('coalesces concurrent cold replay asset verification', async () => {
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 2])
    const hash = createHash('sha256').update(image).digest('hex')
    writeFileSync(join(assetRoot, hash), image)
    const readsBefore = vi.mocked(readFile).mock.calls.length

    const results = await Promise.all([
      handleStream(request(`/replay-assets/${hash}`)),
      handleStream(request(`/replay-assets/${hash}`)),
    ])

    expect(results.map(({ status }) => status)).toEqual([200, 200])
    expect(vi.mocked(readFile).mock.calls.length - readsBefore).toBe(1)
  })

  it('applies an independent per-IP replay read limit', () => {
    const limiter = new ReplayReadLimiter(1, () => 1_000)
    expect(handle(request('/api/v1/replays/room-1/manifest'), limiter).status).toBe(200)
    expect(handle(request('/api/v1/replays/room-1/manifest'), limiter).status).toBe(429)
  })

  it('rate-limits immutable viewer files before opening them', async () => {
    const limiter = new ReplayReadLimiter(1, () => 1_000)
    expect((await handleStream(
      request(`/replay-viewers/${buildId}/index.html`),
      limiter,
    )).status).toBe(200)
    expect((await handleStream(
      request(`/replay-viewers/${buildId}/index.html`),
      limiter,
    )).status).toBe(429)
  })

  it('uses the proxy-appended address and evicts expired rate-limit keys', () => {
    vi.stubEnv('REPLAY_TRUST_PROXY', 'true')
    let now = 0
    const limiter = new ReplayReadLimiter(1, () => now)
    expect(handle(request('/api/v1/replays/room-1/manifest', {
      'x-forwarded-for': 'spoofed-a, 203.0.113.5',
    }), limiter).status).toBe(200)
    expect(handle(request('/api/v1/replays/room-1/manifest', {
      'x-forwarded-for': 'spoofed-b, 203.0.113.5',
    }), limiter).status).toBe(429)

    now = 60_001
    limiter.allow('fresh')
    const reads = (limiter as unknown as {
      reads: Map<string, { count: number; resetAt: number }>
    }).reads
    expect(reads.has('203.0.113.5')).toBe(false)
  })

  it('ignores forwarded addresses unless the proxy is trusted', () => {
    const limiter = new ReplayReadLimiter(1, () => 1_000)
    expect(handle(request('/api/v1/replays/room-1/manifest', {
      'x-forwarded-for': '203.0.113.1',
    }), limiter).status).toBe(200)
    expect(handle(request('/api/v1/replays/room-1/manifest', {
      'x-forwarded-for': '203.0.113.2',
    }), limiter).status).toBe(429)
  })

  it('rejects malformed exact-anchor links before reading evidence', () => {
    const result = handle(request('/api/v1/replays/room-1/anchors/1?frame=bad'))
    expect(result.status).toBe(400)
    expect(JSON.parse(result.body.toString())).toMatchObject({
      ok: false,
      code: 'invalid_context_link',
    })
    expect(store.anchor).not.toHaveBeenCalled()
  })
})
