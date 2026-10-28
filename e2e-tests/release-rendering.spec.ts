import { createServer } from 'node:http'
import { expect, test } from '@playwright/test'
import { verifyVisibleReleaseAssets } from '../scripts/release/render'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

async function controlServer() {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (path.endsWith('.png') && !path.includes('missing')) {
      response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); response.end(png)
    } else if (path === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<html><body></body></html>')
    } else { response.writeHead(404); response.end('missing') }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Rendering control requires a TCP address')
  return { origin: `http://127.0.0.1:${address.port}`, close: async () => {
    const closed = new Promise<void>(resolve => server.close(() => resolve()))
    server.closeAllConnections()
    await closed
  } }
}

test('release rendering decodes visible PNG backgrounds, masks and images without exposing query strings', async ({ page }) => {
  const server = await controlServer()
  try {
    await page.goto(server.origin)
    await page.setContent(`<style>
      .asset { width:32px;height:32px }
      .background { background-image:url('${server.origin}/background.png?secret=query#secret-hash') }
      .mask { mask-image:url('${server.origin}/mask.png') }
      .pseudo::before { content:'';display:block;width:32px;height:32px;background-image:url('${server.origin}/pseudo.png') }
      .hidden { display:none;background-image:url('${server.origin}/missing-hidden.png') }
      .transparent { opacity:0 }
      .offscreen { position:absolute;top:100000px;background-image:url('${server.origin}/missing-offscreen.png') }
    </style><div class="asset background"></div><div class="asset mask"></div><div class="asset pseudo"></div>
    <img width="32" height="32" src="${server.origin}/image.png">
    <img width="32" height="32" src="data:image/png;base64,${png.toString('base64')}">
    <div class="asset hidden"></div><div class="transparent"><img width="32" height="32" src="${server.origin}/missing-transparent.png"></div><div class="asset offscreen"></div>`)
    const assets = await verifyVisibleReleaseAssets(page)
    expect(assets.sort((left, right) => left.path.localeCompare(right.path))).toEqual([
      { origin: server.origin, path: '/background.png', width: 1, height: 1 },
      { origin: server.origin, path: '/image.png', width: 1, height: 1 },
      { origin: server.origin, path: '/mask.png', width: 1, height: 1 },
      { origin: server.origin, path: '/pseudo.png', width: 1, height: 1 },
    ])
    expect(JSON.stringify(assets)).not.toContain('secret')
  } finally { await page.close(); await server.close() }
})

test('release rendering rejects a visible image returning 404', async ({ page }) => {
  const server = await controlServer()
  try {
    await page.goto(server.origin)
    await page.setContent(`<img width="32" height="32" src="${server.origin}/missing.png?secret=query#secret-hash">`)
    await expect(verifyVisibleReleaseAssets(page)).rejects.toThrow(`Visible release asset failed to decode: ${server.origin}/missing.png`)
  } finally { await page.close(); await server.close() }
})
