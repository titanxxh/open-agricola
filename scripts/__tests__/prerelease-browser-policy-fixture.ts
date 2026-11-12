import { createServer } from 'node:https'
import { once } from 'node:events'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function formalBrowserPolicyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-formal-policy-'))
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=127.0.0.1',
    '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', join(root, 'key'), '-out', join(root, 'cert')], { stdio: 'ignore' })
  const ca = readFileSync(join(root, 'cert'))
  const formal = { appOrigin: '', apiOrigin: '' }
  const state = { version: 2, buildId: 'b'.repeat(40), pagesBuildId: 'b'.repeat(40), status: 200, originMismatch: false }
  const headers: Array<{ cookie?: string; authorization?: string }> = []
  const server = createServer({ key: readFileSync(join(root, 'key')), cert: ca }, (req, res) => {
    headers.push({ cookie: req.headers.cookie, authorization: req.headers.authorization })
    if (req.url === '/api/auth/browser-policy') {
      res.writeHead(state.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Location: '/wrong' })
      res.end(JSON.stringify({ ...formal, version: state.version, buildId: state.buildId, ...(state.originMismatch ? { appOrigin: 'https://wrong.invalid' } : {}) }))
    } else if (req.url === '/frontend-build.json') {
      res.end(JSON.stringify({ format: 1, gameBuildId: state.pagesBuildId, basePath: '/', releaseChannel: 'stable', deploymentTarget: 'stable-pages' }))
    } else if (req.url === '/') res.end('<!doctype html><script type="module" crossorigin src="/assets/index-fixture.js"></script>')
    else if (req.url === '/assets/index-fixture.js') res.end('export const protectedBrowser = true')
    else { res.writeHead(404); res.end() }
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Expected formal TLS fixture port')
  formal.apiOrigin = formal.appOrigin = `https://127.0.0.1:${address.port}`
  return { formal, state, ca, headers, close: async () => {
    server.closeAllConnections()
    await new Promise<void>(done => server.close(() => done()))
    rmSync(root, { recursive: true, force: true })
  } }
}
