import { createServer } from 'node:https'
import { once } from 'node:events'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { parsePrereleaseTarget } from '../prerelease/config'
import { requestAuthorityLifecycle } from '../prerelease/authority'

beforeEach(() => { vi.stubEnv('CI', ''); vi.stubEnv('GITHUB_ACTIONS', '') })
afterEach(() => vi.unstubAllEnvs())

it('sends the owner cookie only to exact formal HTTPS/Origin, validates receipt binding, and refuses redirects', async () => {
  const root = mkdtempSync(join(tmpdir(), 'pre-owner-authority-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(root, 'key'), '-out', join(root, 'cert')], { stdio: 'ignore' })
  const cert = readFileSync(join(root, 'cert')), cookieFile = join(root, 'formal-cookie')
  writeFileSync(cookieFile, '__Host-oa-session=dummy-owner-cookie', { mode: 0o600 })
  let behavior = 'valid', requests = 0
  const seen: unknown[] = []
  const server = createServer({ key: readFileSync(join(root, 'key')), cert }, (req, res) => {
    requests++; let body = ''
    req.on('data', bytes => { body += bytes.toString() })
    req.on('end', () => {
      seen.push({ path: req.url, cookie: req.headers.cookie, origin: req.headers.origin, protocol: req.headers['x-oa-browser-protocol'], body: JSON.parse(body) })
      if (behavior === 'redirect') { res.writeHead(302, { Location: '/wrong-target' }); res.end(); return }
      const input = JSON.parse(body)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, receipt: { ...input, targetId: behavior === 'wrong' ? 'prerelease-other' : 'prerelease-main', completedAt: Date.now() } }))
    })
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected fixture port')
  const template = JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8'))
  const target = parsePrereleaseTarget({ ...template, directory: join(root, 'open-agricola-prerelease-main'), policyDirectory: process.cwd(),
    formal: { ...template.formal, apiOrigin: `https://127.0.0.1:${address.port}` } })
  const body = { action: 'close', generationId: 'bb4d6c82-676f-4dcc-a570-52377b3b32f5', operationId: 'cb4d6c82-676f-4dcc-a570-52377b3b32f5' }
  try {
    expect(await requestAuthorityLifecycle(target, cookieFile, body, cert)).toMatchObject({ ok: true, receipt: { action: 'close', targetOrigin: target.origin } })
    expect(seen[0]).toEqual({ path: '/api/admin/prerelease-identity/lifecycle', cookie: '__Host-oa-session=dummy-owner-cookie', origin: target.formal.appOrigin, protocol: '2',
      body: { ...body, protocolVersion: 1, channel: 'prerelease', targetOrigin: target.origin } })
    behavior = 'wrong'; await expect(requestAuthorityLifecycle(target, cookieFile, body, cert)).rejects.toThrow('binding mismatch')
    behavior = 'redirect'; await expect(requestAuthorityLifecycle(target, cookieFile, body, cert)).rejects.toThrow('(302)')
    expect(requests).toBe(3)
    await expect(requestAuthorityLifecycle(target, join(target.directory, 'formal-cookie'), body, cert)).rejects.toThrow('outside the prerelease')
    expect(requests).toBe(3)
  } finally {
    server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()))
    rmSync(root, { recursive: true, force: true })
  }
})


it.each(['CI', 'GITHUB_ACTIONS'])('refuses authority execution in %s before reading credentials or contacting formal HTTPS', async flag => {
  const root = mkdtempSync(join(tmpdir(), 'pre-owner-ci-'))
  const template = JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8'))
  const target = parsePrereleaseTarget({ ...template, directory: join(root, 'open-agricola-prerelease-main'), policyDirectory: process.cwd() })
  vi.stubEnv(flag, 'true')
  try {
    await expect(requestAuthorityLifecycle(target, join(root, 'missing-cookie'), { action: 'close' })).rejects.toThrow('owner-controlled machine, outside CI')
    expect(readdirSync(root)).toEqual([])
  } finally { rmSync(root, { recursive: true, force: true }) }
})
