import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { parseEnv, promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import { prometheusConfig } from '../operations/prometheus.mjs'
const dependencies = parseEnv(readFileSync(resolve(process.env.SHARED_DATA_DIR ?? 'data', 'dependencies.local'), 'utf8'))
const backendHost = process.env.BACKEND_HOST ?? '127.0.0.1'
const backendPort = process.env.BACKEND_PORT ?? '5175'
const publicApiBase = process.env.PUBLIC_API_BASE ?? `http://${backendHost}:${backendPort}`
const data = resolve(process.env.SHARED_DATA_DIR ?? 'data', 'observability')
for (const dir of ['', 'prometheus', 'grafana']) mkdirSync(resolve(data, dir), { recursive: true })
writeFileSync(resolve(data, 'metrics-token'), dependencies.OBSERVABILITY_METRICS_TOKEN, { mode: 0o600 })
writeFileSync(resolve(data, 'prometheus.local.yml'), prometheusConfig({ app: `${backendHost}:${backendPort}`, host: '127.0.0.1:19100', accounts: '127.0.0.1:19201', self: '127.0.0.1:19090' }), { mode: 0o600 })
writeFileSync(resolve(data, 'prometheus.compose.yml'), prometheusConfig({ app: 'app:5175', host: 'node-exporter:9100', accounts: 'accounts-exporter:9201' }), { mode: 0o600 })
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
  const passwordFile = resolve(data, 'accounts-password')
  try { writeFileSync(passwordFile, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  const password = readFileSync(passwordFile, 'utf8').trim()
  const database = new URL(dependencies.DATABASE_URL)
  database.username = 'agricola_operations_accounts'
  database.password = password
  const env = { ...process.env, PUBLIC_API_BASE: publicApiBase, OBSERVABILITY_DATA_DIR: data, ACCOUNTS_DATABASE_URL: database.toString(), OBSERVABILITY_METRICS_TOKEN: dependencies.OBSERVABILITY_METRICS_TOKEN, OBSERVABILITY_UID: String(process.getuid()), OBSERVABILITY_GID: String(process.getgid()) }
  if (await hostNetworkingAvailable(env)) {
    const compose = (args, options = {}) => execFileSync('docker', ['compose', '-f', 'operations/compose.local.yml', ...args], { stdio: 'inherit', env, ...options })
    compose(['build', 'accounts-exporter'])
    compose(['run', '--rm', '--no-deps', '-T', 'accounts-exporter', 'node', 'provision.ts'], {
      input: JSON.stringify({ databaseUrl: dependencies.DATABASE_URL, password }), stdio: ['pipe', 'inherit', 'inherit'],
    })
    compose(['up', '-d', '--no-build', '--force-recreate'])
  } else {
    console.warn('Local monitoring skipped: Docker could not complete the host-network loopback probe. On Docker Desktop, enable host networking (4.34+); retry once images are available. The application will still start.')
  }
}
