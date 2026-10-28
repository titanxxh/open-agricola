import pg from 'pg'

let text = ''
for await (const chunk of process.stdin) text += chunk
const config: unknown = JSON.parse(text)
if (!config || typeof config !== 'object' || !('databaseUrl' in config) || typeof config.databaseUrl !== 'string'
  || !('password' in config) || typeof config.password !== 'string' || !/^[a-f0-9]{64}$/.test(config.password)) {
  throw new Error('Invalid operations database provisioning input')
}
const client = new pg.Client({ connectionString: config.databaseUrl, statement_timeout: 5000 })
const role = 'agricola_operations_accounts'
const database = decodeURIComponent(new URL(config.databaseUrl).pathname.slice(1))
const identifier = (value: string) => '"' + value.replaceAll('"', '""') + '"'
try {
  await client.connect()
  await client.query('BEGIN')
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role])
  if (!exists.rowCount) await client.query(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`)
  await client.query(`ALTER ROLE ${role} PASSWORD '${config.password}'`)
  await client.query(`ALTER ROLE ${role} SET default_transaction_read_only=on`)
  await client.query(`GRANT CONNECT ON DATABASE ${identifier(database)} TO ${role}`)
  await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`)
  await client.query(`GRANT SELECT (id,created_at) ON public.users TO ${role}`)
  await client.query('COMMIT')
} catch {
  console.error('Operations database access provisioning failed')
  process.exitCode = 1
} finally { await client.end() }
