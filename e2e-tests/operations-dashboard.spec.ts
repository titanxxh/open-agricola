import { expect, test } from '@playwright/test'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createAccountsHandler, createAccountsPool } from '../operations/accounts-exporter'
import { createOperationsHandler } from '../server/observability/http'
import { createTestDatabase, getTestDatabaseUrl } from '../server/__tests__/_helpers/postgres'
import { allocateTestPort } from '../scripts/test-ports'
import { BACKEND_URL } from './fixtures'

test('independent metrics render registration stats and room totals with two axes in real Grafana', async ({ page, request }) => {
  test.setTimeout(180_000)
  expect((await request.get(BACKEND_URL + '/api/health')).ok()).toBe(true)
  const directory = mkdtempSync(join(tmpdir(), 'oa-ops-browser-'))
  chmodSync(directory, 0o755)
  const db = await createTestDatabase()
  const schema = (await db.query<{ schema: string }>('SELECT current_schema() AS schema')).rows[0]!.schema
  const pool = createAccountsPool(getTestDatabaseUrl(), schema)
  const names: string[] = []
  const servers: Server[] = []
  const previous = { ADMIN_USERS: process.env.ADMIN_USERS, GRAFANA_URL: process.env.GRAFANA_URL }
  const listen = async (server: Server) => {
    servers.push(server)
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected TCP listener')
    return address.port
  }
  const docker = (args: string[]) => execFileSync('docker', args, { stdio: 'pipe' }).toString().trim()
  try {
    const now = Date.now()
    for (const [id, createdAt] of [['ops_visual_admin', now], ['older-account', now - 8 * 86_400_000]] as const) {
      await db.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)').run(id, id, id, 'unused-password', createdAt)
    }
    await db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('visual-session', 'ops_visual_admin', now, now + 180_000)
    process.env.ADMIN_USERS = 'ops_visual_admin'
    const accounts = createAccountsHandler({ pool, token: 'visual-scrape' })
    const accountsPort = await listen(createServer((req, res) => { void accounts(req, res) }))
    const operations = createOperationsHandler({ db })
    const gatewayPort = await listen(createServer((req, res) => {
      if (req.url === '/fixture-metrics') {
        res.setHeader('Content-Type', 'text/plain; version=0.0.4')
        const values = { rooms_waiting: 2, rooms_playing: 3, rooms_hotseat: 1, rooms_development: 1, rooms_retained: 120 }
        res.end(Object.entries(values).map(([kind, value]) => `agricola_platform{role="ingress",kind="${kind}"} ${value}`).join('\n')
          + `\nagricola_collector_last_success_unixtime{source="global"} ${Date.now() / 1000}\nagricola_collector_status{source="global"} 1\n`)
      } else void operations(req, res)
    }))
    const prometheusPort = await allocateTestPort()
    const grafanaPort = await allocateTestPort({ taken: [prometheusPort] })
    const grafanaBase = `http://127.0.0.1:${grafanaPort}`
    process.env.GRAFANA_URL = grafanaBase
    const base = `http://127.0.0.1:${gatewayPort}`
    writeFileSync(join(directory, 'prometheus.yml'), `global:\n  scrape_interval: 1s\nscrape_configs:\n  - job_name: accounts\n    metrics_path: /internal/metrics\n    authorization:\n      credentials: visual-scrape\n    static_configs:\n      - targets: ['127.0.0.1:${accountsPort}']\n  - job_name: agricola-ingress\n    metrics_path: /fixture-metrics\n    static_configs:\n      - targets: ['127.0.0.1:${gatewayPort}']\n`)
    chmodSync(join(directory, 'prometheus.yml'), 0o644)
    const promName = 'oa-ops-prom-' + randomUUID()
    names.push(promName)
    docker(['run', '-d', '--name', promName, '--network', 'host', '-v', `${directory}/prometheus.yml:/etc/prometheus/prometheus.yml:ro`,
      'prom/prometheus:v3.15.0', '--config.file=/etc/prometheus/prometheus.yml', `--web.listen-address=127.0.0.1:${prometheusPort}`])
    const grafanaName = 'oa-ops-grafana-' + randomUUID()
    names.push(grafanaName)
    docker(['run', '-d', '--name', grafanaName, '--network', 'host', '--tmpfs', '/var/lib/grafana:exec,uid=472,gid=0',
      '-e', 'GF_SERVER_HTTP_ADDR=127.0.0.1', '-e', `GF_SERVER_HTTP_PORT=${grafanaPort}`, '-e', `GF_SERVER_ROOT_URL=${base}/ops/`,
      '-e', `PROMETHEUS_URL=http://127.0.0.1:${prometheusPort}`, '-v', `${resolve('operations/grafana/grafana.ini')}:/etc/grafana/grafana.ini:ro`,
      '-v', `${resolve('operations/grafana/provisioning')}:/etc/grafana/provisioning:ro`, '-v', `${resolve('operations/grafana/dashboards')}:/etc/grafana/dashboards:ro`, 'grafana/grafana:13.2.3'])
    await expect.poll(async () => { try { return (await request.get(grafanaBase + '/ops/api/health')).status() } catch { return 0 } }, { timeout: 60_000 }).toBe(200)
    const handoff = await request.post(base + '/api/admin/observability/session', { headers: { Authorization: 'Bearer visual-session' } })
    const { path } = await handoff.json()
    await page.goto(base + path)
    for (const title of ['现存注册账户', '今日新增注册（UTC+8）', '近24小时新增注册', '近7天新增注册', '房间数量']) {
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible({ timeout: 30_000 })
    }
    const query = async (expression: string) => {
      const response = await page.request.get(base + '/ops/api/datasources/proxy/uid/agricola-prometheus/api/v1/query', { params: { query: expression } })
      const body = await response.text()
      if (!response.ok() || !body) return { status: response.status(), body }
      return JSON.parse(body).data.result.map((row: { value: [number, string] }) => row.value[1])
    }
    await expect.poll(() => query('agricola_accounts{kind="total"}'), { timeout: 30_000 }).toEqual(['2'])
    expect(await query('agricola_accounts{kind="today"}')).toEqual(['1'])
    await expect.poll(() => query('sum(agricola_platform{kind=~"rooms_waiting|rooms_playing|rooms_hotseat|rooms_retained"})'), { timeout: 30_000 }).toEqual(['126'])
    const dashboard = (await (await page.request.get(base + '/ops/api/dashboards/uid/open-agricola')).json()).dashboard
    const room = dashboard.panels.find((panel: { id: number }) => panel.id === 36)
    expect(room.fieldConfig.defaults.custom.axisPlacement).toBe('left')
    expect(room.fieldConfig.overrides.map((override: { matcher: { options: string } }) => override.matcher.options)).toEqual(['离线保留房间', '总房间'])
    for (const override of room.fieldConfig.overrides) expect(override.properties).toContainEqual({ id: 'custom.axisPlacement', value: 'right' })
    await page.goto(base + '/ops/d/open-agricola/operations?from=now-5m&to=now&refresh=5s')
    await expect(page.getByRole('region', { name: '现存注册账户', exact: true })).toContainText('2', { timeout: 30_000 })
    await expect(page.getByRole('region', { name: '今日新增注册（UTC+8）', exact: true })).toContainText('1')
    await expect(page.getByText('总房间', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: 'output/operations-dashboard.png', fullPage: true })
  } finally {
    for (const name of names.reverse()) {
      const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8' })
      writeFileSync(join('output', name.startsWith('oa-ops-grafana-') ? 'operations-grafana.log' : 'operations-prometheus.log'), logs.stdout + logs.stderr)
      try { docker(['rm', '-f', name]) } catch { /* Already stopped. */ }
    }
    await Promise.all(servers.map(server => new Promise<void>(done => server.close(() => done()))))
    await pool.end()
    await db.close()
    rmSync(directory, { recursive: true, force: true })
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})
