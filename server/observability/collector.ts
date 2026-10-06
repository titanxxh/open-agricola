import { performance } from 'node:perf_hooks'
import { readFile } from 'node:fs/promises'
import type { PostgresDatabase } from '../database/postgres'
import { operationsMetrics as metrics } from './metrics'
import { workerObservation } from '../game/custom-session-executor'

type Runtime = { users: string[]; values: Record<string, number> }
/** Scrapes share one bounded observation; collectors never traverse game snapshots. */
export function createCollector(db: PostgresDatabase, role: 'app' | 'ingress', runtime?: () => Runtime | undefined, instanceId?: () => string | undefined, ready?: () => Promise<boolean>, observationDb = db) {
  metrics.initialize(role)
  let elu = performance.eventLoopUtilization()
  let last = 0
  let inflight: Promise<void> | undefined
  return async (): Promise<void> => {
    const observation = runtime?.()
    const utilization = performance.eventLoopUtilization(elu)
    elu = performance.eventLoopUtilization()
    metrics.data.set({ kind: 'event_loop_utilization' }, utilization.utilization)
    for (const [kind, value] of Object.entries({ ...db.observation(), ...observation?.values, ...(role === 'app' ? workerObservation() : {}) })) metrics.data.set({ kind }, value)
    if (inflight) return inflight
    if (Date.now() - last < 60_000) return
    last = Date.now()
    inflight = (async () => {
      const now = Date.now()
      if (role === 'app') {
        if (ready) metrics.data.set({ kind: 'game_ready' }, await ready() ? 1 : 0)
        const id = instanceId?.()
        if (id && observation) {
          await observationDb.transaction(async () => {
            await observationDb.prepare('DELETE FROM observability_presence WHERE instance_id=? OR expires_at<=?').run(id, now)
            await observationDb.query(`INSERT INTO observability_presence(instance_id,user_id,expires_at)
              SELECT $1, id, $3 FROM users WHERE id=ANY($2::text[])`, [id, observation.users, now + 120_000])
          })()
        }
        for (const [kind, file, field] of [
          ['container_cpu_limit_cores', 'cpu.max', 'cpu'], ['container_memory_limit_bytes', 'memory.max', 'limit'],
          ['container_memory_bytes', 'memory.current', 'limit'], ['container_cpu_throttled_seconds', 'cpu.stat', 'throttled_usec'],
          ['container_io_read_bytes', 'io.stat', 'rbytes'], ['container_io_write_bytes', 'io.stat', 'wbytes'],
        ]) {
          try {
            const text = await readFile(`/sys/fs/cgroup/${file}`, 'utf8')
            const value = field === 'cpu' ? (text.startsWith('max') ? NaN : Number(text.split(' ')[0]) / Number(text.split(' ')[1]))
              : field === 'limit' ? Number(text.trim())
              : field === 'throttled_usec' ? Number(/throttled_usec (\d+)/.exec(text)?.[1]) / 1e6
              : [...text.matchAll(new RegExp(`${field}=(\\d+)`, 'g'))].reduce((sum, match) => sum + Number(match[1]), 0)
            if (Number.isFinite(value)) metrics.data.set({ kind }, value)
          } catch { /* Not all deployments expose cgroups; absence remains unknown. */ }
        }
      } else {
        const rows = await observationDb.query<{ kind: string; value: string }>(`
          SELECT 'online_users' AS kind, count(DISTINCT p.user_id)::text AS value FROM observability_presence p JOIN app_instances i USING(instance_id) WHERE p.expires_at>$1 AND i.lease_until>$1 AND i.status='ready'
          UNION ALL SELECT 'instances_ready',count(*)::text FROM app_instances WHERE status='ready' AND lease_until>$1
          UNION ALL SELECT 'versions_ready',count(DISTINCT generation)::text FROM app_instances WHERE status='ready' AND lease_until>$1
          UNION ALL SELECT 'room_capacity',coalesce(sum(room_capacity),0)::text FROM app_instances WHERE status='ready' AND lease_until>$1
          UNION ALL SELECT 'rooms_'||r.status,count(*)::text FROM rooms r JOIN room_ownership o ON o.room_id=r.id WHERE o.status='active' AND o.lease_until>$1 AND NOT o.development AND r.hotseat=0 GROUP BY r.status
          UNION ALL SELECT 'rooms_hotseat',count(*)::text FROM rooms WHERE hotseat=1
          UNION ALL SELECT 'rooms_development',count(*)::text FROM room_ownership WHERE development AND status='active' AND lease_until>$1
          UNION ALL SELECT 'players_connected',coalesce(sum(p.connected_count),0)::text FROM room_presence p JOIN room_ownership o USING(room_id) WHERE p.epoch=o.epoch AND o.status='active' AND o.lease_until>$1
          UNION ALL SELECT 'games_completed_7d',count(*)::text FROM game_results WHERE finished_at>$1-604800000
          UNION ALL SELECT 'games_completed_24h',count(*)::text FROM game_results WHERE finished_at>$1-86400000
          UNION ALL SELECT 'reports_backlog',count(*)::text FROM bug_reports WHERE status IN ('queued','retry','reconcile')
          UNION ALL SELECT 'reports_oldest_age_seconds',coalesce(($1-min(created_at))/1000,0)::text FROM bug_reports WHERE status IN ('queued','retry','reconcile')
          UNION ALL SELECT 'deletions_backlog',count(*)::text FROM account_deletion_requests
          UNION ALL SELECT 'revocations_backlog',count(*)::text FROM github_grant_revocations
          UNION ALL SELECT 'objects_stored_bytes',coalesce(sum(size_bytes),0)::text FROM stored_objects WHERE state='ready'
          UNION ALL SELECT 'objects_staging',count(*)::text FROM stored_objects WHERE state IN ('staging','deleting')
          UNION ALL SELECT 'pg_database_bytes',pg_database_size(current_database())::text
          UNION ALL SELECT 'pg_connections',count(*)::text FROM pg_stat_activity WHERE datname=current_database()
          UNION ALL SELECT 'pg_long_transactions',count(*)::text FROM pg_stat_activity WHERE datname=current_database() AND xact_start<now()-interval '30 seconds'
          UNION ALL SELECT 'pg_waiting_locks',count(*)::text FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'
          UNION ALL SELECT 'pg_wal_bytes',wal_bytes::text FROM pg_stat_wal
          UNION ALL SELECT 'pg_deadlocks',deadlocks::text FROM pg_stat_database WHERE datname=current_database()
        `, [now])
        // Explicit zeroes only for a successful query with an empty known category.
        for (const kind of ['rooms_waiting', 'rooms_playing']) metrics.data.set({ kind }, 0)
        for (const row of rows.rows) if (Number.isFinite(Number(row.value))) metrics.data.set({ kind: row.kind }, Number(row.value))
      }
      const backupPath = process.env.OBSERVABILITY_BACKUP_MANIFEST
      if (role === 'ingress' && backupPath) {
        try {
          const report = JSON.parse(await readFile(backupPath, 'utf8')) as { validatedAt?: string }
          const validated = Date.parse(report.validatedAt ?? '') / 1000
          if (!Number.isFinite(validated)) throw new Error('Invalid backup time')
          metrics.data.set({ kind: 'backup_validated_unixtime' }, validated)
          metrics.collectorSuccess.set({ source: 'backup' }, now / 1000)
        } catch { metrics.data.remove({ kind: 'backup_validated_unixtime' }); metrics.collectorErrors.inc({ source: 'backup' }) }
      }
      metrics.collectorSuccess.set({ source: role === 'ingress' ? 'global' : 'runtime' }, now / 1000)
    })().catch(() => metrics.collectorErrors.inc({ source: role === 'ingress' ? 'global' : 'runtime' })).finally(() => { inflight = undefined })
    return inflight
  }
}
