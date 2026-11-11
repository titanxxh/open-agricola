// @covers scripts/prerelease/
import { test, expect } from '@playwright/test'
import { createServer as httpServer, request } from 'node:http'
import { createServer as httpsServer } from 'node:https'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { createPrereleaseGateway, OWNER_VERIFICATION_COOKIE } from '../scripts/prerelease/gateway'
import { configureOwnerVerification } from '../scripts/prerelease/owner-browser'

test('private owner verification uses a Secure HttpOnly cookie, strips it before candidate, and keeps public maintenance', async ({ browser }) => {
  const root = mkdtempSync(join(tmpdir(), 'pre-owner-browser-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem')], { stdio: 'ignore' })
  const seen: string[] = []
  const upstream = httpServer((req, res) => { seen.push(req.headers.cookie ?? ''); res.end('<!doctype html><title>Private pre candidate</title><main>Candidate content</main>') })
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
  const upstreamAddress = upstream.address()
  if (!upstreamAddress || typeof upstreamAddress === 'string') throw new Error('Expected upstream port')
  let gatewayPort = 0
  const tls = httpsServer({ key: readFileSync(join(root, 'key.pem')), cert: readFileSync(join(root, 'cert.pem')) }, (req, res) => {
    const outgoing = request({ hostname: '127.0.0.1', port: gatewayPort, path: req.url, method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode ?? 500, response.headers); response.pipe(res)
    })
    outgoing.on('error', () => res.destroy()); req.pipe(outgoing)
  })
  tls.listen(0, '127.0.0.1'); await once(tls, 'listening')
  const tlsAddress = tls.address()
  if (!tlsAddress || typeof tlsAddress === 'string') throw new Error('Expected TLS port')
  const origin = `https://127.0.0.1:${tlsAddress.port}`, token = 'V'.repeat(43), generation = 'bb4d6c82-676f-4dcc-a570-52377b3b32f5'
  const stateFile = join(root, 'gate.json'), tokenFile = join(root, 'token')
  writeFileSync(tokenFile, token, { mode: 0o600 })
  writeFileSync(stateFile, JSON.stringify({ format: 1, channel: 'prerelease', targetId: 'prerelease-test', buildId: 'a'.repeat(40), generation, mode: 'maintenance' }))
  writeFileSync(join(root, 'verification.json'), JSON.stringify({ targetId: 'prerelease-test', buildId: 'a'.repeat(40), generation,
    tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: Date.now() + 600_000 }))
  const gateway = createPrereleaseGateway({ stateFile, targetId: 'prerelease-test', origin, upstream: `http://127.0.0.1:${upstreamAddress.port}` })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  const gatewayAddress = gateway.server.address()
  if (!gatewayAddress || typeof gatewayAddress === 'string') throw new Error('Expected gateway port')
  gatewayPort = gatewayAddress.port
  const owner = await browser.newContext({ ignoreHTTPSErrors: true }), ordinary = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    expect((await ordinary.request.get(origin)).status()).toBe(503)
    await configureOwnerVerification(owner, origin, tokenFile)
    const cookie = (await owner.cookies(origin)).find(cookie => cookie.name === OWNER_VERIFICATION_COOKIE)
    expect(cookie).toMatchObject({ secure: true, httpOnly: true, sameSite: 'Lax', path: '/' })
    const page = await owner.newPage(); await page.goto(origin)
    await expect(page.getByText('Candidate content')).toBeVisible()
    expect(await page.evaluate(() => document.cookie)).toBe('')
    expect(seen).toEqual([''])
    expect((await ordinary.request.get(origin)).status()).toBe(503)
    writeFileSync(join(root, 'verification.json'), '{}')
    expect((await owner.request.get(origin)).status()).toBe(503)
  } finally {
    await owner.close(); await ordinary.close(); await gateway.close()
    tls.closeAllConnections(); upstream.closeAllConnections()
    await Promise.all([new Promise<void>(done => tls.close(() => done())), new Promise<void>(done => upstream.close(() => done()))])
    rmSync(root, { recursive: true, force: true })
  }
})
