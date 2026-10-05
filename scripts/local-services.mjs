import { randomBytes } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { Pool } from 'pg'

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
const localUrl = `postgresql://agricola:${encodeURIComponent(config.LOCAL_POSTGRES_PASSWORD)}@127.0.0.1:${config.LOCAL_POSTGRES_PORT}/agricola`
const testOnly = process.argv.includes('--test')
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
const values = {
  DATABASE_URL: process.env.DATABASE_URL ?? localUrl,
  TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? localUrl.replace(/\/agricola$/, '/agricola_test'),
}
// Quoted shell values also parse with Node's parseEnv. Credentials stay untracked.
const text = Object.entries(values).map(([key, value]) => `${key}='${value.replaceAll("'", "'\\''")}'`).join('\n') + '\n'
writeFileSync(join(dataDir, 'dependencies.local'), text, { mode: 0o600 })
console.log('[services] Local PostgreSQL ready; application and test data persist separately.')
