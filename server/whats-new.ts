import { open } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { corsHeaders } from './http-origin'
import { parseWhatsNew, WHATS_NEW_FILENAME, WHATS_NEW_MAX_BYTES, WHATS_NEW_RELEASE_LIMIT } from '../shared/contract/whats-new'

/** Serves the newest host-maintained release notes; edits apply on the next request. */
export function createWhatsNewHandler(directory = process.env.COMMUNITY_DATA_DIR ?? 'data/community') {
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/api/whats-new') return false
    const headers = { ...corsHeaders({ methods: 'GET,HEAD,OPTIONS', headers: 'Content-Type' }),
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end()
      return true
    }
    try {
      const file = await open(resolve(directory, WHATS_NEW_FILENAME), 'r')
      let text: string
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.size > WHATS_NEW_MAX_BYTES) throw new Error('Invalid release notes file')
        text = await file.readFile('utf8')
      } finally { await file.close() }
      const { releases } = parseWhatsNew(JSON.parse(text))
      const body = Buffer.from(JSON.stringify({ releases: releases.slice(0, WHATS_NEW_RELEASE_LIMIT) }))
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length })
      res.end(req.method === 'HEAD' ? undefined : body)
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      res.writeHead(missing ? 404 : 503, headers).end()
    }
    return true
  }
}
