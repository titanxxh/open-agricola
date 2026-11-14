import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from '@playwright/test'
import { expect, it } from 'vitest'
import { clearOwnReleaseSession } from '../../e2e-tests/helpers/release-browser'
import { createFailureRecorder } from '../release/smoke'

it.each([false, true])('cleans only the current issued session and retains the first failure when logout fails=%s', async failLogout => {
  const sessions = new Set(['other-retained-session']), observed: string[] = []
  const server = createServer((req, res) => {
    const token = req.headers.cookie?.split('=')[1] ?? ''
    if (req.url === '/login') { sessions.add('this-attempt'); res.setHeader('Set-Cookie', 'test-session=this-attempt; Path=/; HttpOnly'); res.end('{}'); return }
    if (req.url === '/api/auth/logout' && req.method === 'POST') {
      observed.push(token)
      if (failLogout) { res.writeHead(500); res.end('private-cookie-secret'); return }
      sessions.delete(token); res.setHeader('Set-Cookie', 'test-session=; Path=/; Max-Age=0'); res.end('{}'); return
    }
    res.writeHead(sessions.has(token) ? 200 : 401); res.end('{}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Expected loopback control address')
  const origin = `http://127.0.0.1:${address.port}`, client = await request.newContext()
  const directory = mkdtempSync(join(tmpdir(), 'release-cleanup-')), record = createFailureRecorder(directory, () => ({ dropped: 0, entries: [] }))
  try {
    await client.get(`${origin}/login`)
    const first = record('retained-replay', new Error('password-secret cookie-secret'))
    try { await clearOwnReleaseSession(client, origin, {}) }
    catch (error) { expect(failLogout).toBe(true); expect(record('logout', error).error).toBe(first.error) }
    expect(observed).toEqual(['this-attempt']); expect(sessions.has('other-retained-session')).toBe(true)
    expect(sessions.has('this-attempt')).toBe(failLogout)
    expect(JSON.parse(readFileSync(join(directory, 'failure.json'), 'utf8'))).toMatchObject({ stage: 'retained-replay', errorCategory: 'Error' })
    if (failLogout) expect(JSON.parse(readFileSync(join(directory, 'cleanup-failure.json'), 'utf8'))).toMatchObject({ stage: 'logout', errorCategory: 'AssertionError' })
    expect(readFileSync(join(directory, 'failure.json'), 'utf8')).not.toMatch(/password-secret|cookie-secret/)
  } finally {
    await client.dispose(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(directory, { recursive: true, force: true })
  }
})
