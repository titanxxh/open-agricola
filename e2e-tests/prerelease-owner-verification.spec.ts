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

test('distinct temporary HTTPS sites retain only their own inert cookies through the gateway', async ({ browser }) => {
  const root = mkdtempSync(join(tmpdir(), 'pre-cookie-sites-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1,IP:127.0.0.2', '-keyout', join(root, 'key.pem'), '-out', join(root, 'cert.pem')], { stdio: 'ignore' })
  const certificate = { key: readFileSync(join(root, 'key.pem')), cert: readFileSync(join(root, 'cert.pem')) }
  const formal = httpsServer(certificate, (_, res) => {
    res.setHeader('Set-Cookie', 'formal_fixture=inert-formal; Path=/; Secure; HttpOnly; SameSite=Lax')
    res.end('<!doctype html><title>Formal fixture</title>')
  })
  formal.listen(0, '127.0.0.1'); await once(formal, 'listening')
  const formalAddress = formal.address()
  if (!formalAddress || typeof formalAddress === 'string') throw new Error('Expected formal TLS port')
  const formalOrigin = `https://127.0.0.1:${formalAddress.port}`
  const upstream = httpServer((_, res) => {
    res.setHeader('Set-Cookie', ['pre_fixture=inert-pre; Path=/; Secure; SameSite=Lax',
      'domain_fixture=inert; Domain=127.0.0.1; Path=/; Secure', `${OWNER_VERIFICATION_COOKIE}=inert; Path=/; Secure; HttpOnly`])
    res.end('<!doctype html><title>Pre fixture</title>')
  })
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening')
  const upstreamAddress = upstream.address()
  if (!upstreamAddress || typeof upstreamAddress === 'string') throw new Error('Expected upstream port')
  let gatewayPort = 0
  const pre = httpsServer(certificate, (req, res) => {
    const outgoing = request({ hostname: '127.0.0.1', port: gatewayPort, path: req.url, method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode ?? 500, response.headers); response.pipe(res)
    })
    outgoing.on('error', () => res.destroy()); req.pipe(outgoing)
  })
  pre.listen(0, '127.0.0.2'); await once(pre, 'listening')
  const preAddress = pre.address()
  if (!preAddress || typeof preAddress === 'string') throw new Error('Expected pre TLS port')
  const preOrigin = `https://127.0.0.2:${preAddress.port}`, stateFile = join(root, 'gate.json')
  writeFileSync(stateFile, JSON.stringify({ format: 1, channel: 'prerelease', targetId: 'prerelease-test', mode: 'open',
    buildId: 'a'.repeat(40), generation: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5' }))
  const gateway = createPrereleaseGateway({ stateFile, targetId: 'prerelease-test', origin: preOrigin, upstream: `http://127.0.0.1:${upstreamAddress.port}` })
  gateway.server.listen(0, '127.0.0.1'); await once(gateway.server, 'listening')
  const address = gateway.server.address()
  if (!address || typeof address === 'string') throw new Error('Expected gateway port')
  gatewayPort = address.port
  const context = await browser.newContext({ ignoreHTTPSErrors: true })
  try {
    const page = await context.newPage(); await page.goto(formalOrigin)
    const response = await page.goto(preOrigin)
    expect(await response?.headerValue('set-cookie')).toBe('pre_fixture=inert-pre; Path=/; Secure; SameSite=Lax')
    expect(await page.evaluate(() => document.cookie)).toBe('pre_fixture=inert-pre')
    expect((await context.cookies(formalOrigin)).map(cookie => [cookie.name, cookie.value])).toEqual([['formal_fixture', 'inert-formal']])
    expect((await context.cookies(preOrigin)).map(cookie => [cookie.name, cookie.value])).toEqual([['pre_fixture', 'inert-pre']])
  } finally {
    await context.close(); await gateway.close()
    for (const server of [formal, pre, upstream]) server.closeAllConnections()
    await Promise.all([formal, pre, upstream].map(server => new Promise<void>(done => server.close(() => done()))))
    rmSync(root, { recursive: true, force: true })
  }
})
