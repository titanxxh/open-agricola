import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { randomBytes } from 'node:crypto'
import { prometheusConfig } from './prometheus.mjs'

const [rootArgument, gameArgument, buildId] = process.argv.slice(2)
if (!rootArgument || !gameArgument || !/^[a-f0-9]{40}$/.test(buildId ?? '')) throw new Error('Expected operations directory, game directory and commit SHA')
const root = resolve(rootArgument)
const game = resolve(gameArgument)
const release = dirname(import.meta.dirname)
const config = join(release, 'config')
mkdirSync(config, { recursive: true, mode: 0o700 })
const readEnv = path => parseEnv(readFileSync(path, 'utf8'))
const dependencies = readEnv(join(game, 'data/dependencies.compose.env'))
const settings = readEnv(join(game, '.env'))
if (!dependencies.DATABASE_URL || !dependencies.OBSERVABILITY_METRICS_TOKEN || !settings.PUBLIC_API_BASE) throw new Error('Existing game dependency configuration is required')
const passwordFile = join(root, 'accounts-password')
if (!existsSync(passwordFile)) writeFileSync(passwordFile, randomBytes(32).toString('hex'), { mode: 0o600 })
const password = readFileSync(passwordFile, 'utf8').trim()
const database = new URL(dependencies.DATABASE_URL)
database.username = 'agricola_operations_accounts'
database.password = password
const values = {
  OPERATIONS_BUILD_ID: buildId,
  OPERATIONS_CONFIG_DIR: config,
  OBSERVABILITY_DATA_DIR: join(game, 'data/observability'),
  OBSERVABILITY_UID: String(process.getuid()), OBSERVABILITY_GID: String(process.getgid()),
  ACCOUNTS_DATABASE_URL: database.toString(),
  OBSERVABILITY_METRICS_TOKEN: dependencies.OBSERVABILITY_METRICS_TOKEN,
  PUBLIC_API_BASE: settings.PUBLIC_API_BASE.replace(/\/+$/, ''),
}
const envFile = join(config, 'runtime.env')
writeFileSync(envFile, Object.entries(values).map(([key, value]) => `${key}='${value.replaceAll("'", "'\\''")}'`).join('\n') + '\n', { mode: 0o600 })
writeFileSync(join(config, 'metrics-token'), dependencies.OBSERVABILITY_METRICS_TOKEN, { mode: 0o600 })
writeFileSync(join(config, 'prometheus.yml'), prometheusConfig({ app: 'app:5175', host: 'node-exporter:9100', accounts: 'accounts-exporter:9201' }), { mode: 0o600 })
for (const folder of ['prometheus', 'grafana']) mkdirSync(join(values.OBSERVABILITY_DATA_DIR, folder), { recursive: true })
const docker = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', ...options })
const compose = (directory, args, options = {}) => docker(['compose', '--project-name', 'open-agricola-operations', '--env-file', join(directory, 'config/runtime.env'), '-f', join(directory, 'operations/compose.prod.yml'), ...args], { stdio: 'inherit', ...options })
const ids = service => docker(['ps', '-aq', '--filter', 'label=com.docker.compose.project=open-agricola', '--filter', `label=com.docker.compose.service=${service}`]).trim().split('\n').filter(Boolean)
const appIds = ids('app')
if (!appIds.length) throw new Error('No existing game application container found')
const appState = () => docker(['inspect', '--format', '{{.Id}} {{.Image}} {{.State.StartedAt}}', ...appIds]).trim()
const before = appState()
const marker = join(root, 'deployed-build-id')
const previous = existsSync(marker) ? readFileSync(marker, 'utf8').trim() : undefined
const legacy = ['prometheus', 'grafana', 'node-exporter'].flatMap(ids)
compose(release, ['build', 'accounts-exporter'])
compose(release, ['run', '--rm', '--no-deps', '-T', 'accounts-exporter', 'node', 'provision.ts'], {
  input: JSON.stringify({ databaseUrl: dependencies.DATABASE_URL, password }), stdio: ['pipe', 'inherit', 'inherit'],
})
try {
  if (legacy.length) docker(['stop', ...legacy], { stdio: 'inherit' })
  compose(release, ['up', '-d', '--remove-orphans', '--no-build', '--wait', '--wait-timeout', '120'])
  let ready = false
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      compose(release, ['exec', '-T', 'grafana', 'wget', '-q', '-O', '-', 'http://127.0.0.1:3000/api/health'], { stdio: 'pipe' })
      compose(release, ['exec', '-T', 'grafana', 'wget', '-q', '-O', '-', 'http://prometheus:9090/-/ready'], { stdio: 'pipe' })
      ready = true; break
    } catch { await new Promise(done => setTimeout(done, 500)) }
  }
  if (!ready) throw new Error('Grafana or Prometheus is not ready')
  if (appState() !== before) throw new Error('Game application container changed during operations deployment')
  writeFileSync(marker, buildId + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ operationsBuildId: buildId, gameContainersUnchanged: true }))
} catch (error) {
  console.error('Operations deployment failed; restoring monitoring containers while retaining aggregate-only database access')
  try {
    if (previous && previous !== buildId) compose(join(root, 'releases', previous), ['up', '-d', '--remove-orphans', '--no-build', '--wait', '--wait-timeout', '120'])
    else if (!previous) {
      compose(release, ['down'])
      if (legacy.length) docker(['start', ...legacy], { stdio: 'inherit' })
    }
  } catch {
    console.error('Monitoring recovery failed; deploy an operations release that supports the aggregate database functions')
  }
  throw error
}
