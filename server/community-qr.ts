import { open } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { corsHeaders } from './http-origin'

export function createCommunityQrHandler(directory = process.env.COMMUNITY_DATA_DIR ?? 'data/community') {
  const imagePath = resolve(directory, 'wechat-qr')
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/api/community/wechat-qr') return false
    const headers = { ...corsHeaders({ methods: 'GET,HEAD,OPTIONS', headers: 'Content-Type' }),
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end()
      return true
    }
    try {
      const file = await open(imagePath, 'r')
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('Invalid community image')
        const image = await file.readFile()
        const type = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
          : image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff ? 'image/jpeg' : undefined
        if (!type) throw new Error('Invalid community image type')
        res.writeHead(200, { ...headers, 'Content-Type': type, 'Content-Length': image.length })
        res.end(req.method === 'HEAD' ? undefined : image)
      } finally { await file.close() }
    } catch (error) {
      const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT'
      res.writeHead(missing ? 404 : 503, headers).end()
    }
    return true
  }
}
