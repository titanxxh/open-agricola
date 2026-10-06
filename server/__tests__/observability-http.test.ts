import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createTestDatabase } from './_helpers/postgres'
import { createOperationsHandler } from '../observability/http'

const db = await createTestDatabase()
const grafana = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ user: req.headers['x-webauth-user'], cookie: req.headers.cookie, authorization: req.headers.authorization }))
})
const handler = createOperationsHandler({ db })
const server = createServer((req, res) => {
  void handler(req, res).then(handled => {
    if (!handled) { res.writeHead(404); res.end() }
  }).catch(() => { res.writeHead(503); res.end() })
})
let base = ''
beforeAll(async () => {
  vi.stubEnv('ADMIN_USERS', 'ops-admin')
  vi.stubEnv('OBSERVABILITY_METRICS_TOKEN', 'scrape-test-token')
  for (const username of ['ops-admin', 'ordinary-user']) {
    await db.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)')
      .run(username, username, username, 'unused-test-password', Date.now())
    await db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)')
      .run(username + '-token', username, Date.now(), Date.now() + 60_000)
  }
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  await new Promise<void>(done => grafana.listen(0, '127.0.0.1', done))
  vi.stubEnv('GRAFANA_URL', `http://127.0.0.1:${(grafana.address() as AddressInfo).port}`)
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>(done => server.close(() => done()))
  await new Promise<void>(done => grafana.close(() => done()))
  await db.close()
  vi.unstubAllEnvs()
})

it('uses a one-time handoff, strips site credentials and checks current privileges on every Grafana request', async () => {
  const bootstrap = await fetch(base + '/api/admin/observability/session', { method: 'POST', headers: { Authorization: 'Bearer ops-admin-token' } })
  expect(bootstrap.status).toBe(200)
  const { path } = await bootstrap.json()
  const start = await fetch(base + path, { redirect: 'manual' })
  expect(start.status).toBe(303)
  const cookie = start.headers.get('set-cookie')!.split(';')[0]!
  expect((await fetch(base + path, { redirect: 'manual' })).status).toBe(401)
  const query = await fetch(base + '/ops/api/ds/query', { method: 'POST', headers: { Cookie: cookie, 'X-WEBAUTH-USER': 'forged', Authorization: 'Bearer ignored' }, body: '{}' })
  expect(query.status).toBe(200)
  expect(await query.json()).toEqual({ user: 'ops-admin' })
  expect((await fetch(base + '/ops/api/dashboards/db', { method: 'POST', headers: { Cookie: cookie }, body: '{}' })).status).toBe(405)
  vi.stubEnv('ADMIN_USERS', '')
  expect((await fetch(base + '/ops/api/ds/query', { method: 'POST', headers: { Cookie: cookie }, body: '{}' })).status).toBe(403)
  vi.stubEnv('ADMIN_USERS', 'ops-admin')
})

it('requires the current site administrator for every dashboard and data route', async () => {
  for (const route of ['/api/admin/observability', '/ops/', '/ops/api/ds/query']) {
    const anonymous = await fetch(base + route)
    expect(anonymous.status).toBe(401)
    const ordinary = await fetch(base + route, {
      headers: { Authorization: 'Bearer ordinary-user-token', 'X-WEBAUTH-USER': 'ops-admin' },
    })
    expect(ordinary.status).toBe(403)
  }
})

it('lets a Chinese administrator use Grafana without invalid HTTP headers', async () => {
  await db.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)')
    .run('unicode-admin', '管理员甲', '管理员甲', 'unused-test-password', Date.now())
  await db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)')
    .run('unicode-admin-token', 'unicode-admin', Date.now(), Date.now() + 60_000)
  vi.stubEnv('ADMIN_USERS', 'ops-admin,管理员甲')
  try {
    const response = await fetch(base + '/ops/api/search', { headers: { Authorization: 'Bearer unicode-admin-token' } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: '%E7%AE%A1%E7%90%86%E5%91%98%E7%94%B2' })
  } finally { vi.stubEnv('ADMIN_USERS', 'ops-admin') }
})

it('keeps local HTTP handoff cookies usable with a production API URL in .env', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalApiBase = process.env.PUBLIC_API_BASE
  vi.stubEnv('PUBLIC_API_BASE', 'https://api.example.com')
  try {
    for (const environment of ['development', 'production']) {
      vi.stubEnv('NODE_ENV', environment)
      const bootstrap = await fetch(base + '/api/admin/observability/session', { method: 'POST', headers: { Authorization: 'Bearer ops-admin-token' } })
      const { path } = await bootstrap.json()
      const start = await fetch(base + path, { redirect: 'manual' })
      expect(start.status).toBe(303)
      expect(start.headers.get('set-cookie')!.includes('; Secure')).toBe(environment === 'production')
    }
  } finally { vi.stubEnv('NODE_ENV', originalNodeEnv); vi.stubEnv('PUBLIC_API_BASE', originalApiBase) }
})

it('protects the scrape endpoint and reports actual rejected HTTP requests', async () => {
  expect((await fetch(base + '/internal/metrics')).status).toBe(401)
  const scrape = async () => {
    const response = await fetch(base + '/internal/metrics', { headers: { Authorization: 'Bearer scrape-test-token' } })
    expect(response.status).toBe(200)
    return response.text()
  }
  const rejected = (text: string) => text.split('\n')
    .filter(line => line.startsWith('agricola_http_requests_total{') && line.includes('status="401"') && line.includes('route="operations"'))
    .reduce((sum, line) => sum + Number(line.slice(line.lastIndexOf(' ') + 1)), 0)
  const before = rejected(await scrape())
  await fetch(base + '/api/admin/observability')
  expect(rejected(await scrape())).toBe(before + 1)
})

it('shows unknown values when trend storage has no recent samples', async () => {
  vi.stubEnv('PROMETHEUS_URL', '')
  const response = await fetch(base + '/api/admin/observability', { headers: { Authorization: 'Bearer ops-admin-token' } })
  expect(response.status).toBe(200)
  const overview = await response.json()
  expect(overview.level).toBe('unknown')
  expect(overview.values).toEqual({ runtimeFresh: null, directoryInstances: null, versions: null, s3Fresh: null, blockedRooms: null, gameReady: null, dbErrors: null, s3Errors: null, backupAge: null, taskAge: null, instances: null, onlineUsers: null, playingRooms: null, commandP95: null, errorRate: null })
  expect(overview.lastSample).toBeNull()
})

it('rejects absolute-form upstream overrides before forwarding administrator headers', async () => {
  const { request } = await import('node:http')
  const status = await new Promise<number>(resolve => {
    const req = request({ hostname: '127.0.0.1', port: (server.address() as AddressInfo).port,
      path: 'http://127.0.0.1:1/ops/api/search', headers: { Authorization: 'Bearer ops-admin-token' } }, res => { res.resume(); resolve(res.statusCode!) })
    req.end()
  })
  expect(status).toBe(400)
})

it('suppresses current values when the global sample is stale or application source coverage is incomplete', async () => {
  let stale = true
  const trend = createServer((req, res) => {
    const query = new URL(req.url!, 'http://localhost').searchParams.get('query') ?? ''
    const value = query.includes('source="global"') ? Date.now() / 1000 - (stale ? 180 : 0)
      : query.startsWith('count(') ? 1 : query.includes('instances_ready') || query.includes('up{') || query.startsWith('sum(agricola_platform{role="app",kind="game_ready"}') ? 2 : 0
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'success', data: { result: [{ value: [Date.now() / 1000, String(value)] }] } }))
  })
  await new Promise<void>(done => trend.listen(0, '127.0.0.1', done))
  vi.stubEnv('APP_INSTANCES', '2')
  vi.stubEnv('PROMETHEUS_URL', `http://127.0.0.1:${(trend.address() as AddressInfo).port}`)
  try {
    for (const globalStale of [true, false]) {
      stale = globalStale
      const response = await fetch(base + '/api/admin/observability', { headers: { Authorization: 'Bearer ops-admin-token' } })
      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.level).toBe('unknown')
      expect(result.values.onlineUsers).toBeNull()
      expect(result.values.gameReady).toBeNull()
      expect(result.reasons).toContain('freshness')
    }
  } finally { await new Promise<void>(done => trend.close(() => done())); vi.stubEnv('PROMETHEUS_URL', ''); vi.stubEnv('APP_INSTANCES', '1') }
})
