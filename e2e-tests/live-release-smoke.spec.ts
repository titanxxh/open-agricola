// @covers scripts/release/
// @covers e2e-tests/helpers/release-browser.ts
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { WebSocketServer } from 'ws'
import { expect, test } from '@playwright/test'
import { installLiveSmokeGuard } from '../scripts/release/live-smoke-guard'
import { runLiveReleaseSmoke } from '../scripts/release/live-smoke'
import { installReleaseLocale, signOutReleaseSession, submitReleaseLogin } from './helpers/release-browser'
import { BROWSER_WS_PROTOCOL } from '../shared/contract/browser-auth'

async function controlServer() {
  const requests: string[] = [], commands: string[] = []
  const expectedBuild = 'a'.repeat(40)
  const build = { format: 1, gameBuildId: expectedBuild, basePath: '/', releaseChannel: 'stable', deploymentTarget: 'stable-pages' }
  const entry = '<!doctype html><title>Retained viewer control</title>'
  const viewer = JSON.stringify({ entrypoint: 'index.html', files: { 'index.html': createHash('sha256').update(entry).digest('hex') } })
  const viewerBuildId = createHash('sha256').update(viewer).digest('hex')
  const index = `<style>@media(max-width:700px){.lobby-header__right{display:none}}</style><div class="lobby-page"><div class="lobby-header__right"><button>Sign Out</button></div></div>
        <iframe sandbox="allow-scripts" srcdoc="<!doctype html><title>Opaque one</title>"></iframe><iframe sandbox="allow-scripts" srcdoc="<!doctype html><title>Opaque two</title>"></iframe>
        <script>document.querySelector('button').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST',body:'{}'});document.body.innerHTML='<input id="username">'}</script>`
  let origin = ''
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (req.method === 'POST') {
      requests.push(path)
      if (path === '/api/auth/login') { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{}'); return }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return
    }
    if (path === '/frontend-build.json' || path === '/api/auth/browser-policy' || path === '/api/v1/replays/ended/manifest') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(path === '/frontend-build.json' ? build : path === '/api/auth/browser-policy'
        ? { version: 2, buildId: expectedBuild, appOrigin: origin, apiOrigin: origin } : { ok: true, viewerBuildId }))
      return
    }
    if (path === `/replay-viewers/${viewerBuildId}/manifest.json`) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(viewer); return }
    if (path === `/replay-viewers/${viewerBuildId}/index.html`) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(entry); return }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    if (new URL(req.url ?? '/', 'http://localhost').searchParams.get('page') === 'login') {
      res.end(`<form class="login-form"><input id="username"><input id="password"><button type="submit">Login</button></form>
        <script>document.querySelector('form').onsubmit=e=>{e.preventDefault();fetch('/api/auth/login',{method:'POST',body:'{}'})}</script>`)
    } else {
      res.end(index)
    }
  })
  const sockets = new WebSocketServer({ server })
  sockets.on('connection', socket => socket.on('message', data => {
    const message: unknown = JSON.parse(data.toString())
    if (typeof message === 'object' && message !== null && 'type' in message && typeof message.type === 'string') commands.push(message.type)
    socket.send(JSON.stringify({ type: 'commandScope', scope: {} }))
  }))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Control server needs a loopback address')
  origin = `http://127.0.0.1:${address.port}`
  return { origin, expectedBuild, viewerBuildId, build, index, requests, commands, async close() {
    for (const socket of sockets.clients) socket.terminate()
    await new Promise<void>(resolve => sockets.close(() => resolve()))
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
  } }
}

for (const engine of ['chromium', 'webkit'] satisfies Array<'chromium' | 'webkit'>) {
  test(`live smoke read guard and locale cover opaque frames in ${engine}`, async ({ playwright }) => {
    const control = await controlServer(), browser = await playwright[engine].launch()
    const context = await browser.newContext(), errors: string[] = []
    try {
      await installReleaseLocale(context)
      const guard = await installLiveSmokeGuard(context, control.origin)
      await guard.authorizeParticipantRoom('retained-participant-room')
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.name))
      await page.goto(control.origin, { waitUntil: 'load' }); expect(page.frames()).toHaveLength(3)
      for (const frame of page.frames()) {
        await frame.evaluate(async ({ origin, protocol }) => {
          await new Promise<void>((resolve, reject) => {
            const socket = new WebSocket(origin.replace('http:', 'ws:') + '/nodes/fixture-one/ws', protocol)
            socket.onerror = () => reject(new Error('Control handshake failed'))
            socket.onopen = () => {
              socket.send(JSON.stringify({ type: 'getCommandScope' }))
              socket.send(JSON.stringify({ type: 'joinRoom', roomId: 'retained-participant-room', intent: window.top === window ? 'resume' : 'join' }))
              socket.send(JSON.stringify({ type: 'quoteFenceSelection', payload: { edges: [] } }))
              try { socket.send(JSON.stringify({ type: 'choice', value: 'confirm' })) } catch { /* Expected guard rejection. */ }
              try { socket.send(JSON.stringify({ type: 'joinRoom', roomId: 'other-room', intent: 'resume' })) } catch { /* Expected guard rejection. */ }
            }
            socket.onmessage = () => { socket.close(); resolve() }
          })
        }, { origin: control.origin, protocol: BROWSER_WS_PROTOCOL })
      }
      await expect.poll(() => guard.snapshot().blocked.length).toBe(6)
      expect(control.commands.sort()).toEqual(['getCommandScope', 'getCommandScope', 'getCommandScope', 'joinRoom', 'joinRoom', 'joinRoom', 'quoteFenceSelection', 'quoteFenceSelection', 'quoteFenceSelection'].sort())
      const sent = await page.evaluate(async () => {
        const result = []
        for (const body of [{ roomId: 'retained-participant-room' }, { allocationId: 'forbidden' }, { roomId: 'other-room' }, { roomId: 'retained-participant-room', pendingIdentity: {} }]) {
          try { result.push((await fetch('/api/rooms/locate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status) }
          catch { result.push('blocked') }
        }
        return result
      })
      expect(sent).toEqual([200, 'blocked', 'blocked', 'blocked'])
      expect(control.requests).toEqual(['/api/rooms/locate'])
      expect(await page.evaluate(() => localStorage.getItem('open-agricola-locale-v2'))).toBe('en')
      expect(errors).toEqual([])
    } finally { await context.close(); await browser.close(); await control.close() }
  })
}

test('release login waiter and desktop logout complete after the mobile viewport test', async ({ browser }) => {
  const control = await controlServer(), context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const page = await context.newPage()
    await page.goto(`${control.origin}?page=login`)
    await expect(submitReleaseLogin(page, control.origin, { username: 'fixture', password: 'fixture-password' })).rejects.toThrow()
    await page.goto(control.origin)
    await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeHidden()
    await signOutReleaseSession(page, `${control.origin}/`, control.origin)
    expect(page.viewportSize()).toEqual({ width: 1280, height: 900 })
    await expect(page.locator('#username')).toBeVisible()
    expect(control.requests).toEqual(['/api/auth/login', '/api/auth/logout'])
  } finally { await context.close(); await control.close() }
})

test('live smoke records the tested normalized origins in its actual failed browser report', async () => {
  const control = await controlServer(), directory = mkdtempSync(join(tmpdir(), 'live-smoke-origins-'))
  const artifact = join(directory, 'pages'), output = join(directory, 'attempt')
  const credentials = join(directory, 'credentials.env'), inventory = join(directory, 'inventory.json')
  try {
    mkdirSync(artifact)
    writeFileSync(join(artifact, 'frontend-build.json'), JSON.stringify(control.build))
    writeFileSync(join(artifact, 'index.html'), control.index)
    writeFileSync(credentials, 'MY_TEST_USER_ID=fixture\nMY_TEST_PASSWORD=fixture-password\n', { mode: 0o600 })
    writeFileSync(inventory, JSON.stringify({ observedAt: new Date().toISOString(),
      instances: ['one', 'two'].map(instance_id => ({ instance_id, generation: control.expectedBuild, status: 'ready', lease_valid: true })),
      contexts: [{ room_id: 'ended', lifecycle: 'completed' }], replays: [{ room_id: 'ended', viewer_build_id: control.viewerBuildId }],
    }), { mode: 0o600 })
    await expect(runLiveReleaseSmoke({ format: 1, appUrl: `${control.origin}/`, apiUrl: `${control.origin}/`, expectedBuild: control.expectedBuild,
      credentialsFile: credentials, inventoryFile: inventory, artifactDirectory: artifact, outputDirectory: output,
    })).rejects.toThrow('Release smoke failed during chromium:login')
    const result = JSON.parse(readFileSync(join(output, 'result.json'), 'utf8'))
    expect(result).toMatchObject({ expectedBuild: control.expectedBuild, appOrigin: control.origin, apiOrigin: control.origin,
      passed: false, failure: { stage: 'chromium:login' } })
    expect(control.requests).toEqual(['/api/auth/login'])
    expect(control.commands).toEqual([])
    expect(result.browsers[0].cleanupFailures).toEqual([])
  } finally { await control.close(); rmSync(directory, { recursive: true, force: true }) }
})
