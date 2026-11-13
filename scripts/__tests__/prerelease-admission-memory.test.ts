import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { parsePrereleaseTarget, targetFingerprint } from '../prerelease/config'
import { readRuntime, writeRuntime } from '../prerelease/runtime'
import { seedStorageGuard } from './prerelease-storage-guard-fixture'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'agricola-admission-')); roots.push(root)
  const template = parsePrereleaseTarget(JSON.parse(readFileSync('deploy/prerelease-target.example.json', 'utf8')))
  const target = { ...template, directory: join(root, 'open-agricola-prerelease-main'), policyDirectory: resolve('.'),
    budgets: { ...template.budgets, app: { memoryMiB: 512, cpus: 1, pids: 128 }, tools: { memoryMiB: 256, cpus: 1, pids: 128 }, reserveMemoryMiB: 256, diskMiB: 256 } }
  mkdirSync(join(target.directory, 'data'), { recursive: true }); seedStorageGuard(target)
  const objects = `S3_BUCKET=${target.objects.bucket}\nS3_PREFIX=live/\nS3_SECRET_ACCESS_KEY=fixture\nS3_ENDPOINT=${target.objects.endpoint}\nS3_REGION=us-east-1\nS3_FORCE_PATH_STYLE=true\n`
  writeFileSync(join(target.directory, '.env'), `DATABASE_URL=postgres://${target.database.appRole}:fixture@${target.database.host}/${target.database.name}\nS3_ACCESS_KEY_ID=${target.objects.appKeyId}\n${objects}`, { mode: 0o600 })
  writeFileSync(join(target.directory, 'data/dependencies.compose.env'), `DATABASE_URL=postgres://${target.database.backupRole}:fixture@${target.database.host}/${target.database.name}\nVALIDATION_DATABASE_URL=postgres://${target.validationDatabase.role}:fixture@${target.validationDatabase.host}/${target.validationDatabase.name}\nS3_ACCESS_KEY_ID=${target.objects.backupKeyId}\n${objects}`, { mode: 0o600 })
  const image = `sha256:${'d'.repeat(64)}`, id = 'a'.repeat(64), buildId = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const record = readRuntime(target)
  writeRuntime(target, { ...record, buildId, installed: { buildId, image, installedAt: 1 } })
  mkdirSync(join(target.directory, 'backups/.pending-test/capture'), { recursive: true })
  const state = { availableMiB: [832, 832], anonMiB: [256, 256], fileMiB: 0, endpoint: 'unix:///var/run/docker.sock',
    cgroupVersion: '2', pid: 65432, startTicks: '100', memoryMax: '536870912', swapMax: '0', swapCurrent: '0',
    exitAfterInspect: false, changePid: false, changeTicks: false, badStat: false, missingNative: false, inspections: 0 }
  const statePath = join(root, 'state.json'), calls = join(root, 'calls'), save = () => writeFileSync(statePath, JSON.stringify(state))
  save()
  const bin = join(root, 'bin'); mkdirSync(bin)
  writeFileSync(join(bin, 'docker'), String.raw`#!${process.execPath}
const fs=require('node:fs'),raw=process.argv.slice(2),args=raw[0]==='--host'?raw.slice(2):raw,line=args.join(' ');
const path=${JSON.stringify(statePath)},state=JSON.parse(fs.readFileSync(path,'utf8'));
fs.appendFileSync(${JSON.stringify(calls)},line+'\n');
const out=value=>process.stdout.write(typeof value==='string'?value:JSON.stringify(value));
if(args[0]==='context')out({Host:state.endpoint});
else if(args[0]==='info')out({OSType:'linux',CgroupVersion:state.cgroupVersion});
else if(args[0]==='ps'&&line.includes('com.docker.compose.service=app'))out(${JSON.stringify(id)});
else if(args[0]==='inspect'){
  state.inspections++;fs.writeFileSync(path,JSON.stringify(state));
  out({Id:${JSON.stringify(id)},Image:${JSON.stringify(image)},State:{Running:!(state.exitAfterInspect&&state.inspections>1),Pid:state.pid+(state.changePid&&state.inspections>1?1:0),StartedAt:'2026-11-13T00:00:00Z'},HostConfig:{Memory:536870912,MemorySwap:536870912},Config:{Labels:{'com.docker.compose.project':${JSON.stringify(target.project)},'com.docker.compose.service':'app'}}});
}else if(args[0]==='compose')out('TOOL_STARTED');
`, { mode: 0o700 })
  const cgroup = join(root, 'cgroup'); mkdirSync(cgroup)
  const preload = join(root, 'kernel.mjs')
  writeFileSync(preload, String.raw`import fs from 'node:fs';import os from 'node:os';import {syncBuiltinESMExports} from 'node:module';
const read=fs.readFileSync,stat=fs.statSync,state=()=>JSON.parse(read(${JSON.stringify(statePath)},'utf8'));
let anonReads=0,availableReads=0,tickReads=0;
os.freemem=()=>{const values=state().availableMiB;return values[Math.min(availableReads++,values.length-1)]*1048576;};
fs.statSync=(path,...args)=>stat(typeof path==='string'&&path.startsWith('/sys/fs/cgroup/system.slice/docker-')?${JSON.stringify(cgroup)}:path,...args);
fs.readFileSync=(path,...args)=>{
 if(typeof path!=='string')return read(path,...args);
 const s=state();
 if(path.startsWith('/proc/65432/')||path.startsWith('/sys/fs/cgroup/system.slice/docker-')){
  if(s.missingNative)throw Error('fixture native read failed');
  if(path.endsWith('/cgroup'))return '0::/system.slice/docker-${id}.scope\n';
  if(path.endsWith('/stat'))return '65432 (fixture) '+['S',...Array(18).fill('0'),s.changeTicks&&tickReads++>0?'101':s.startTicks,...Array(30).fill('0')].join(' ');
  if(path.endsWith('/memory.stat'))return s.badStat?'anon invalid\n':'file '+s.fileMiB*1048576+'\nanon '+s.anonMiB[Math.min(anonReads++,s.anonMiB.length-1)]*1048576+'\nanon_thp 0\n';
  if(path.endsWith('/memory.max'))return s.memoryMax+'\n';
  if(path.endsWith('/memory.swap.max'))return s.swapMax+'\n';
  if(path.endsWith('/memory.swap.current'))return s.swapCurrent+'\n';
 }
 return read(path,...args);
};syncBuiltinESMExports();`)
  const invoke = () => spawnSync(process.execPath, ['--import', preload, '--import', import.meta.resolve('tsx'), join(target.policyDirectory, 'scripts/prerelease/archive-policy.ts'), 'validate', '/backup/.pending-test/capture'], {
    cwd: target.directory, encoding: 'utf8', timeout: 15000, env: { ...process.env, CI: '', GITHUB_ACTIONS: '', DOCKER_HOST: '', DOCKER_CONTEXT: '', PATH: `${bin}:${process.env.PATH}`,
      BACKUP_TARGET_CONFIG: JSON.stringify(target), BACKUP_POLICY_ROOT: target.policyDirectory, BACKUP_ENVIRONMENT: target.targetId,
      SOURCE_BUILD_ID: buildId, BACKUP_SOURCE_IMAGE: image, BACKUP_TARGET_BUILD_ID: buildId,
      BACKUP_DATA_GENERATION: record.generation, BACKUP_TARGET_FINGERPRINT: targetFingerprint(target), BACKUP_JOB_ID: 'test', BACKUP_DEADLINE_EPOCH_MS: String(Date.now() + 60000) } })
  return { state, save, invoke, calls: () => readFileSync(calls, 'utf8') }
}

it('admits the owner archive CLI with the remaining app cap and full tool, gateway and reserve budgets', () => {
  const value = fixture(), result = value.invoke()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toBe('TOOL_STARTED')
  expect(value.calls()).not.toMatch(/stop|restart/)
})

it('does not credit application file cache toward the owner archive admission', () => {
  const value = fixture()
  value.state.anonMiB = [0, 0]; value.state.fileMiB = 256; value.save()
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('required 1140850688')
  expect(value.calls()).not.toContain('compose ')
})

it.each(['available-first', 'available-second', 'anon-first', 'anon-second'])('uses the lower %s sample without reducing the other reserved budgets', change => {
  const value = fixture()
  if (change === 'available-first') value.state.availableMiB = [831, 900]
  if (change === 'available-second') value.state.availableMiB = [900, 831]
  if (change === 'anon-first') value.state.anonMiB = [128, 256]
  if (change === 'anon-second') value.state.anonMiB = [256, 128]
  value.save()
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(result.stderr).toContain('capacity is below the conservative budget')
  expect(value.calls()).not.toContain('compose ')
})

it.each(['exit', 'pid', 'start-ticks', 'remote-daemon', 'cgroup-v1', 'unbounded', 'swap-limit', 'swap-used', 'malformed-anon', 'missing-native'])('fails owner archive admission closed for %s', mismatch => {
  const value = fixture()
  if (mismatch === 'exit') value.state.exitAfterInspect = true
  if (mismatch === 'pid') value.state.changePid = true
  if (mismatch === 'start-ticks') value.state.changeTicks = true
  if (mismatch === 'remote-daemon') value.state.endpoint = 'ssh://elsewhere'
  if (mismatch === 'cgroup-v1') value.state.cgroupVersion = '1'
  if (mismatch === 'unbounded') value.state.memoryMax = 'max'
  if (mismatch === 'swap-limit') value.state.swapMax = '1'
  if (mismatch === 'swap-used') value.state.swapCurrent = '1'
  if (mismatch === 'malformed-anon') value.state.badStat = true
  if (mismatch === 'missing-native') value.state.missingNative = true
  value.save()
  const result = value.invoke()
  expect(result.status).not.toBe(0)
  expect(value.calls()).not.toMatch(/compose |stop|restart/)
})
