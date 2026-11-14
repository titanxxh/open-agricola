import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'
import { LIVE_INVENTORY_QUERY } from '../release/live-inventory'

const roots: string[] = [], repository = resolve(import.meta.dirname, '../..'), sha = 'a'.repeat(40)
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'live-inventory-')); roots.push(root)
  const bin = join(root, 'bin'); mkdirSync(bin)
  const log = join(root, 'ssh.json'), output = join(root, 'inventory.json'), source = join(root, 'source.json')
  const inventory = { format: 1, expectedBuild: sha, observedAt: new Date().toISOString(),
    transaction: { read_only: 'on', isolation: 'repeatable read' }, instances: [], contexts: [], replays: [] }
  writeFileSync(source, JSON.stringify(inventory))
  writeFileSync(join(bin, 'ssh'), `#!${process.execPath}
const fs=require('node:fs'); const body=fs.readFileSync(0,'utf8');
fs.writeFileSync(process.env.INVENTORY_LOG,JSON.stringify({args:process.argv.slice(2),body}));
process.stdout.write(fs.readFileSync(process.env.INVENTORY_SOURCE));\n`, { mode: 0o755 })
  const run = (overrides: string[] = []) => spawnSync(process.execPath, ['--import', 'tsx', join(repository, 'scripts/release/live-inventory.ts'),
    '--host', 'owner@host', '--directory', '/srv/agricola', '--expected-build', sha, '--output', output, ...overrides], {
    cwd: repository, env: { ...process.env, CI: '', GITHUB_ACTIONS: '', PATH: `${bin}${delimiter}${process.env.PATH}`,
      INVENTORY_LOG: log, INVENTORY_SOURCE: source }, encoding: 'utf8',
  })
  return { run, inventory, source, output, log, root }
}

it('captures fixed-target metadata through the readonly owner SSH command and writes a private inventory', () => {
  const f = fixture(), result = f.run()
  expect(result.status, result.stderr).toBe(0)
  expect(JSON.parse(readFileSync(f.output, 'utf8'))).toEqual(f.inventory)
  expect(statSync(f.output).mode & 0o777).toBe(0o600)
  const call = JSON.parse(readFileSync(f.log, 'utf8'))
  expect(call.args).toEqual(['owner@host', `'node' '--input-type=module' '-' '/srv/agricola' '${sha}'`])
  expect(call.body).toContain('REPEATABLE READ READ ONLY')
  expect(JSON.parse(result.stdout)).toMatchObject({ status: 'inventoried', expectedBuild: sha, businessDatabaseWrites: false })
})

it.each(['wrong build', 'stale', 'invalid response', 'writable'])('preserves the prior inventory when provider evidence is %s', failure => {
  const f = fixture(); writeFileSync(f.output, 'retained', { mode: 0o600 })
  if (failure === 'wrong build') f.inventory.expectedBuild = 'b'.repeat(40)
  if (failure === 'stale') f.inventory.observedAt = '2020-01-01T00:00:00Z'
  if (failure === 'writable') f.inventory.transaction.read_only = 'off'
  writeFileSync(f.source, failure === 'invalid response' ? '{}' : JSON.stringify(f.inventory))
  expect(f.run().status).toBe(1)
  expect(readFileSync(f.output, 'utf8')).toBe('retained')
})

it('refuses symlink or public existing outputs before SSH and preserves the target', () => {
  const f = fixture(), target = join(f.root, 'target.json'); writeFileSync(target, 'retained', { mode: 0o600 })
  symlinkSync(target, f.output)
  expect(f.run().status).toBe(1); expect(existsSync(f.log)).toBe(false); expect(readFileSync(target, 'utf8')).toBe('retained')
  rmSync(f.output); writeFileSync(f.output, 'retained'); chmodSync(f.output, 0o644)
  expect(f.run().status).toBe(1); expect(existsSync(f.log)).toBe(false)
})

it('rejects duplicate or unknown options before opening SSH', () => {
  const f = fixture()
  expect(f.run(['--host', 'other@host']).status).toBe(1)
  expect(f.run(['--execute', 'true']).status).toBe(1)
  expect(existsSync(f.log)).toBe(false)
})

it('executes the actual exported collector in a private PostgreSQL schema with readonly repeatable metadata', async () => {
  const connectionString = getTestDatabaseUrl(), schema = `inv_${randomUUID().replaceAll('-', '')}`
  const client = new Client({ connectionString }); await client.connect()
  try {
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`CREATE TABLE "${schema}".app_instances (instance_id text,generation text,status text,lease_until bigint);
      CREATE TABLE "${schema}".game_contexts (room_id text,lifecycle text);
      CREATE TABLE "${schema}".game_replays (room_id text,viewer_build_id text);`)
    await client.query(`INSERT INTO "${schema}".app_instances VALUES ('instance-one',$1,'ready',$2),('instance-two',$1,'ready',$2)`, [sha, Date.now() + 60_000])
    await client.query(`INSERT INTO "${schema}".game_contexts VALUES ('ended','completed'),('playing','playing');
      INSERT INTO "${schema}".game_replays VALUES ('ended','viewer'),('playing','hidden');`)
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', LIVE_INVENTORY_QUERY, sha], {
      cwd: repository, encoding: 'utf8', timeout: 30_000, env: { ...process.env, DATABASE_URL: connectionString,
        DATABASE_SCHEMA: schema, NODE_ENV: 'production', RELEASE_CHANNEL: 'stable', GAME_BUILD_ID: sha },
    })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ format: 1, expectedBuild: sha,
      transaction: { read_only: 'on', isolation: 'repeatable read' },
      instances: [
        { instance_id: 'instance-one', generation: sha, status: 'ready', lease_valid: true },
        { instance_id: 'instance-two', generation: sha, status: 'ready', lease_valid: true },
      ], contexts: [{ room_id: 'ended', lifecycle: 'completed' }], replays: [{ room_id: 'ended', viewer_build_id: 'viewer' }],
    })
    expect((await client.query(`SELECT count(*)::int AS count FROM "${schema}".game_contexts`)).rows).toEqual([{ count: 2 }])
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await client.end()
  }
}, 30_000)
