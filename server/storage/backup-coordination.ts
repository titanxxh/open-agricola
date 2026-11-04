import { Client } from 'pg'
import type { PostgresDatabase } from '../database/postgres'

export const RESOURCE_DELETION_PROTOCOL = 1
const captureKey = "hashtextextended('open-agricola:resource-capture:' || current_schema(), 0)"

export type CapturedResource = {
  object_key: string
  sha256: string
  size_bytes: number
  content_type: string
  state: 'ready' | 'staging'
}

/** Call before resource row locks, in each of the collector's two transactions. */
export async function tryResourceDeletion(db: PostgresDatabase): Promise<boolean> {
  db.assertInTransaction()
  return (await db.prepare(`SELECT pg_try_advisory_xact_lock_shared(${captureKey}) AS acquired`)
    .get<{ acquired: boolean }>())!.acquired
}

export async function withResourceCapture<T>(
  source: { connectionString: string; schema: string; buildId: string; deadlineEpochMs: number; signal: AbortSignal },
  capture: (view: { snapshotId: string; resources: CapturedResource[] }, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  if (!/^[a-z_][a-z0-9_]*$/.test(source.schema)) throw new Error('Invalid capture schema')
  const failed = new AbortController()
  const signal = AbortSignal.any([source.signal, failed.signal])
  const remaining = () => {
    signal.throwIfAborted()
    const milliseconds = Math.floor(source.deadlineEpochMs - Date.now())
    if (milliseconds <= 0 || milliseconds > 30 * 60 * 1000) throw new Error('Invalid or expired backup deadline')
    return milliseconds
  }
  const clients: Client[] = []
  let cancelCapture: ((reason: unknown) => void) | undefined
  const stop = () => {
    cancelCapture?.(signal.reason)
    for (const client of clients) void client.end().catch(() => {})
  }
  signal.addEventListener('abort', stop, { once: true })
  const connect = async () => {
    remaining()
    const client = new Client({ connectionString: source.connectionString, connectionTimeoutMillis: 10_000,
      application_name: `agricola-capture-${source.schema}`,
      statement_timeout: 0, options: `-c search_path=${source.schema},public -c statement_timeout=0` })
    clients.push(client)
    client.on('error', error => failed.abort(error))
    await client.connect()
    signal.throwIfAborted()
    return client
  }
  try {
    const protection = await connect()
    await protection.query('BEGIN')
    await protection.query(`SET LOCAL transaction_timeout = '${remaining()}ms'`)
    await protection.query(`SET LOCAL lock_timeout = '${Math.min(60_000, remaining())}ms'`)
    await protection.query(`SELECT pg_advisory_xact_lock(${captureKey})`)
    signal.throwIfAborted()

    const snapshot = await connect()
    await snapshot.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    await snapshot.query(`SET LOCAL transaction_timeout = '${remaining()}ms'`)
    const incompatible = await snapshot.query(`SELECT 1 FROM app_instances
      WHERE status != 'stopped' AND lease_until > (extract(epoch FROM clock_timestamp()) * 1000)::bigint
        AND generation != $1 LIMIT 1`, [source.buildId])
    if (incompatible.rowCount) throw new Error('Online backup requires one supported application generation')
    const { rows: [view] } = await snapshot.query<{ snapshot_id: string }>('SELECT pg_export_snapshot() AS snapshot_id')
    if (!view) throw new Error('Database snapshot was not exported')
    const { rows } = await snapshot.query<Omit<CapturedResource, 'size_bytes'> & { size_bytes: string }>(
      `SELECT object_key, content_hash AS sha256, size_bytes::text, content_type, state
       FROM stored_objects WHERE NOT blocked AND state IN ('ready','staging') ORDER BY object_key`)
    const resources = rows.map(row => {
      const size = Number(row.size_bytes)
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid resource size')
      return { ...row, size_bytes: size }
    })
    const result = await new Promise<T>((resolve, reject) => {
      cancelCapture = reject
      if (signal.aborted) reject(signal.reason)
      else void capture({ snapshotId: view.snapshot_id, resources }, signal).then(resolve, reject)
    })
    signal.throwIfAborted()
    await snapshot.query('COMMIT')
    await protection.query('COMMIT')
    return result
  } finally {
    signal.removeEventListener('abort', stop)
    await Promise.allSettled(clients.map(client => client.end()))
  }
}
