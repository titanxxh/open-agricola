import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import pg, { type Pool } from 'pg'

type Accounts = { total: number; today: number; last_24h: number; last_7d: number }

export function createAccountsPool(connectionString: string, schema = 'public') {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error('Invalid database schema')
  return new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 1000, statement_timeout: 2000,
    options: `-c search_path=${schema} -c default_transaction_read_only=on` })
}

export function createAccountsHandler({ pool, token, now = Date.now, buildId = 'development' }: {
  pool: Pick<Pool, 'query'>; token: string; now?: () => number; buildId?: string
}) {
  if (!token) throw new Error('OBSERVABILITY_METRICS_TOKEN is required')
  let attemptedAt = -Infinity
  let collectedAt = 0
  let accounts: Accounts | undefined
  let inflight: Promise<void> | undefined
  const collect = () => {
    if (inflight) return inflight
    if (now() - attemptedAt < 60_000) return Promise.resolve()
    attemptedAt = now()
    inflight = pool.query<Accounts>(`SELECT count(*)::integer AS total,
      count(*) FILTER (WHERE created_at >= extract(epoch FROM
        (date_trunc('day', to_timestamp($1 / 1000.0) AT TIME ZONE 'Asia/Singapore') AT TIME ZONE 'Asia/Singapore'))*1000)::integer AS today,
      count(*) FILTER (WHERE created_at >= $1-86400000)::integer AS last_24h,
      count(*) FILTER (WHERE created_at >= $1-604800000)::integer AS last_7d
      FROM users`, [attemptedAt]).then(result => {
      accounts = result.rows[0]
      collectedAt = now() / 1000
    }).catch(() => { accounts = undefined }).finally(() => { inflight = undefined })
    return inflight
  }
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store')
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
    const path = new URL(req.url ?? '/', 'http://localhost').pathname
    if (path === '/internal/metrics') {
      const actual = Buffer.from(req.headers.authorization ?? '')
      const expected = Buffer.from(`Bearer ${token}`)
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        res.writeHead(401); res.end(); return
      }
    } else if (path !== '/health') { res.writeHead(404); res.end(); return }
    await collect()
    if (path === '/health') {
      res.writeHead(accounts ? 200 : 503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: accounts ? 'ready' : 'unavailable', buildId, collectedAt }))
      return
    }
    const lines = [
      '# HELP agricola_accounts Current accounts and creation windows among accounts that still exist. Today uses Asia/Singapore.',
      '# TYPE agricola_accounts gauge',
      ...Object.entries(accounts ?? {}).map(([kind, value]) => `agricola_accounts{kind="${kind}"} ${value}`),
      '# HELP agricola_accounts_collection_success Whether the latest database collection succeeded.',
      '# TYPE agricola_accounts_collection_success gauge',
      `agricola_accounts_collection_success ${accounts ? 1 : 0}`,
      '# HELP agricola_accounts_last_success_unixtime Last successful database observation in Unix seconds.',
      '# TYPE agricola_accounts_last_success_unixtime gauge',
      `agricola_accounts_last_success_unixtime ${collectedAt}`,
    ]
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' })
    res.end(lines.join('\n') + '\n')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const pool = createAccountsPool(process.env.DATABASE_URL)
  pool.on('error', () => console.error(JSON.stringify({ event: 'accounts_database_connection_error' })))
  const handler = createAccountsHandler({ pool, token: process.env.OBSERVABILITY_METRICS_TOKEN ?? '', buildId: process.env.OPERATIONS_BUILD_ID })
  const server = createServer((req, res) => { void handler(req, res).catch(() => { res.writeHead(503); res.end() }) })
  server.listen(Number(process.env.ACCOUNTS_PORT ?? 9201), process.env.ACCOUNTS_HOST ?? '0.0.0.0')
  const stop = () => { server.close(() => { void pool.end() }) }
  process.once('SIGTERM', stop)
  process.once('SIGINT', stop)
}
