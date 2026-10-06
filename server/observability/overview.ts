type PromResponse = { status: string; data?: { result?: { value: [number, string] }[] } }
export type HealthLevel = 'normal' | 'degraded' | 'unavailable' | 'unknown'
const RUNTIME = '(agricola_collector_status{source="runtime"} == 1) and on(job,instance,source) (time()-agricola_collector_last_success_unixtime{source="runtime"}<120)'
const queries = {
  runtimeFresh: `count(${RUNTIME})`,
  directoryInstances: 'agricola_platform{role="ingress",kind="instances_ready"}',

  versions: 'agricola_platform{role="ingress",kind="versions_ready"}',
  s3Fresh: 'max(agricola_collector_last_success_unixtime{source="s3"})',
  blockedRooms: 'sum(agricola_platform{role="app",kind="blocked_rooms"})',
  gameReady: `sum(agricola_platform{role="app",kind="game_ready"} and on(job,instance) (${RUNTIME}))`,
  dbErrors: 'sum(increase(agricola_db_errors_total{reason=~"timeout|deadlock|unavailable|connection_limit"}[5m]))',
  s3Errors: 'sum(increase(agricola_operation_duration_seconds_count{stage=~"s3_.*",outcome="error"}[5m]))',
  backupAge: 'time()-agricola_platform{role="ingress",kind="backup_validated_unixtime"}',
  taskAge: 'agricola_platform{role="ingress",kind="reports_oldest_age_seconds"}',
  instances: 'sum(up{job="agricola-app"})',
  onlineUsers: 'agricola_platform{role="ingress",kind="online_users"}',
  playingRooms: 'agricola_platform{role="ingress",kind="rooms_playing"}',
  commandP95: 'histogram_quantile(0.95,sum by(le)(rate(agricola_command_duration_seconds_bucket[5m]))) and (sum(increase(agricola_command_duration_seconds_count[5m]))>=20)',
  errorRate: 'sum(rate(agricola_commands_total{outcome="error"}[5m])) / sum(rate(agricola_commands_total[5m]))',
}
/** Missing or stale observations are unknown, never synthesized as healthy zeroes. */
export async function overview() {
  const now = Date.now()
  const values: Record<string, number | null> = {}
  let lastSample: number | null = null
  const url = process.env.PROMETHEUS_URL
  const results = await Promise.allSettled(Object.entries(queries).map(async ([key, query]) => {
    if (!url) throw new Error('Prometheus not configured')
    const response = await fetch(new URL(`/api/v1/query?query=${encodeURIComponent(query)}`, url), { signal: AbortSignal.timeout(2000) })
    if (!response.ok) throw new Error('Prometheus unavailable')
    const body = await response.json() as PromResponse
    const sample = body.status === 'success' ? body.data?.result?.[0]?.value : undefined
    return { key, value: sample && Number.isFinite(Number(sample[1])) ? Number(sample[1]) : null, time: sample ? Number(sample[0]) * 1000 : null }
  }))
  let failed = false
  for (const [index, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      values[result.value.key] = result.value.value
      if (result.value.time !== null) lastSample = Math.min(lastSample ?? now, result.value.time)
    } else { failed = true; values[Object.keys(queries)[index]!] = null }
  }
  // Instant query timestamps reflect evaluation time; source freshness is checked separately.
  let fresh = false
  if (url && !failed) {
    try {
      const response = await fetch(new URL('/api/v1/query?query=' + encodeURIComponent('agricola_collector_last_success_unixtime{source="global"} and on(job,instance,source) (agricola_collector_status{source="global"}==1)'), url), { signal: AbortSignal.timeout(2000) })
      const body = await response.json() as PromResponse
      const sample = body.data?.result?.[0]?.value
      lastSample = sample && Number.isFinite(Number(sample[1])) ? Number(sample[1]) * 1000 : null
      fresh = lastSample !== null && now - lastSample < 120_000
    } catch { failed = true }
  }
  const expected = Number(process.env.APP_INSTANCES ?? 1)
  const unavailable = fresh && (values.instances === 0 || values.directoryInstances === 0)
  const complete = fresh && values.instances !== null && values.gameReady !== null && values.onlineUsers !== null
    && values.runtimeFresh !== null && values.runtimeFresh >= (values.directoryInstances ?? expected)
  const anomalies = {
    instances: values.instances !== null && values.instances < expected,
    readiness: values.gameReady !== null && values.gameReady < expected,
    blocked: (values.blockedRooms ?? 0) > 0,
    latency: (values.commandP95 ?? 0) > 1,
    errors: (values.errorRate ?? 0) > .02,
    database: (values.dbErrors ?? 0) > 0,
    storage: (values.s3Errors ?? 0) > 0,
    backup: (values.backupAge ?? 0) > 172800,
    tasks: (values.taskAge ?? 0) > 900,
    versions: (values.versions ?? 0) > 1,
  }
  const reasons = fresh ? Object.entries(anomalies).filter(([, active]) => active).map(([reason]) => reason) : []
  const level: HealthLevel = failed || !fresh ? 'unknown' : unavailable ? 'unavailable'
    : !complete ? 'unknown' : reasons.length ? 'degraded' : 'normal'
  if (level === 'unknown') reasons.unshift('freshness')
  const components = {
    database: fresh ? anomalies.database ? 'degraded' : 'normal' : 'unknown',
    storage: fresh && anomalies.storage ? 'degraded' : values.s3Fresh !== null && now / 1000 - values.s3Fresh < 120 ? 'normal' : 'unknown',
    backup: fresh && values.backupAge !== null ? anomalies.backup ? 'degraded' : 'normal' : 'unknown',
  }
  return { level, reasons, components, values: complete || unavailable ? values : Object.fromEntries(Object.keys(values).map(key => [key, null])), lastSample, retentionDays: 7, refreshSeconds: 15 }
}
