import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseEnv } from 'node:util'
const dependencies = parseEnv(readFileSync(resolve(process.env.SHARED_DATA_DIR ?? 'data', 'dependencies.local'), 'utf8'))
const data = resolve(process.env.SHARED_DATA_DIR ?? 'data', 'observability')
for (const dir of ['', 'prometheus', 'grafana']) mkdirSync(resolve(data, dir), { recursive: true })
writeFileSync(resolve(data, 'metrics-token'), dependencies.OBSERVABILITY_METRICS_TOKEN, { mode: 0o600 })
function config(target, exporter) {
  return `global:\n  scrape_interval: 15s\n  scrape_timeout: 5s\nscrape_configs:\n  - job_name: agricola-ingress\n    metrics_path: /internal/metrics\n    authorization:\n      credentials_file: /etc/prometheus/metrics-token\n    static_configs:\n      - targets: ['${target}']\n  - job_name: agricola-app\n    authorization:\n      credentials_file: /etc/prometheus/metrics-token\n    http_sd_configs:\n      - url: http://${target}/internal/metrics/targets\n        refresh_interval: 15s\n        authorization:\n          credentials_file: /etc/prometheus/metrics-token\n  - job_name: host\n    static_configs:\n      - targets: ['${exporter}']\n  - job_name: prometheus\n    static_configs:\n      - targets: ['localhost:9090']\n`
}
writeFileSync(resolve(data, 'prometheus.local.yml'), config(`127.0.0.1:${process.env.BACKEND_PORT ?? 5175}`, '127.0.0.1:19100').replace('localhost:9090', '127.0.0.1:19090'), { mode: 0o600 })
writeFileSync(resolve(data, 'prometheus.compose.yml'), config('app:5175', 'node-exporter:9100'), { mode: 0o600 })
if (!process.argv.includes('--prepare-only')) execFileSync('docker', ['compose', '-f', 'operations/compose.local.yml', 'up', '-d'], { stdio: 'inherit', env: { ...process.env, OBSERVABILITY_DATA_DIR: data, OBSERVABILITY_UID: String(process.getuid()), OBSERVABILITY_GID: String(process.getgid()) } })
