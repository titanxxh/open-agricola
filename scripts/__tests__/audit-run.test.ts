import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { afterEach, expect, it, vi } from 'vitest'
import { runValidation } from '../audit-migration/run.mjs'
import { applyControl } from '../audit-migration/control.mjs'

const temporary: string[] = []
afterEach(() => { vi.unstubAllEnvs(); temporary.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })) })
const git = (root: string, ...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)) }
const stages = ['frozen-native', 'frozen-strict', 'frozen-check-native', 'raw-prepare', 'raw-verify', 'prepush', 'local-proof']

async function fixture(fault = '') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-run-test-'))
  temporary.push(directory)
  const root = path.join(directory, 'repo')
  fs.mkdirSync(root)
  git(root, 'init', '--quiet')
  git(root, 'config', 'user.name', 'Audit fixture')
  git(root, 'config', 'user.email', 'audit@example.invalid')
  fs.mkdirSync(path.join(root, 'server/__tests__'), { recursive: true })
  fs.writeFileSync(path.join(root, 'server/__tests__/primary.test.ts'), 'export {}\n')
  fs.writeFileSync(path.join(root, 'server/__tests__/related.test.ts'), 'export {}\n')
  fs.writeFileSync(path.join(root, '.gitignore'), 'output/\n')
  write(path.join(root, 'tsconfig.server.json'), { compilerOptions: { strict: true } })
  write(path.join(root, 'scripts/audit-migration/cases.json'), { source: { cases: 1 }, nativeScope: [{ file: 'server/__tests__/related.test.ts', reason: 'related root' }], files: [{ file: 'ae-negative-fixture.test.ts', cases: [{ batch: 'M01', title: 'original negative responsibility', targetFile: 'server/__tests__/primary.test.ts', targetTitle: 'rejects payment', status: 'migrated' }] }] })
  fs.writeFileSync(path.join(root, 'scripts/audit-migration.mjs'), `
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import {execFileSync} from 'node:child_process';
const root=process.cwd(); const args=process.argv.slice(2); const action=args[0]; const out=args[args.indexOf('--output')+1];
const json=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v))};
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(); const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
fs.appendFileSync(process.env.AUDIT_FAKE_EVENTS,action+'\\n');
if(action==='check-native') console.log(JSON.stringify({typesExit:0,fileInventoryExit:0,missingTypeRoots:[]}));
if(action==='prepare'){
 fs.mkdirSync(path.join(out,'candidate/server/__tests__'),{recursive:true});
 for(const f of ['primary.test.ts','related.test.ts'])fs.copyFileSync(path.join(root,'server/__tests__',f),path.join(out,'candidate/server/__tests__',f));
 const files=git('ls-files','--cached','--others','--exclude-standard','-z').split('\\0').filter(Boolean).sort().map(f=>[f,digest(fs.readFileSync(f))]);
 json(path.join(out,'assembly.json'),{candidateCommit:git('rev-parse','HEAD'),candidateFiles:files,candidateFingerprint:digest(JSON.stringify(files))});
}
if(action==='verify'){
 const target=path.join(out,'candidate/server/__tests__/primary.test.ts');
 json(path.join(out,'summary.json'),{rawMode:'strict-expected',typesExit:0,fileInventoryExit:0,behaviorExit:0,failed:0,pending:0,todo:0,unresolvedSourceCases:0,missingTypeRoots:[],coveredSourceCases:1,tests:2,passed:2,includedTypeRoots:2});
 json(path.join(out,'behavior.json'),{testResults:[{name:target,assertionResults:[{fullName:process.env.AUDIT_FAKE_FAULT==='wrong-raw-title'?'wrong title':'rejects payment',status:'passed'}]}]});
 fs.writeFileSync(path.join(out,'included-files.log'),target+'\\n');
 if(process.env.AUDIT_FAKE_FAULT==='raw-byte-drift')fs.appendFileSync(target,'drift');
}
`)
  git(root, 'add', '.')
  git(root, 'commit', '--quiet', '-m', 'frozen fixture')
  const head = git(root, 'rev-parse', 'HEAD')
  const workspace = path.join(directory, 'control')
  await applyControl({ root, workspace, request: { kind: 'pause', authority: 'fixture tooling authorization', finishOnly: [{ kind: 'tooling', head }] } })
  const grant = await applyControl({ root, workspace, request: { kind: 'grant', authority: 'fixture local stages only', assignment: { kind: 'tooling', head, id: 'fake-run', worker: 'fixture', operations: stages.map(stage => `local-validation:${stage}`) } } })
  if (!('file' in grant) || typeof grant.file !== 'string') throw new Error('fixture grant did not produce a file')
  const database = path.join(directory, 'database.env')
  fs.writeFileSync(database, 'TEST_DATABASE_URL=postgres://fixture:private@localhost:1/unused\n')
  const output = path.join(directory, 'run')
  const config = path.join(directory, 'config.json')
  write(config, { head, batch: 'M01', output, workspace, assignment: grant.file, services: { databaseEnv: database } })
  const bin = path.join(directory, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'pnpm'), `#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import {execFileSync} from 'node:child_process';
const a=process.argv.slice(2); const root=process.cwd(); const json=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v))}; const fault=process.env.AUDIT_FAKE_FAULT;
fs.appendFileSync(process.env.AUDIT_FAKE_EVENTS,a.join(' ')+'\\n');
if(a[0]==='exec'&&a[1]==='vitest'){
 const targets=a.slice(3).filter(f=>f.endsWith('.test.ts')); const output=a.find(f=>f.startsWith('--outputFile=')).slice(13);
 const suites=targets.map(f=>({name:path.join(root,f),assertionResults:[{fullName:f.includes('primary')?'rejects payment':'related case',status:'passed'}]}));
 if(fault==='wrong-bystander')suites[1].assertionResults[0].status='failed';
 if(fault==='missing-file')suites.pop();
 json(output,{numTotalTests:targets.length,numPassedTests:targets.length,numFailedTests:0,numPendingTests:0,numTodoTests:0,testResults:suites});
 if(fault==='pause-after-native'){ const {applyControl}=await import(process.env.AUDIT_CONTROL_MODULE); await applyControl({workspace:process.env.AUDIT_FAKE_WORKSPACE,request:{kind:'pause',authority:'pause while local command was admitted',finishOnly:[]}}); }
}
if(a[0]==='exec'&&a[1]==='tsc'){
 const config=JSON.parse(fs.readFileSync(a[a.indexOf('--project')+1],'utf8'));const files=fault==='missing-root'?config.files.slice(0,1):config.files; for(const f of files)console.log(f);
}
if(a[0]==='verify'&&a[1]==='prepush'){
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(); const names=fault==='partial-prepush'?['fast']:['test-services','fast','lint'];
 json(path.join(root,'output/verification/prepush.json'),{mode:'prepush',head,status:'passed',fingerprint:'fixture-fingerprint',steps:names.map(name=>({name,status:'passed',exitCode:0}))});
}
if(a[0]==='verify'&&a[1]==='status')console.log(fault==='stale-prepush'?'[verify] prepush: stale / passed':'[verify] prepush: current / passed');
`)
  fs.chmodSync(path.join(bin, 'pnpm'), 0o755)
  vi.stubEnv('PATH', `${bin}${path.delimiter}${process.env.PATH ?? ''}`)
  vi.stubEnv('AUDIT_FAKE_EVENTS', path.join(directory, 'events.log'))
  vi.stubEnv('AUDIT_FAKE_FAULT', fault)
  vi.stubEnv('AUDIT_FAKE_WORKSPACE', workspace)
  vi.stubEnv('AUDIT_CONTROL_MODULE', fileURLToPath(new URL('../audit-migration/control.mjs', import.meta.url)))
  return { directory, root, head, workspace, output, config, events: path.join(directory, 'events.log') }
}

it('runs all frozen local stages against fake tools and proves complete target, strict, RAW and prepush evidence', async () => {
  const f = await fixture()
  const result = await runValidation(f.root, new Map([['config', f.config]]))
  expect(result).toMatchObject({ head: f.head, status: 'passed', remoteChecked: false, targets: ['server/__tests__/primary.test.ts', 'server/__tests__/related.test.ts'] })
  expect(result.steps.map(step => step.name)).toEqual(stages)
  expect(JSON.parse(fs.readFileSync(path.join(f.output, 'frozen-native.json'), 'utf8'))).toMatchObject({ result: { tests: 2, passed: 2, sourceResponsibilitiesActualPassed: 1 } })
  expect(JSON.parse(fs.readFileSync(path.join(f.output, 'strict-config.json'), 'utf8'))).toMatchObject({ compilerOptions: { noUnusedLocals: false, noUnusedParameters: false, incremental: false } })
  expect(fs.readFileSync(f.events, 'utf8')).toContain('verify prepush')
  expect(fs.readFileSync(f.events, 'utf8')).not.toMatch(/^(?:gh |docker|git push|git merge)/m)
  expect(JSON.stringify(result)).not.toContain('fixture:private')
})

it.each(['wrong-bystander', 'missing-file', 'missing-root', 'wrong-raw-title', 'raw-byte-drift', 'partial-prepush', 'stale-prepush'])('fails closed for %s evidence', async fault => {
  const f = await fixture(fault)
  await expect(runValidation(f.root, new Map([['config', f.config]]))).rejects.toThrow()
  expect(JSON.parse(fs.readFileSync(path.join(f.output, 'final.json'), 'utf8'))).toMatchObject({ status: 'failed' })
})

it('stops after a pause during an admitted local command and starts no next stage', async () => {
  const f = await fixture('pause-after-native')
  await expect(runValidation(f.root, new Map([['config', f.config]]))).rejects.toThrow(/stale|paused/)
  expect(fs.readFileSync(f.events, 'utf8').trim().split('\n')).toHaveLength(1)
  expect(fs.existsSync(path.join(f.output, 'strict-config.json'))).toBe(false)
})

it('does not launch tools with a stale assignment or an output inside Git', async () => {
  const f = await fixture()
  await applyControl({ root: f.root, workspace: f.workspace, request: { kind: 'pause', authority: 'pause fixture', finishOnly: [] } })
  await expect(runValidation(f.root, new Map([['config', f.config]]))).rejects.toThrow(/stale|paused/)
  expect(fs.existsSync(f.events)).toBe(false)
  expect(fs.existsSync(f.output)).toBe(false)
  const original = JSON.parse(fs.readFileSync(f.config, 'utf8'))
  write(f.config, { ...original, output: path.join(f.root, 'unsafe-output') })
  await expect(runValidation(f.root, new Map([['config', f.config]]))).rejects.toThrow(/outside/)
})
