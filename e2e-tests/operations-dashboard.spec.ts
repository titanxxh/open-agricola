import { expect, test, type Response } from '@playwright/test'
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

test('independent dashboards render registration, rooms and durable player openings in real Grafana', async ({ page, request }, testInfo) => {
  test.setTimeout(300_000)
  await page.setViewportSize({ width: 1280, height: 320 })
  expect((await request.get(BACKEND_URL + '/api/health')).ok()).toBe(true)
  const directory = mkdtempSync(join(tmpdir(), 'oa-ops-browser-'))
  chmodSync(directory, 0o755)
  const db = await createTestDatabase()
  const schema = (await db.query<{ schema: string }>('SELECT current_schema() AS schema')).rows[0]!.schema
  const pool = createAccountsPool(getTestDatabaseUrl(), schema)
  const names: string[] = []
  const servers: Server[] = []
  const panelQueries: Array<{ status: number; expressions: string[]; executedExpressions: string[]; request: unknown; response: unknown }> = []
  const panelCaptures: Promise<void>[] = []
  const navigations: string[] = []
  const panelViews: unknown[] = []
  page.on('framenavigated', frame => {
    if (frame !== page.mainFrame()) return
    const url = new URL(frame.url())
    const params = new URLSearchParams()
    for (const key of ['from', 'to', 'refresh']) { const value = url.searchParams.get(key); if (value) params.set(key, value) }
    navigations.push(url.origin + url.pathname + (params.size ? '?' + params.toString() : ''))
    if (navigations.length > 64) navigations.shift()
  })
  const capturePanel = (response: Response) => {
    if (new URL(response.url()).pathname !== '/ops/api/ds/query' || response.request().method() !== 'POST' || panelQueries.length >= 200) return
    const payload: unknown = response.request().postDataJSON()
    if (!payload || typeof payload !== 'object' || !('queries' in payload) || !Array.isArray(payload.queries)) return
    const rangeSeconds = 'from' in payload && 'to' in payload ? (Number(payload.to) - Number(payload.from)) / 1000 : NaN
    const expressions = payload.queries.flatMap(query => query && typeof query === 'object' && typeof query.expr === 'string'
      ? [query.expr.replaceAll('$__range', Number.isFinite(rangeSeconds) && rangeSeconds > 0 ? `${rangeSeconds}s` : '$__range')] : [])
    if (!expressions.some(expression => /agricola_(accounts|platform|opening_|commands_total)/.test(expression))) return
    const entry: (typeof panelQueries)[number] = { status: response.status(), expressions, executedExpressions: [], request: payload, response: 'pending' }
    panelQueries.push(entry)
    panelCaptures.push((async () => {
      try {
        const body: { results?: Record<string, { frames?: Array<{ schema?: { meta?: { executedQueryString?: string } } }> }> } = await response.json()
        entry.response = body
        entry.executedExpressions = Object.values(body.results ?? {}).flatMap(result => (result.frames ?? [])
          .flatMap(frame => {
            const expression = frame.schema?.meta?.executedQueryString
            return expression?.startsWith('Expr: ') ? [expression.slice('Expr: '.length).split('\nStep:')[0]!.trim()] : []
          }))
      }
      catch { entry.response = 'unreadable' }
    })())
  }
  page.on('response', capturePanel)
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
    await db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)').run('visual-session', 'ops_visual_admin', now, now + 360_000)
    process.env.ADMIN_USERS = 'ops_visual_admin'
    let accounts = createAccountsHandler({ pool, token: 'visual-scrape' })
    const accountsPort = await listen(createServer((req, res) => { void accounts(req, res) }))
    const operations = createOperationsHandler({ db })
    const gatewayPort = await listen(createServer((req, res) => {
      if (req.url === '/fixture-metrics') {
        res.setHeader('Content-Type', 'text/plain; version=0.0.4')
        const values = { rooms_waiting: 2, rooms_playing: 3, rooms_hotseat: 1, rooms_development: 1, rooms_retained: 120 }
        res.end(Object.entries(values).map(([kind, value]) => `agricola_platform{role="ingress",kind="${kind}"} ${value}`).join('\n')
          + '\n# TYPE agricola_commands_total counter\n'
          + ['createRoom', 'joinRoom', 'newGame'].flatMap(command => ['error', 'rule_rejected']
            .map(outcome => `agricola_commands_total{command="${command}",outcome="${outcome}"} 0`)).join('\n')
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
    for (const [id, expected] of [[39, '2'], [40, '1']] as const) {
      const expression = dashboard.panels.find((panel: { id: number }) => panel.id === id).targets[0].expr
      await expect.poll(() => query(expression), { timeout: 30_000 }).toEqual([expected])
    }
    const room = dashboard.panels.find((panel: { id: number }) => panel.id === 36)
    expect(room.fieldConfig.defaults.custom.axisPlacement).toBe('left')
    expect(room.fieldConfig.overrides.map((override: { matcher: { options: string } }) => override.matcher.options)).toEqual(['离线保留房间', '总房间'])
    for (const override of room.fieldConfig.overrides) expect(override.properties).toContainEqual({ id: 'custom.axisPlacement', value: 'right' })
    await page.goto(base + '/ops/d/open-agricola/operations?from=now-5m&to=now&refresh=15s')
    panelViews.push({ viewport: page.viewportSize(), accountBounds: await page.getByRole('region', { name: '现存注册账户', exact: true }).boundingBox(), roomBounds: await page.getByRole('region', { name: '房间数量', exact: true }).boundingBox() })
    const accountPanel = page.getByRole('region', { name: '现存注册账户', exact: true })
    await accountPanel.scrollIntoViewIfNeeded()
    panelViews.push({ accountBoundsAfterScroll: await accountPanel.boundingBox() })
    await expect(accountPanel).toContainText('2', { timeout: 30_000 })
    await expect(page.getByRole('region', { name: '今日新增注册（UTC+8）', exact: true })).toContainText('1')
    const roomPanel = page.getByRole('region', { name: '房间数量', exact: true })
    await roomPanel.scrollIntoViewIfNeeded()
    panelViews.push({ roomBoundsAfterScroll: await roomPanel.boundingBox() })
    await expect(roomPanel.getByText('总房间', { exact: true })).toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: 'output/operations-dashboard.png', fullPage: true })

    const trackingSince = Date.UTC(2020, 0, 1)
    await db.transaction(async () => {
      await db.prepare('UPDATE game_opening_tracking SET tracking_since=? WHERE singleton').run(trackingSince)
      for (const [id, createdAt] of [
        ['opening-converted', now - 2 * 86_400_000],
        ['opening-start-only', now - 2 * 86_400_000],
        ['opening-not-converted', now - 2 * 86_400_000],
        ['opening-immature', now - 12 * 3_600_000],
      ] as const) {
        await db.prepare('INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES(?,?,?,?,?)')
          .run(id, id, id, 'unused-password', createdAt)
      }
      const insertFact = async (fact: {
        id: string; startedAt: number; playingAt: number | null;
        mode: 'solo' | 'hotseat' | 'multiplayer'; lifecycle: 'active' | 'completed' | 'terminated' | 'expired' | 'removed';
        seats: number; variants: string[]; accounts: string[];
      }) => {
        await db.prepare('INSERT INTO game_contexts(room_id,lifecycle,phase,created_at,updated_at) VALUES(?,?,NULL,?,?)')
          .run(fact.id, fact.lifecycle, fact.startedAt - 120_000, now)
        await db.prepare(`INSERT INTO game_opening_facts(room_id,started_at,playing_at,mode,seat_count,
          parent_cards,through_the_seasons,farmers_of_the_moor,snake_opening,moor_balance_rules,community_deck,origin)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,'live')`).run(fact.id, fact.startedAt, fact.playingAt, fact.mode, fact.seats,
          fact.variants.includes('parent_cards'), fact.variants.includes('through_the_seasons'),
          fact.variants.includes('farmers_of_the_moor'), fact.variants.includes('snake_opening'),
          fact.variants.includes('moor_balance_rules'), fact.variants.includes('community_deck'))
        for (const userId of fact.accounts) {
          await db.prepare('INSERT INTO game_opening_accounts(room_id,user_id) VALUES(?,?)').run(fact.id, userId)
        }
      }
      const recentFacts = [
        { id: 'recent-multiplayer', mode: 'multiplayer', lifecycle: 'active', seats: 2, variants: ['parent_cards', 'community_deck'], accounts: ['ops_visual_admin', 'opening-converted'] },
        { id: 'recent-hotseat', mode: 'hotseat', lifecycle: 'completed', seats: 4, variants: ['snake_opening'], accounts: ['ops_visual_admin'] },
        { id: 'recent-solo', mode: 'solo', lifecycle: 'terminated', seats: 1, variants: ['through_the_seasons'], accounts: ['ops_visual_admin'] },
        { id: 'recent-expired', mode: 'multiplayer', lifecycle: 'expired', seats: 3, variants: ['farmers_of_the_moor', 'moor_balance_rules'], accounts: ['opening-converted'] },
        { id: 'recent-removed', mode: 'hotseat', lifecycle: 'removed', seats: 2, variants: ['community_deck'], accounts: ['ops_visual_admin'] },
      ] satisfies Array<Omit<Parameters<typeof insertFact>[0], 'startedAt' | 'playingAt'>>
      for (const [index, fact] of recentFacts.entries()) {
        const startedAt = now - 600_000 + index * 60_000
        await insertFact({ ...fact, startedAt, playingAt: startedAt + 30_000 })
      }
      for (const [id, userId, playingAt] of [
        ['cohort-played', 'opening-converted', now - 47 * 3_600_000 + 60_000],
        ['cohort-started', 'opening-start-only', null],
      ] as const) {
        await insertFact({ id, startedAt: now - 47 * 3_600_000, playingAt, mode: 'multiplayer', lifecycle: 'active',
          seats: 2, variants: [], accounts: [userId] })
      }
      await db.prepare(`INSERT INTO app_instances(instance_id,internal_url,generation,status,room_capacity,lease_until,updated_at)
        VALUES('opening-browser','http://127.0.0.1:1','fixture','ready',30,?,?)`).run(now + 600_000, now)
      for (const stage of [
        { id: 'waiting', status: 'waiting', phase: 'playing', connected: 1, seats: 2, color: null, hotseat: false, ownerEpoch: 1, presenceEpoch: 1, development: false },
        { id: 'color', status: 'waiting', phase: 'playing', connected: 2, seats: 2, color: 1, hotseat: false, ownerEpoch: 1, presenceEpoch: 1, development: false },
        { id: 'parents', status: 'playing', phase: 'parent-selection', connected: 2, seats: 4, color: null, hotseat: true, ownerEpoch: 2, presenceEpoch: 1, development: false },
        { id: 'draft', status: 'playing', phase: 'draft', connected: 1, seats: 2, color: null, hotseat: false, ownerEpoch: 1, presenceEpoch: 1, development: false },
        { id: 'solo', status: 'playing', phase: 'solo-hand-selection', connected: 0, seats: 1, color: null, hotseat: false, ownerEpoch: 1, presenceEpoch: 1, development: false },
        { id: 'playing', status: 'playing', phase: 'playing', connected: 1, seats: 2, color: null, hotseat: false, ownerEpoch: 1, presenceEpoch: 1, development: false },
        { id: 'unknown', status: 'playing', phase: 'unrecognized', connected: 0, seats: 2, color: null, hotseat: false, ownerEpoch: 1, presenceEpoch: 1, development: false },
        { id: 'development', status: 'playing', phase: 'draft', connected: 1, seats: 2, color: null, hotseat: false, ownerEpoch: 1, presenceEpoch: 1, development: true },
      ]) {
        const id = 'opening-stage-' + stage.id
        await db.prepare('INSERT INTO game_contexts(room_id,lifecycle,phase,created_at,updated_at) VALUES(?,\'active\',?,?,?)')
          .run(id, stage.status, now - 720_000, now)
        await db.prepare(`INSERT INTO rooms(id,status,state_json,max_players,hotseat,color_confirmation_player_index,started_at,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?)`).run(id, stage.status, JSON.stringify({ state: { phase: stage.phase } }),
          stage.seats, stage.hotseat ? 1 : 0, stage.color, stage.status === 'playing' ? now - 600_000 : null, now - 720_000, now)
        await db.prepare(`INSERT INTO room_ownership(room_id,instance_id,epoch,lease_until,status,development)
          VALUES(?,'opening-browser',?,?,'active',?)`).run(id, stage.ownerEpoch, now + 600_000, stage.development)
        await db.prepare('INSERT INTO room_presence(room_id,epoch,connected_count,occupied_count) VALUES(?,?,?,?)')
          .run(id, stage.presenceEpoch, stage.connected, stage.seats)
      }
    })()
    accounts = createAccountsHandler({ pool, token: 'visual-scrape' })

    const queryPlayerSamples = async (expression: string, dimension = '') => {
      const response = await page.request.get(base + '/ops/api/datasources/proxy/uid/agricola-prometheus/api/v1/query', { params: { query: expression } })
      expect(response.ok(), await response.text()).toBe(true)
      const body: { status: string; error?: string; data: { result: Array<{ metric: Record<string, string>; value: [number, string] }> } } = await response.json()
      expect(body.status, body.error).toBe('success')
      return body.data.result.map(row => ({ label: row.metric[dimension] ?? '', value: Number(row.value[1]) }))
        .sort((left, right) => left.label.localeCompare(right.label))
    }
    const playerDashboardResponse = await page.request.get(base + '/ops/api/dashboards/uid/open-agricola-players')
    expect(playerDashboardResponse.ok()).toBe(true)
    const playerDashboard: { dashboard: { panels: Array<{ title: string; type: string; targets?: Array<{ expr: string }> }> } } = await playerDashboardResponse.json()
    const playerPanels = playerDashboard.dashboard.panels
    const panelExpectations: Array<{ title: string; dimension?: string; values: Record<string, number> }> = [
      { title: '永久开局记录启用时间', values: { '': trackingSince } },
      { title: '开局数据采集状态', values: { '': 1 } },
      { title: '确认开局数', values: { '': 5 } },
      { title: '去重开局账号数', values: { '': 2 } },
      { title: '开局模式分布', dimension: 'mode', values: { hotseat: 2, multiplayer: 2, solo: 1 } },
      { title: '当前在线局阶段', dimension: 'stage', values: { waiting: 1, color_confirmation: 1, parent_selection: 0, draft: 1, solo_hand_selection: 0, playing: 1, unknown: 0 } },
      { title: '离线保留局阶段', dimension: 'stage', values: { waiting: 0, color_confirmation: 0, parent_selection: 1, draft: 0, solo_hand_selection: 1, playing: 0, unknown: 1 } },
      { title: '已观察满24小时的新账号', values: { '': 3 } },
      { title: '24小时内开局转化率', values: { '': 2 / 3 } },
      { title: '24小时内正式游戏转化率', values: { '': 1 / 3 } },
      { title: '24小时内开局账号数', values: { '': 2 } },
      { title: '24小时内正式游戏账号数', values: { '': 1 } },
      { title: '等人开局耗时 p50 / p90', dimension: 'quantile', values: { '0.5': 120, '0.9': 120 } },
      { title: '等人开局耗时样本数', values: { '': 5 } },
      { title: '选牌准备耗时 p50 / p90', dimension: 'quantile', values: { '0.5': 30, '0.9': 30 } },
      { title: '选牌准备耗时样本数', values: { '': 5 } },
      { title: '开局批次当前结局', dimension: 'outcome', values: { active: 1, completed: 1, terminated: 1, expired: 1, removed: 1 } },
      { title: '开局批次当前完赛占比', values: { '': 0.2 } },
      { title: '开局座位数分布', dimension: 'seats', values: { '1': 1, '2': 2, '3': 1, '4': 1, '5': 0, '6': 0 } },
      { title: '开局扩展使用情况', dimension: 'variant', values: { parent_cards: 1, through_the_seasons: 1, farmers_of_the_moor: 1, snake_opening: 1, moor_balance_rules: 1, community_deck: 2 } },
      { title: '建房与入房系统错误', dimension: 'command', values: { createRoom: 0, joinRoom: 0, newGame: 0 } },
      { title: '建房与入房规则拒绝', dimension: 'command', values: { createRoom: 0, joinRoom: 0, newGame: 0 } },
    ]
    expect(playerPanels.filter(panel => panel.type !== 'row').map(panel => panel.title))
      .toEqual(panelExpectations.map(panel => panel.title))
    const expressionFor = (title: string) => {
      const expression = playerPanels.find(panel => panel.title === title)?.targets?.[0]?.expr
      if (!expression) throw new Error('Missing provisioned expression for ' + title)
      return expression.replaceAll('$window', 'last_24h').replaceAll('$cohort', 'last_7d').replaceAll('$__range', '300s')
    }
    for (const panel of panelExpectations) {
      const expected = Object.entries(panel.values).map(([label, value]) => ({ label, value }))
        .sort((left, right) => left.label.localeCompare(right.label))
      await expect.poll(() => queryPlayerSamples(expressionFor(panel.title), panel.dimension), {
        timeout: 30_000, message: 'Provisioned panel samples: ' + panel.title,
      }).toEqual(expected)
    }
    expect(await queryPlayerSamples('agricola_opening_games{window="last_7d",mode="all"}')).toEqual([{ label: '', value: 7 }])
    expect(await queryPlayerSamples('agricola_opening_accounts{window="last_7d",mode="all"}')).toEqual([{ label: '', value: 3 }])

    const playersUrl = base + '/ops/d/open-agricola-players/players?from=now-5m&to=now&refresh=15s&var-window=last_24h&var-cohort=last_7d'
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto(playersUrl)
      for (const group of playerPanels.filter(panel => panel.type === 'row')) {
        const title = page.getByText(group.title, { exact: true }).first()
        await title.scrollIntoViewIfNeeded()
        await expect(title).toBeInViewport()
      }
      for (const panel of panelExpectations) {
        const region = page.getByRole('region', { name: panel.title, exact: true })
        await region.scrollIntoViewIfNeeded()
        await expect(region.getByRole('heading', { name: panel.title, exact: true })).toBeVisible()
        await expect.poll(() => panelQueries.some(entry => entry.status === 200 && entry.executedExpressions.includes(expressionFor(panel.title))), {
          timeout: 30_000, message: 'Rendered panel executed its Grafana query: ' + panel.title,
        }).toBe(true)
        await expect(region.getByText(/^(?:No data|无数据|查询错误)$/)).toHaveCount(0)
      }
      for (const [title, value] of [['确认开局数', '5'], ['去重开局账号数', '2'], ['已观察满24小时的新账号', '3'],
        ['24小时内开局账号数', '2'], ['24小时内正式游戏账号数', '1'], ['等人开局耗时样本数', '5'], ['选牌准备耗时样本数', '5']] as const) {
        const region = page.getByRole('region', { name: title, exact: true })
        await region.scrollIntoViewIfNeeded()
        await expect(region.getByText(value, { exact: true })).toBeVisible({ timeout: 30_000 })
      }
      const firstStats = page.getByRole('region', { name: '确认开局数', exact: true })
      await firstStats.scrollIntoViewIfNeeded()
      panelViews.push({ dashboard: 'players', viewport, firstStats: await firstStats.boundingBox() })
      await page.getByText('统计覆盖与采集状态', { exact: true }).scrollIntoViewIfNeeded()
      const screenshot = viewport.width === 390 ? 'players-dashboard-mobile.png' : 'players-dashboard.png'
      await page.screenshot({ path: join('output', screenshot), fullPage: true })
      await testInfo.attach(screenshot, { path: join('output', screenshot), contentType: 'image/png' })
    }
    await Promise.all(panelCaptures)
    const playerQueries = panelQueries.filter(entry => entry.expressions.some(expression => /agricola_(opening_|commands_total)/.test(expression)))
    const browserExpressions = new Set(playerQueries.flatMap(entry => entry.executedExpressions))
    for (const panel of panelExpectations) {
      expect(browserExpressions, 'Browser executed provisioned panel: ' + panel.title).toContain(expressionFor(panel.title))
    }
    for (const entry of playerQueries) {
      expect(entry.status).toBe(200)
      if (entry.response && typeof entry.response === 'object' && 'results' in entry.response &&
          entry.response.results && typeof entry.response.results === 'object') {
        for (const result of Object.values(entry.response.results)) {
          if (result && typeof result === 'object' && 'error' in result) expect(result.error ?? '').toBe('')
        }
      }
    }

    await db.prepare('UPDATE game_opening_tracking SET tracking_since=? WHERE singleton').run(now - 12 * 3_600_000)
    accounts = createAccountsHandler({ pool, token: 'visual-scrape' })
    await expect.poll(() => queryPlayerSamples(expressionFor('已观察满24小时的新账号')), { timeout: 30_000 })
      .toEqual([{ label: '', value: 0 }])
    for (const title of ['24小时内开局转化率', '24小时内正式游戏转化率']) {
      expect(await queryPlayerSamples(expressionFor(title))).toEqual([])
    }
    await page.goto(playersUrl)
    for (const title of ['24小时内开局转化率', '24小时内正式游戏转化率']) {
      const region = page.getByRole('region', { name: title, exact: true })
      await region.scrollIntoViewIfNeeded()
      await expect(region.getByText('未知', { exact: true })).toBeVisible({ timeout: 30_000 })
    }
    await page.screenshot({ path: 'output/players-dashboard-empty-cohort.png', fullPage: true })
  } finally {
    page.off('response', capturePanel)
    await page.close()
    await Promise.allSettled(panelCaptures)
    writeFileSync(testInfo.outputPath('operations-panel-queries.json'), JSON.stringify(panelQueries, null, 2))
    writeFileSync(testInfo.outputPath('operations-panel-visibility.json'), JSON.stringify({ navigations, panelViews }, null, 2))
    for (const name of names.reverse()) {
      const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8' })
      const file = name.startsWith('oa-ops-grafana-') ? 'operations-grafana.log' : 'operations-prometheus.log'
      writeFileSync(join('output', file), logs.stdout + logs.stderr)
      writeFileSync(testInfo.outputPath(file), logs.stdout + logs.stderr)
      try { docker(['rm', '-f', name]) } catch { /* Already stopped. */ }
    }
    await Promise.all(servers.map(server => new Promise<void>(done => server.close(() => done()))))
    await pool.end()
    await db.close()
    rmSync(directory, { recursive: true, force: true })
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  }
})
