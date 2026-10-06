import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { parseEnv, promisify } from 'node:util'
const dependencies = parseEnv(readFileSync(resolve(process.env.SHARED_DATA_DIR ?? 'data', 'dependencies.local'), 'utf8'))
const backendHost = process.env.BACKEND_HOST ?? '127.0.0.1'
const backendPort = process.env.BACKEND_PORT ?? '5175'
const publicApiBase = process.env.PUBLIC_API_BASE ?? `http://${backendHost}:${backendPort}`
const data = resolve(process.env.SHARED_DATA_DIR ?? 'data', 'observability')
for (const dir of ['', 'prometheus', 'grafana']) mkdirSync(resolve(data, dir), { recursive: true })
writeFileSync(resolve(data, 'metrics-token'), dependencies.OBSERVABILITY_METRICS_TOKEN, { mode: 0o600 })
function config(target, exporter) {
  return `global:\n  scrape_interval: 15s\n  scrape_timeout: 5s\nscrape_configs:\n  - job_name: agricola-ingress\n    metrics_path: /internal/metrics\n    authorization:\n      credentials_file: /etc/prometheus/metrics-token\n    static_configs:\n      - targets: ['${target}']\n  - job_name: agricola-app\n    authorization:\n      credentials_file: /etc/prometheus/metrics-token\n    http_sd_configs:\n      - url: http://${target}/internal/metrics/targets\n        refresh_interval: 15s\n        authorization:\n          credentials_file: /etc/prometheus/metrics-token\n  - job_name: host\n    static_configs:\n      - targets: ['${exporter}']\n  - job_name: prometheus\n    static_configs:\n      - targets: ['localhost:9090']\n`
}
writeFileSync(resolve(data, 'prometheus.local.yml'), config(`${backendHost}:${backendPort}`, '127.0.0.1:19100').replace('localhost:9090', '127.0.0.1:19090'), { mode: 0o600 })
writeFileSync(resolve(data, 'prometheus.compose.yml'), config('app:5175', 'node-exporter:9100'), { mode: 0o600 })
async function hostNetworkingAvailable(env) {
  const body = 'open-agricola-host-network-probe'
  const probe = createServer((_req, res) => res.end(body))
  try {
    const compose = JSON.parse(execFileSync('docker', ['compose', '-f', 'operations/compose.local.yml', 'config', '--format', 'json'], { env, encoding: 'utf8' }))
    await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve) })
    const { stdout } = await promisify(execFile)('docker', ['run', '--rm', '--network', 'host', '--entrypoint', '/usr/bin/wget', compose.services.grafana.image,
      '-q', '-T', '3', '-O', '-', `http://127.0.0.1:${probe.address().port}/`], { env, timeout: 30_000 })
    return stdout.trim() === body
  } catch { return false }
  finally { await new Promise(resolve => probe.close(() => resolve())) }
}
if (!process.argv.includes('--prepare-only')) {
  const env = { ...process.env, PUBLIC_API_BASE: publicApiBase, OBSERVABILITY_DATA_DIR: data, OBSERVABILITY_UID: String(process.getuid()), OBSERVABILITY_GID: String(process.getgid()) }
  if (await hostNetworkingAvailable(env)) {
    execFileSync('docker', ['compose', '-f', 'operations/compose.local.yml', 'up', '-d', '--force-recreate'], { stdio: 'inherit', env })
  } else {
    console.warn('Local monitoring skipped: Docker could not complete the host-network loopback probe. On Docker Desktop, enable host networking (4.34+); retry once images are available. The application will still start.')
  }
}
