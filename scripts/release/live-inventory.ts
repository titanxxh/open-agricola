import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, lstatSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ownerMachine } from './candidate.ts'
import { fullSha } from '../ci/verification-tasks.ts'

export const LIVE_INVENTORY_QUERY = `import {PostgresDatabase} from './server/database/postgres.ts';
const expected=process.argv[1];
if(process.env.NODE_ENV!=='production'||process.env.RELEASE_CHANNEL!=='stable'||process.env.GAME_BUILD_ID!==expected)throw Error('Wrong inventory application');
const db=new PostgresDatabase({connectionString:process.env.DATABASE_URL,schema:process.env.DATABASE_SCHEMA});
try{const result=await db.transaction(async()=>{
await db.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
await db.exec('SET LOCAL statement_timeout=8000');
const instances=await db.prepare('SELECT instance_id,generation,status,lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint AS lease_valid FROM app_instances ORDER BY instance_id').all();
if(instances.some(row=>row.status==='ready'&&row.lease_valid&&row.generation!==expected))throw Error('Mixed application generations');
const contexts=await db.prepare("SELECT c.room_id,c.lifecycle FROM game_contexts c JOIN game_replays r ON r.room_id=c.room_id WHERE c.lifecycle IN ('completed','terminated') ORDER BY c.room_id LIMIT 100").all();
const replays=await db.prepare("SELECT r.room_id,r.viewer_build_id FROM game_replays r JOIN game_contexts c ON c.room_id=r.room_id WHERE c.lifecycle IN ('completed','terminated') ORDER BY r.room_id LIMIT 100").all();
const transaction=await db.prepare("SELECT current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation").get();
return {format:1,expectedBuild:expected,observedAt:new Date().toISOString(),transaction,instances,contexts,replays};})();
console.log(JSON.stringify(result));}finally{await db.close();}`

const controller = `import {execFileSync} from 'node:child_process';import{realpathSync}from'node:fs';
const [directory,expected]=process.argv.slice(2);
if(realpathSync(directory)!==directory)throw Error('Aliased inventory directory');
const docker=args=>execFileSync('docker',args,{cwd:directory,encoding:'utf8',timeout:30000,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']}).trim();
const config=JSON.parse(docker(['compose','-f','docker-compose.prod.yml','config','--format','json']));
const id=docker(['compose','-f','docker-compose.prod.yml','ps','-q','app']);
if(!/^[a-f0-9]{64}$/.test(id))throw Error('Expected one running application');
const format='{"id":{{json .Id}},"running":{{json .State.Running}},"project":{{json (index .Config.Labels "com.docker.compose.project")}},"service":{{json (index .Config.Labels "com.docker.compose.service")}}}';
const before=JSON.parse(docker(['inspect','--format',format,id]));
if(before.id!==id||before.running!==true||before.project!==config.name||before.service!=='app')throw Error('Application binding changed');
const inventory=docker(['exec',id,'node','--import','tsx','--input-type=module','-e',${JSON.stringify(LIVE_INVENTORY_QUERY)},expected]);
if(docker(['inspect','--format',format,id])!==JSON.stringify(before))throw Error('Application changed during inventory');
process.stdout.write(inventory+'\\n');`

function privateOutput(path: string): void {
  const parent = dirname(path), info = lstatSync(parent)
  if (realpathSync(parent) !== parent || !info.isDirectory() || info.uid !== process.getuid?.() || info.mode & 0o022) throw new Error('Inventory output requires an owner-controlled directory')
  if (existsSync(path)) {
    const file = lstatSync(path)
    if (!file.isFile() || file.nlink !== 1 || file.uid !== process.getuid?.() || file.mode & 0o077) throw new Error('Existing inventory output must be an owner-private regular file')
  }
}

export function liveInventoryCli(input: string[]): void {
  ownerMachine()
  const flags = new Map<string, string>()
  for (let index = 0; index < input.length; index += 2) {
    const key = input[index], value = input[index + 1]
    if (!['--host', '--directory', '--expected-build', '--output'].includes(key) || !value || value.startsWith('--') || flags.has(key)) throw new Error('Invalid inventory arguments')
    flags.set(key, value)
  }
  const host = flags.get('--host'), directory = flags.get('--directory'), output = flags.get('--output')
  const expected = fullSha(flags.get('--expected-build') ?? '')
  if (!host || !/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/.test(host) || !directory || !/^\/[A-Za-z0-9_./-]+$/.test(directory)
    || resolve(directory) !== directory || directory === '/' || !output || resolve(output) !== output) {
    throw new Error('Usage: release:inventory --host USER@HOST --directory DIR --expected-build SHA --output PRIVATE_FILE')
  }
  privateOutput(output)
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'"
  const command = ['node', '--input-type=module', '-', directory, expected].map(quote).join(' ')
  const bytes = execFileSync('ssh', [host, command], { input: controller, encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
  const value: unknown = JSON.parse(bytes)
  if (!value || typeof value !== 'object' || !('expectedBuild' in value) || value.expectedBuild !== expected
    || !('format' in value) || value.format !== 1 || !('transaction' in value) || !value.transaction || typeof value.transaction !== 'object'
    || !('read_only' in value.transaction) || value.transaction.read_only !== 'on'
    || !('isolation' in value.transaction) || value.transaction.isolation !== 'repeatable read'
    || !('observedAt' in value) || typeof value.observedAt !== 'string' || !Number.isFinite(Date.parse(value.observedAt))
    || Date.now() - Date.parse(value.observedAt) > 60_000 || Date.parse(value.observedAt) > Date.now() + 60_000
    || !('instances' in value) || !Array.isArray(value.instances) || !('contexts' in value) || !Array.isArray(value.contexts)
    || !('replays' in value) || !Array.isArray(value.replays)) throw new Error('Invalid or stale live inventory')
  const temporary = `${output}.${randomUUID()}.tmp`
  try { writeFileSync(temporary, bytes, { flag: 'wx', mode: 0o600, flush: true }); renameSync(temporary, output) }
  finally { rmSync(temporary, { force: true }) }
  console.log(JSON.stringify({ status: 'inventoried', expectedBuild: expected, observedAt: value.observedAt, output, businessDatabaseWrites: false }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { liveInventoryCli(process.argv.slice(2)) }
  catch { console.error('Read-only live inventory failed; no application or database changes were requested.'); process.exitCode = 1 }
}
