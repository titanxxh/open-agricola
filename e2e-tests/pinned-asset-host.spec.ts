// @covers e2e-tests/helpers/pinned-asset-host.ts
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { publicAssetBaseUrl } from '../scripts/public-assets'
import { PINNED_ASSET_HEADER } from './helpers/pinned-asset-host'

// Compiled pages keep their asset-site URLs; this proves Chromium answers them from the pinned checkout, so a stalled
// or rate-limited remote request cannot hold a page's load event.
test('Chromium loads asset-site images and cross-origin fonts from the pinned checkout', async ({ page, browserName }) => {
  test.skip(!process.env.E2E_PUBLIC_ASSET_DIR || browserName !== 'chromium', 'Chromium maps the asset site only with E2E_PUBLIC_ASSET_DIR')
  const version = readFileSync('public-assets.ref', 'utf8').trim()
  const image = await page.goto(new URL('assets/revised/background.jpg', publicAssetBaseUrl()).href)
  expect(image?.status()).toBe(200)
  expect(image?.headers()[PINNED_ASSET_HEADER]).toBe(version)

  // A loopback page on another origin, as every compiled frontend under test is. An opaque about:blank document cannot
  // load fonts, and Chrome's Private Network Access stops a public origin from loading the loopback host.
  const compiled = createServer((_, response) => { response.writeHead(200, { 'content-type': 'text/html' }).end('<p>compiled page</p>') })
  await new Promise<void>(done => compiled.listen(0, '127.0.0.1', done))
  try {
    await page.goto(`http://127.0.0.1:${(compiled.address() as AddressInfo).port}/`)
    const font = new URL('assets/revised/fonts/Dominican.woff2', publicAssetBaseUrl()).href
    const [response, status] = await Promise.all([
      page.waitForResponse(font),
      page.evaluate(async url => { const face = new FontFace('Pinned', `url(${url})`); await face.load(); return face.status }, font),
    ])
    expect(status).toBe('loaded')
    expect(response.headers()[PINNED_ASSET_HEADER]).toBe(version)
    expect(response.headers()['access-control-allow-origin']).toBe('*')
  } finally { await new Promise(done => compiled.close(done)) }
})
