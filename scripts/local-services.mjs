import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { Pool } from 'pg'
import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3'

// Worktrees share dependencies and data with their main checkout. Tests get a
// separate database; never derive a test connection from an external app URL.
const commonDir = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim()
const dataDir = process.env.SHARED_DATA_DIR ?? join(dirname(commonDir), 'data')
const servicesDir = process.env.LOCAL_SERVICES_DIR ?? join(dirname(commonDir), 'data')
mkdirSync(dataDir, { recursive: true })
mkdirSync(servicesDir, { recursive: true })
const credentialsFile = join(servicesDir, 'local-services.env')
if (!existsSync(credentialsFile)) {
  writeFileSync(credentialsFile, `LOCAL_POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\nLOCAL_POSTGRES_PORT=${process.env.LOCAL_POSTGRES_PORT ?? '55432'}\n`, { mode: 0o600 })
}
const config = parseEnv(readFileSync(credentialsFile, 'utf8'))
const generated = {
  OBSERVABILITY_METRICS_TOKEN: () => randomBytes(32).toString('hex'),
  WORKSHOP_TOKEN_ENCRYPTION_KEY: () => randomBytes(32).toString('base64'),
  LOCAL_S3_ACCESS_KEY: () => randomBytes(16).toString('hex'),
  LOCAL_S3_SECRET_KEY: () => randomBytes(32).toString('hex'),
  LOCAL_S3_PORT: () => process.env.LOCAL_S3_PORT ?? '59000',
}
let changed = false
for (const [key, generate] of Object.entries(generated)) {
  if (!config[key]) { config[key] = generate(); changed = true }
}
if (changed) writeFileSync(credentialsFile, Object.entries(config).map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 })
const localUrl = `postgresql://agricola:${encodeURIComponent(config.LOCAL_POSTGRES_PASSWORD)}@127.0.0.1:${config.LOCAL_POSTGRES_PORT}/agricola`
const testOnly = process.argv.includes('--test')
if (process.env.S3_ENDPOINT && !testOnly) {
  for (const key of ['S3_BUCKET', 'S3_REGION', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
    if (!process.env[key]) throw new Error(`External object storage requires ${key}`)
  }
}

if (!process.env.DATABASE_URL || testOnly) {
  execFileSync('docker', ['compose', '--env-file', credentialsFile, '-f', resolve('docker-compose.local.yml'), 'up', '-d', '--wait', 'postgres'], { stdio: 'inherit' })
  const pool = new Pool({ connectionString: localUrl })
  try {
    const client = await pool.connect()
    try {
      await client.query('SELECT pg_advisory_lock(962)')
      const result = await client.query("SELECT 1 FROM pg_database WHERE datname = 'agricola_test'")
      if (!result.rowCount) await client.query('CREATE DATABASE agricola_test')
    } finally {
      await client.query('SELECT pg_advisory_unlock(962)')
      client.release()
    }
  } finally {
    await pool.end()
  }
}
const localS3Endpoint = `http://127.0.0.1:${config.LOCAL_S3_PORT}`
if (!process.env.S3_ENDPOINT || testOnly) {
  execFileSync('docker', ['compose', '--env-file', credentialsFile, '-f', resolve('docker-compose.local.yml'), 'up', '-d', 'objects'], { stdio: 'inherit' })
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await fetch(`${localS3Endpoint}/health`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break } } catch { /* booting */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  if (!ready) throw new Error('Local S3 service did not become ready')
  const client = new S3Client({ endpoint: localS3Endpoint, region: 'us-east-1', forcePathStyle: true,
    credentials: { accessKeyId: config.LOCAL_S3_ACCESS_KEY, secretAccessKey: config.LOCAL_S3_SECRET_KEY } })
  try {
    for (const bucket of ['agricola', 'agricola-test']) {
      try { await client.send(new HeadBucketCommand({ Bucket: bucket })) } catch (error) {
        if (error.$metadata?.httpStatusCode !== 404) throw error
        try { await client.send(new CreateBucketCommand({ Bucket: bucket })) } catch (error) {
          if (error.name !== 'BucketAlreadyOwnedByYou') throw error
        }
      }
    }
  } finally { client.destroy() }
}
const values = {
  OBSERVABILITY_METRICS_TOKEN: config.OBSERVABILITY_METRICS_TOKEN,
  PROMETHEUS_URL: 'http://127.0.0.1:19090',
  GRAFANA_URL: 'http://127.0.0.1:13000',
  S3_ENDPOINT: process.env.S3_ENDPOINT || localS3Endpoint,
  S3_BUCKET: process.env.S3_BUCKET || 'agricola',
  S3_PREFIX: process.env.S3_PREFIX ?? '',
  S3_REGION: process.env.S3_REGION || 'us-east-1',
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || config.LOCAL_S3_ACCESS_KEY,
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || config.LOCAL_S3_SECRET_KEY,
  S3_FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE || 'true',
  TEST_S3_ENDPOINT: localS3Endpoint,
  TEST_S3_BUCKET: 'agricola-test',
  TEST_S3_REGION: 'us-east-1',
  TEST_S3_ACCESS_KEY_ID: config.LOCAL_S3_ACCESS_KEY,
  TEST_S3_SECRET_ACCESS_KEY: config.LOCAL_S3_SECRET_KEY,
  WORKSHOP_TOKEN_ENCRYPTION_KEY: process.env.WORKSHOP_TOKEN_ENCRYPTION_KEY || config.WORKSHOP_TOKEN_ENCRYPTION_KEY,
  DATABASE_URL: process.env.DATABASE_URL || localUrl,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? localUrl.replace(/\/agricola$/, '/agricola_test'),
}
// Quoted shell values also parse with Node's parseEnv. Credentials stay untracked.
const text = Object.entries(values).map(([key, value]) => `${key}='${value.replaceAll("'", "'\\''")}'`).join('\n') + '\n'
writeFileSync(join(dataDir, 'dependencies.local'), text, { mode: 0o600 })
// Explicit external endpoints pass through unchanged. Host loopback endpoints
// become dependency-network addresses when used by application containers.
const containerValues = { ...values, PROMETHEUS_URL: 'http://prometheus:9090', GRAFANA_URL: 'http://grafana:3000' }
if (!process.env.DATABASE_URL) {
  const url = new URL(localUrl); url.hostname = 'postgres'; url.port = '5432'
  containerValues.DATABASE_URL = url.toString()
}
if (!process.env.S3_ENDPOINT) containerValues.S3_ENDPOINT = 'http://objects:9000'
const containerText = Object.entries(containerValues).filter(([key]) => !key.startsWith('TEST_'))
  .map(([key, value]) => `${key}='${value.replaceAll("'", "'\\''")}'`).join('\n') + '\n'
writeFileSync(join(dataDir, 'dependencies.compose.env'), containerText, { mode: 0o600 })
console.log('[services] PostgreSQL and S3 configuration ready; application and test data persist separately.')

try { execFileSync('docker', ['network', 'inspect', 'open-agricola-local_default'], { stdio: 'ignore' }) }
catch { execFileSync('docker', ['network', 'create', 'open-agricola-local_default'], { stdio: 'ignore' }) }

execFileSync(process.execPath, ['scripts/observability.mjs', '--prepare-only'], { stdio: 'inherit', env: { ...process.env, SHARED_DATA_DIR: dataDir } })
