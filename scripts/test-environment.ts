import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { PostgresDatabase } from '../server/database/postgres'
import { S3ObjectStore } from '../server/storage/s3-store'
import { getTestDatabaseUrl } from '../server/__tests__/_helpers/postgres'
import { testStorageEnvironment } from '../server/__tests__/_helpers/objects'
import { allocateTestPort } from './test-ports'

const [operation, root] = process.argv.slice(2)
if (!root || !['create', 'cleanup'].includes(operation)) throw new Error('Usage: test-environment.ts create|cleanup <private-test-directory>')
const envPath = join(root, 'test.env')
if (operation === 'create') {
  const requestedPort = (name: string, span = 1) => {
    const value = process.env[name]
    if (value === undefined || value === '') return undefined
    const port = Number(value)
    if (!/^\d+$/.test(value) || !Number.isInteger(port) || port < 1024 || port + span - 1 > 65535) {
      throw new Error(`${name} must be an unprivileged TCP port${span === 2 ? ' with a second consecutive port' : ''}`)
    }
    return port
  }
  const requestedBackend = requestedPort('BACKEND_PORT')
  const requestedFrontend = requestedPort('FRONTEND_PORT')
  const requestedAppBase = requestedPort('APP_BASE_PORT', 2)
  const taken = [requestedBackend, requestedFrontend, requestedAppBase,
    requestedAppBase === undefined ? undefined : requestedAppBase + 1].filter(port => port !== undefined)
  if (new Set(taken).size !== taken.length) throw new Error('Test frontend, backend and app instance ports must not overlap')
  const backend = requestedBackend ?? await allocateTestPort({ taken })
  taken.push(backend)
  const frontend = requestedFrontend ?? await allocateTestPort({ taken })
  taken.push(frontend)
  // Parent runners reserve disjoint lane ports; ordinary verify allocates its own.
  const appBase = requestedAppBase ?? await allocateTestPort({ span: 2, taken })
  const schema = `test_${randomUUID().replaceAll('-', '')}`
  const url = getTestDatabaseUrl()
  const db = new PostgresDatabase({ connectionString: url })
  try { await db.exec(`CREATE SCHEMA "${schema}"`) } finally { await db.close() }
  const base = `http://127.0.0.1:${backend}`, client = `http://127.0.0.1:${frontend}`
  const values: Record<string, string | undefined> = { ...testStorageEnvironment(),
    DATABASE_URL: url, DATABASE_SCHEMA: schema, S3_PREFIX: `test/e2e-${randomUUID()}/`,
    LOCAL_ENV_FILE: envPath, SHARED_DATA_DIR: root, REPLAY_VIEWER_ROOT: join(root, 'replay-viewers'),
    BACKEND_PORT: String(backend), FRONTEND_PORT: String(frontend), APP_BASE_PORT: String(appBase),
    // The launcher then stops only the processes it started for this environment.
    OWNED_PROCESSES_FILE: join(root, 'owned-processes'),
    BACKEND_LOG: join(root, 'backend.log'), FRONTEND_LOG: join(root, 'frontend.log'),
    OBSERVABILITY_ENABLED: 'false', NODE_ENV: 'test', ACCOUNT_REGISTRATION_POLICY: 'open', ALLOW_ANONYMOUS_WS: 'true',
    ENABLE_AUTH_TEST_HELPERS: '1', DISABLE_RATE_LIMIT: '1', WORKSHOP_PR_MOCK_MODE: 'true',
    PUBLIC_API_BASE: base, PUBLIC_APP_ORIGIN: client, CORS_ORIGIN: client,
    FRONTEND_URL: client, BACKEND_URL: base, VITE_API_BASE: base, VITE_WS_BASE: `ws://127.0.0.1:${backend}/ws`,
    VITE_SANDBOX_EXECUTOR: process.env.VITE_SANDBOX_EXECUTOR || 'server',
  }
  await writeFile(envPath, Object.entries(values).map(([key, value]) => `${key}='${(value ?? '').replaceAll("'", "'\\''")}'`).join('\n') + '\n', { mode: 0o600 })
} else {
  const env = parseEnv(await readFile(envPath, 'utf8'))
  if (!/^test_[a-f0-9]{32}$/.test(env.DATABASE_SCHEMA ?? '') || !env.S3_PREFIX?.startsWith('test/e2e-')) throw new Error('Refusing to clean a non-test namespace')
  const db = new PostgresDatabase({ connectionString: env.DATABASE_URL })
  const objects = S3ObjectStore.fromEnv(env)
  try { await objects.clearPrefix(); await db.exec(`DROP SCHEMA "${env.DATABASE_SCHEMA}" CASCADE`) }
  finally { objects.close(); await db.close() }
}
