// @covers scripts/release/
// @covers e2e-tests/helpers/release-browser.ts
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { expect, test } from '@playwright/test'
import { installLiveSmokeGuard } from '../scripts/release/live-smoke-guard'
import { installReleaseLocale, signOutReleaseSession, submitReleaseLogin } from './helpers/release-browser'
import { BROWSER_WS_PROTOCOL } from '../shared/contract/browser-auth'

async function controlServer() {
  const requests: string[] = [], commands: string[] = []
  const server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (req.method === 'POST') {
      requests.push(path)
      if (path === '/api/auth/login') { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end('{}'); return }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}'); return
    }
    res.writeHead(200, { 'Content-Type': 'text/html' })
    if (new URL(req.url ?? '/', 'http://localhost').searchParams.get('page') === 'login') {
      res.end(`<form class="login-form"><input id="username"><input id="password"><button type="submit">Login</button></form>
        <script>document.querySelector('form').onsubmit=e=>{e.preventDefault();fetch('/api/auth/login',{method:'POST',body:'{}'})}</script>`)
    } else {
      res.end(`<style>@media(max-width:700px){.lobby-header__right{display:none}}</style><div class="lobby-page"><div class="lobby-header__right"><button>Sign Out</button></div></div>
        <iframe sandbox="allow-scripts" srcdoc="<!doctype html><title>Opaque one</title>"></iframe><iframe sandbox="allow-scripts" srcdoc="<!doctype html><title>Opaque two</title>"></iframe>
        <script>document.querySelector('button').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST',body:'{}'});document.body.innerHTML='<input id="username">'}</script>`)
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
  return { origin: `http://127.0.0.1:${address.port}`, requests, commands, async close() {
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
