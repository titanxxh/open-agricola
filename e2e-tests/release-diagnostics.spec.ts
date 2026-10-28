import { expect, test } from '@playwright/test'
import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { observeReleasePage } from './helpers/release-diagnostics'

const roomId = '09caa980-daa3-4c4e-97aa-73677856a8d8'
const secrets = ['query-secret', 'hash-secret', 'socket-secret', 'password-secret', 'cookie-secret', 'scope-secret', 'state-secret', 'error-secret']
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')

async function controlServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname === '/api/fail') { request.socket.destroy(); return }
    if (url.pathname.startsWith('/api/')) { response.writeHead(200); response.end('{}'); return }
    if (url.pathname === '/sprite.png') { response.writeHead(200, { 'Content-Type': 'image/png' }); response.end(png); return }
    if (url.pathname === '/missing-image.png' || url.pathname === '/missing-font.woff2') { response.writeHead(404); response.end('Missing asset'); return }
    response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' })
    response.end(`<body><script>
      function connect() {
        const parameters = new URL(location.href).searchParams;
        const roomId = parameters.get('context') || parameters.get('room');
        const socket = new WebSocket('ws://' + location.host + '/ws?token=socket-secret&missing='+(location.pathname==='/missing'));
        socket.onopen = () => {
          socket.send(JSON.stringify({type:'auth',password:'password-secret',cookie:'cookie-secret'}));
          socket.send(JSON.stringify({type:'getCommandScope'}));
        };
        socket.onmessage = event => {
          const message = JSON.parse(event.data);
          if (message.type === 'commandScope') socket.send(JSON.stringify({type:'joinRoom',roomId,intent:parameters.get('context')?'resume':'join'}));
          if (message.type === 'stateUpdate') {
            const normalized = new URL(location.href); normalized.searchParams.delete('context'); normalized.searchParams.set('room',roomId);
            history.replaceState(null,'',normalized);
            document.body.dataset.received = message.sync;
          }
        };
        socket.onclose = () => setTimeout(connect,0);
      }
      connect();
      fetch('/api/status?token=query-secret',{headers:{'X-Test-Secret':'password-secret'}}).catch(()=>{});
    </script></body>`)
  })
  const sockets = new WebSocketServer({ server })
  let closed = 0
  sockets.on('connection', (socket, request) => {
    socket.on('close', () => closed++)
    const missingSnapshot = new URL(request.url ?? '/', 'http://localhost').searchParams.get('missing') === 'true'
    socket.on('message', payload => {
      let message: unknown
      try { message = JSON.parse(payload.toString()) } catch { return }
      if (typeof message !== 'object' || message === null || !('type' in message)) return
      if (message.type === 'getCommandScope') socket.send(JSON.stringify({ type: 'commandScope', scope: { token: 'scope-secret' } }))
      if (message.type === 'joinRoom') {
        socket.send(JSON.stringify({ type: 'roomJoined', roomId, playerIndex: 0 }))
        socket.send(JSON.stringify({ type: 'stateUpdate', roomId, sync: 'delta', payload: { secret: 'state-secret' } }))
        if (!missingSnapshot) setTimeout(() => {
          if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'stateUpdate', roomId, sync: 'snapshot', payload: { secret: 'state-secret' } }))
        }, 20)
      }
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Control server requires a TCP address')
  return {
    url: `http://127.0.0.1:${address.port}`,
    activeConnections: () => sockets.clients.size,
    closedConnections: () => closed,
    async close() {
      for (const socket of sockets.clients) socket.terminate()
      await new Promise<void>(resolve => sockets.close(() => resolve()))
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

for (const entry of ['room', 'context']) {
  test(`release diagnostics binds reload snapshots to new documents and observes ${entry} entry intent`, async ({ page }, testInfo) => {
    const server = await controlServer(), diagnostics = observeReleasePage(page)
    try {
      await page.goto(`${server.url}/?${entry}=${roomId}&token=query-secret#hash-secret`)
      await page.waitForFunction(() => document.body.dataset.received === 'snapshot')
      const before = diagnostics.snapshot()
      const first = before.entries.findLast(event => event.kind === 'frame' && event.messageType === 'stateUpdate' && event.sync === 'snapshot')
      if (!first || first.kind !== 'frame') throw new Error('The first document must receive its full snapshot')
      const join = before.entries.find(event => event.kind === 'frame' && event.messageType === 'joinRoom')
      expect(join).toMatchObject({ kind: 'frame', joinIntent: entry === 'context' ? 'resume' : 'join', roomId })
      expect(before.entries.filter(event => event.kind === 'document-navigation')).toHaveLength(1)
      expect(before.entries.some(event => event.kind === 'same-document-navigation')).toBe(true)
      await page.reload()
      await page.waitForFunction(() => document.body.dataset.received === 'snapshot')
      const after = diagnostics.snapshot()
      const next = after.entries.findLast(event => event.kind === 'frame' && event.messageType === 'stateUpdate' && event.sync === 'snapshot')
      if (!next || next.kind !== 'frame') throw new Error('The reloaded document must receive its full snapshot')
      expect(after.entries.filter(event => event.kind === 'document-navigation')).toHaveLength(2)
      expect(next.documentId).toBe(first.documentId + 1)
      expect(next.socketId).not.toBe(first.socketId)
      await expect.poll(server.closedConnections).toBeGreaterThan(0)
      await expect.poll(server.activeConnections).toBe(1)
      expect(after.entries.findLast(event => event.kind === 'frame' && event.messageType === 'joinRoom')).toMatchObject({ kind: 'frame', roomId, joinIntent: 'join', documentId: next.documentId })
      for (const secret of secrets) expect(JSON.stringify(after)).not.toContain(secret)
    } finally {
      diagnostics.dispose()
      await testInfo.attach('release-diagnostics', { body: JSON.stringify({ ...diagnostics.snapshot(), server: { closedConnections: server.closedConnections(), activeConnections: server.activeConnections() } }), contentType: 'application/json' })
      await page.close(); await server.close()
    }
  })
}

test('release diagnostics distinguishes a joined seat without a full snapshot on the first failure record', async ({ page }, testInfo) => {
  const server = await controlServer(), diagnostics = observeReleasePage(page)
  try {
    await page.goto(`${server.url}/missing?room=${roomId}`)
    await page.waitForFunction(() => document.body.dataset.received === 'delta')
    const evidence = diagnostics.snapshot()
    expect(evidence.entries.some(event => event.kind === 'frame' && event.messageType === 'roomJoined' && event.roomId === roomId && event.playerIndex === 0)).toBe(true)
    expect(evidence.entries.some(event => event.kind === 'frame' && event.messageType === 'stateUpdate' && event.sync === 'delta')).toBe(true)
    expect(evidence.entries.some(event => event.kind === 'frame' && event.messageType === 'stateUpdate' && event.sync === 'snapshot')).toBe(false)
  } finally {
    diagnostics.dispose()
    await testInfo.attach('first-failure-release-diagnostics', { body: JSON.stringify(diagnostics.snapshot()), contentType: 'application/json' })
    await page.close(); await server.close()
  }
})

test('release diagnostics bounds and sanitizes evidence and detaches observers before old-page errors', async ({ page }, testInfo) => {
  const server = await controlServer(), diagnostics = observeReleasePage(page), bounded = observeReleasePage(page, { capacity: 4 })
  try {
    expect(() => observeReleasePage(page, { capacity: 0 })).toThrow('Diagnostic capacity')
    await page.context().addCookies([{ name: 'diagnostics-control', value: 'cookie-secret', url: server.url }])
    await page.goto(`${server.url}/?room=${roomId}&token=query-secret#hash-secret`)
    await page.waitForFunction(() => document.body.dataset.received === 'snapshot')
    const assetResults = await page.evaluate(async () => {
      const image = (url: string) => new Promise<'loaded' | 'failed'>(resolve => {
        const image = new Image()
        image.onload = () => resolve('loaded'); image.onerror = () => resolve('failed'); image.src = url
      })
      return Promise.all([
        image('/sprite.png?token=query-secret#hash-secret'),
        image('/missing-image.png?token=query-secret#hash-secret'),
        new FontFace('DiagnosticMissingFont', "url('/missing-font.woff2?token=query-secret#hash-secret')")
          .load().then(() => 'loaded', () => 'failed'),
      ])
    })
    expect(assetResults).toEqual(['loaded', 'failed', 'failed'])
    const assetEvidence = diagnostics.snapshot()
    for (const [path, resourceType, status] of [
      ['/sprite.png', 'image', 200], ['/missing-image.png', 'image', 404], ['/missing-font.woff2', 'font', 404],
    ]) {
      const started = assetEvidence.entries.find(event => event.kind === 'request-start' && event.path === path)
      if (!started || started.kind !== 'request-start') throw new Error('Asset requests must be present in the first diagnostic record')
      expect(started.resourceType).toBe(resourceType)
      expect(assetEvidence.entries.some(event => event.kind === 'response' && event.requestId === started.requestId && event.status === status)).toBe(true)
    }
    await page.evaluate(async () => { await fetch('/api/fail?token=query-secret').catch(() => undefined) })
    await expect.poll(() => diagnostics.snapshot().entries.some(event => event.kind === 'request-failed')).toBe(true)
    const unhandled = page.waitForEvent('pageerror')
    await page.evaluate(() => { setTimeout(() => { throw new TypeError('error-secret') }, 0) })
    await unhandled
    const evidence = diagnostics.snapshot()
    expect(evidence.entries.some(event => event.kind === 'page-error' && event.category === 'TypeError')).toBe(true)
    expect(evidence.entries.some(event => event.kind === 'request-start' && event.path === '/api/status')).toBe(true)
    expect(evidence.entries.some(event => event.kind === 'response' && event.status === 200)).toBe(true)
    for (const secret of secrets) expect(JSON.stringify(evidence)).not.toContain(secret)
    const short = bounded.snapshot()
    expect(short.entries).toHaveLength(4)
    expect(short.dropped).toBeGreaterThan(0)
    const last = evidence.entries.at(-1)
    if (!last) throw new Error('Evidence must include the page error')
    last.documentId = 999
    expect(diagnostics.snapshot().entries.at(-1)?.documentId).not.toBe(999)
    diagnostics.dispose(); bounded.dispose()
    const retired = diagnostics.snapshot(), retiredBounded = bounded.snapshot()
    const lateError = page.waitForEvent('pageerror')
    await page.evaluate(() => { setTimeout(() => { throw new Error('error-secret') }, 0) })
    await lateError
    await page.reload()
    await page.waitForFunction(() => document.body.dataset.received === 'snapshot')
    expect(diagnostics.snapshot()).toEqual(retired)
    expect(bounded.snapshot()).toEqual(retiredBounded)
  } finally {
    diagnostics.dispose(); bounded.dispose()
    await testInfo.attach('retired-release-diagnostics', { body: JSON.stringify(diagnostics.snapshot()), contentType: 'application/json' })
    await page.close(); await server.close()
  }
})
