import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { finalSnapshotMetadata } from './_helpers/candidate-provenance'
import { createTestDatabase, getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'

const repository = resolve(import.meta.dirname, '../..')
const roots: string[] = [], servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

type State = { sha: string; configuration: string; evidence: string; provenance: Record<string, unknown>;
  release: { tag_name: string; html_url: string; draft: boolean; prerelease: boolean; published_at: string };
  tag: string; backendSha: string; frontendSha: string; running: boolean; ready: boolean; notification: 'completed' | 'pending' | 'offline';
  frontendStatus: number; frontendBody?: string; frontendBase: string; tagAfterRead?: string }

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'oa-feedback-deploy-')); roots.push(root)
  for (const directory of ['scripts/ci', 'scripts/release', 'server/bug-report', 'shared/contract', '.github/workflows', 'bin']) mkdirSync(join(root, directory), { recursive: true })
  cpSync(join(repository, 'scripts/ci'), join(root, 'scripts/ci'), { recursive: true })
  cpSync(join(repository, 'scripts/release'), join(root, 'scripts/release'), { recursive: true })
  cpSync(join(repository, 'server/bug-report/deployment-proof.ts'), join(root, 'server/bug-report/deployment-proof.ts'))
  cpSync(join(repository, 'shared/contract/bug-report-feedback.ts'), join(root, 'shared/contract/bug-report-feedback.ts'))
  cpSync(join(repository, '.github/workflows/candidate-verification.yml'), join(root, '.github/workflows/candidate-verification.yml'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'check:architecture': 'pnpm run lint' } }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(root, '.gitignore'), 'bin/\nstate.json\nevents.jsonl\nreceipt.json\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main'); git('config', 'user.name', 'Feedback test'); git('config', 'user.email', 'feedback@example.test')
  git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**'); git('commit', '-m', 'fix fixture')
  const fixSha = git('rev-parse', 'HEAD')
  git('commit', '--allow-empty', '-m', 'production fixture')
  const sha = git('rev-parse', 'HEAD')
  const state: State = { sha, configuration: '', evidence: 'passed', provenance: finalSnapshotMetadata(sha),
    release: { tag_name: 'v9.9.9', html_url: 'https://github.com/titanxxh/open-agricola/releases/tag/v9.9.9', draft: false, prerelease: false, published_at: '2026-10-30T00:00:00Z' },
    tag: sha, backendSha: sha, frontendSha: sha, running: true, ready: true, notification: 'completed', frontendStatus: 200, frontendBase: '/' }
  const save = () => writeFileSync(join(root, 'state.json'), JSON.stringify(state))
  save()
  const eventFile = join(root, 'events.jsonl')
  const env: NodeJS.ProcessEnv = { ...process.env, CI: '', GITHUB_ACTIONS: '', GITHUB_SHA: '', GITHUB_OUTPUT: '',
    PATH: [join(root, 'bin'), join(repository, 'node_modules/.bin'), process.env.PATH].join(delimiter), FEEDBACK_TEST_ROOT: root }
  const invoke = (script: string, args: string[]) => new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(join(repository, 'node_modules/.bin/tsx'), [join(root, script), ...args], { cwd: root, env })
    let stdout = '', stderr = ''
    child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
    child.on('error', reject); child.on('close', status => resolve({ status, stdout, stderr }))
  })
  const manifest = await invoke('scripts/ci/candidate-verification.ts', ['manifest', '--sha', sha])
  if (manifest.status !== 0) throw new Error(manifest.stderr)
  const parsed: unknown = JSON.parse(manifest.stdout)
  if (!parsed || typeof parsed !== 'object' || !('configuration' in parsed) || typeof parsed.configuration !== 'string') throw new Error('Invalid manifest')
  state.configuration = parsed.configuration; save()
  const prefix = `#!${process.execPath}
const fs = require('node:fs'); const path = require('node:path'); const root = process.env.FEEDBACK_TEST_ROOT;
const state = JSON.parse(fs.readFileSync(path.join(root, 'state.json'), 'utf8')); const args = process.argv.slice(2);
const event = value => fs.appendFileSync(path.join(root, 'events.jsonl'), JSON.stringify(value) + '\\n');
const output = value => process.stdout.write(JSON.stringify(value) + '\\n');
`
  writeFileSync(join(root, 'bin/gh'), prefix + `
if(args[0] !== 'api' || args.includes('POST')) throw Error('Unexpected GitHub write');
const endpoint = args[1].replace('repos/titanxxh/open-agricola/', ''); event({ kind: 'github', endpoint });
const tasks = ['quality','fast','slow','build','chromium-1','chromium-2','chromium-3','chromium-4','browser-sandbox','webkit'];
const step = name => ({name,status:'completed',conclusion:'success'});
if (Object.hasOwn(state.provenance, args[1])) { const value = state.provenance[args[1]]; if(Array.isArray(value) && args.includes('--paginate')) value.forEach(output); else output(value); }
else if(endpoint === 'releases/tags/v9.9.9') output(state.release);
else if(endpoint === 'git/ref/tags/v9.9.9') { output({ref:'refs/tags/v9.9.9',object:{type:'commit',sha:state.tag}}); if(state.tagAfterRead){state.tag=state.tagAfterRead;fs.writeFileSync(path.join(root,'state.json'),JSON.stringify(state));} }
else if(endpoint === 'commits/' + state.sha || endpoint === 'commits/' + state.tag) output({sha:endpoint.slice(8)});
else if(endpoint === 'actions/workflows/candidate-verification.yml') output({id:100,path:'.github/workflows/candidate-verification.yml'});
else if(endpoint.startsWith('actions/workflows/100/runs?')) { if(state.evidence !== 'missing') output({id:1,workflow_id:100,path:'.github/workflows/candidate-verification.yml',event:'workflow_dispatch',head_sha:state.sha,repository:{id:1164782262,full_name:'titanxxh/open-agricola'},head_repository:{id:1164782262},status:'completed',run_attempt:1,updated_at:'2026-10-30T00:15:00Z',html_url:'https://github.com/titanxxh/open-agricola/actions/runs/1'}); }
else if(endpoint === 'actions/runs/1/jobs?filter=all&per_page=100') {
  output({id:1,run_id:1,run_attempt:1,name:'candidate-manifest',status:'completed',conclusion:'success',html_url:'https://github.com/titanxxh/open-agricola/actions/runs/1/jobs/1',started_at:'2026-10-30T00:00:00Z',completed_at:'2026-10-30T00:01:00Z',steps:[step('Generate candidate manifest'),step('Candidate manifest / ' + state.sha + ' / ' + state.configuration + ' / ' + tasks.join(','))]});
  tasks.filter(task => !(state.evidence === 'partial' && task === 'slow')).forEach((task,index) => output({id:index+2,run_id:1,run_attempt:1,name:'candidate / ' + task + ' / ' + state.configuration,status:'completed',conclusion:state.evidence === 'failed' && task === 'webkit' ? 'failure' : 'success',html_url:'https://github.com/titanxxh/open-agricola/actions/runs/1/jobs/' + (index+2),started_at:'2026-10-30T00:05:00Z',completed_at:'2026-10-30T00:10:00Z',steps:['Checkout candidate','Install dependencies','Verify candidate checkout','Execute verification task','Install browsers'].map(step)}));
} else throw Error('Unexpected GitHub endpoint: ' + endpoint);
`)
  writeFileSync(join(root, 'bin/ssh'), prefix + `
event({kind:'ssh',args}); const input = fs.readFileSync(0,'utf8');
if(args.some(arg => arg.includes('docker inspect'))) { output({containerId:'container-verified',gameBuildId:state.backendSha,running:state.running,healthy:state.ready}); output({gameBuildId:state.backendSha,ready:state.ready}); }
else if(args.some(arg => arg.includes('feedback-owner-cli.ts'))) {
  if(args.some(arg => arg.endsWith(' status'))) { output([]); process.exit(0); }
  event({kind:'notification',input:JSON.parse(input)});
  if(state.notification === 'offline') { process.stderr.write('connection lost'); process.exit(255); }
  const request = JSON.parse(input); output({operationId:request.operationId,kind:'deployment',status:state.notification,error:state.notification==='pending'?'database_unavailable':null,createdAt:1,completedAt:state.notification==='completed'?2:null});
} else throw Error('Unexpected SSH command');
`)
  for (const name of ['gh', 'ssh']) chmodSync(join(root, 'bin', name), 0o755)
  const server = createServer((req, res) => {
    writeFileSync(eventFile, JSON.stringify({kind:'http',url:req.url}) + '\n', {flag:'a'})
    res.writeHead(state.frontendStatus, { 'content-type': 'application/json' })
    res.end(state.frontendBody ?? JSON.stringify({format:1,gameBuildId:state.frontendSha,basePath:state.frontendBase}))
  }); servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No frontend listener')
  const frontend = `http://127.0.0.1:${address.port}/`
  const events = (): Array<{ kind: string; endpoint?: string; input?: unknown; args?: string[] }> => existsSync(eventFile)
    ? readFileSync(eventFile,'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
  const confirm = (...args: string[]) => invoke('scripts/release/verify-feedback-deployment.ts', ['v9.9.9','--host','owner-test','--remote-dir','/srv/open-agricola','--frontend',frontend,'--receipt',join(root,'receipt.json'),...args])
  return {root,sha,fixSha,state,save,env,git,events,confirm,invoke}
}

describe('owner verified feedback deployment', () => {
  it('observes a formal complete release and records its exact full ancestry without publishing or deploying', async () => {
    const value = await fixture()
    const result = await value.confirm()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({release:'verified',deployment:'observed',verification:'passed',notification:{status:'completed'}})
    const sent = value.events().find(event => event.kind === 'notification')
    expect(sent?.input).toMatchObject({proof:{release:{version:'v9.9.9',sha:value.sha},frontend:{gameBuildId:value.sha},backend:{gameBuildId:value.sha},ancestry:{format:'git-raw-closure-v1',commits:expect.arrayContaining([value.fixSha,value.sha])}}})
    expect(value.events().some(event => event.endpoint?.includes('dispatches'))).toBe(false)
    expect(readFileSync(join(value.root,'receipt.json'),'utf8')).toContain(value.sha)
  })
  it('refuses a tag moved while observing production before saving or notifying', async () => {
    const value = await fixture()
    value.state.tagAfterRead = value.fixSha; value.save()
    const result = await value.confirm()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Release tag changed')
    expect(value.events().filter(event => event.kind === 'notification')).toEqual([])
    expect(existsSync(join(value.root, 'receipt.json'))).toBe(false)
  })

  it('retains original verified observation and operation identity when notification retry loses SSH', async () => {
    const value = await fixture()
    value.state.notification = 'offline'; value.save()
    const first = await value.confirm()
    expect(first.status).toBe(2)
    const receipt = JSON.parse(readFileSync(join(value.root, 'receipt.json'), 'utf8'))
    expect(JSON.parse(first.stdout)).toMatchObject({ deployment: 'observed', verification: 'passed', notification: { operationId: receipt.operationId, status: 'pending' } })
    const before = value.events().length
    const retry = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--host', 'owner-test', '--retry', join(value.root, 'receipt.json')])
    expect(retry.status).toBe(2)
    expect(JSON.parse(retry.stdout)).toMatchObject({ release: 'unchanged', deployment: 'unchanged', verification: 'retained', notification: { operationId: receipt.operationId, status: 'pending' } })
    expect(value.events().slice(before).map(event => event.kind)).toEqual(['ssh', 'notification'])
  })

  it.each([
    ['draft', (state: State) => { state.release.draft = true }],
    ['prerelease', (state: State) => { state.release.prerelease = true }],
    ['foreign Release', (state: State) => { state.release.html_url = 'https://github.com/foreign/project/releases/tag/v9.9.9' }],
    ['unpublished Release', (state: State) => { state.release.published_at = '' }],
    ['unmerged candidate', (state: State) => { state.provenance[`repos/titanxxh/open-agricola/commits/${state.sha}/pulls?per_page=100`] = [] }],
    ['missing candidate verification', (state: State) => { state.evidence = 'missing' }],
    ['failed candidate verification', (state: State) => { state.evidence = 'failed' }],
    ['partial candidate verification', (state: State) => { state.evidence = 'partial' }],
    ['frontend-only deployment', (state: State) => { state.backendSha = 'b'.repeat(40) }],
    ['backend-only deployment', (state: State) => { state.frontendSha = 'b'.repeat(40) }],
    ['no frontend', (state: State) => { state.frontendStatus = 404 }],
    ['stopped backend', (state: State) => { state.running = false }],
    ['unready backend', (state: State) => { state.ready = false }],
    ['frontend base mismatch', (state: State) => { state.frontendBase = '/wrong/' }],
    ['browser-only build flag', (state: State) => { state.frontendBody = '{"verified":true,"released":true}' }],
    ['oversized frontend metadata', (state: State) => { state.frontendBody = ' '.repeat(5000) }],
  ] satisfies Array<[string, (state: State) => void]>)('blocks %s before any feedback write', async (_name, change) => {
    const value = await fixture()
    change(value.state); value.save()
    const result = await value.confirm()
    expect(result.status).toBe(1)
    expect(value.events().filter(event => event.kind === 'notification')).toEqual([])
    expect(existsSync(join(value.root, 'receipt.json'))).toBe(false)
  })

  it('retries the original receipt successfully while release and production adapters are unavailable', async () => {
    const value = await fixture()
    value.state.notification = 'pending'; value.save()
    const first = await value.confirm()
    expect(first.status).toBe(2)
    const receipt = readFileSync(join(value.root, 'receipt.json'), 'utf8')
    const before = value.events().length
    value.state.notification = 'completed'; value.state.release.draft = true; value.state.evidence = 'missing'
    value.state.frontendStatus = 500; value.state.ready = false; value.save()
    const retry = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--host', 'owner-test', '--retry', join(value.root, 'receipt.json')])
    expect(retry.status, retry.stderr).toBe(0)
    expect(JSON.parse(retry.stdout)).toMatchObject({ deployment: 'unchanged', verification: 'retained', notification: { status: 'completed' } })
    expect(value.events().slice(before).map(event => event.kind)).toEqual(['ssh', 'notification'])
    expect(value.events().slice(before).at(-1)?.input).toEqual(JSON.parse(receipt))
    expect(readFileSync(join(value.root, 'receipt.json'), 'utf8')).toBe(receipt)
  })

  it('inspects and retries persisted operations without release, frontend or deployment reads', async () => {
    const value = await fixture()
    const status = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--host', 'owner-test', '--status', 'operations'])
    expect(status.status, status.stderr).toBe(0)
    expect(JSON.parse(status.stdout)).toEqual({ operations: [] })
    const retry = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--host', 'owner-test', '--retry-operation', 'assessment:known-operation'])
    expect(retry.status, retry.stderr).toBe(0)
    expect(JSON.parse(retry.stdout)).toMatchObject({ deployment: 'unchanged', verification: 'retained', notification: { operationId: 'assessment:known-operation', status: 'completed' } })
    expect(value.events().map(event => event.kind)).toEqual(['ssh', 'ssh', 'notification'])
  })

  it('refuses owner verification in CI before opening any external connection', async () => {
    const value = await fixture()
    value.env.CI = 'true'
    const result = await value.confirm()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('owner-controlled machine')
    expect(value.events()).toEqual([])
  })

  it('rejects a shallow ancestry proof and ignores grafted parent truncation', async () => {
    const value = await fixture()
    mkdirSync(join(value.root, '.git/info'), { recursive: true })
    writeFileSync(join(value.root, '.git/info/grafts'), value.sha + '\n')
    const grafted = await value.confirm()
    expect(grafted.status, grafted.stderr).toBe(0)
    expect(value.events().find(event => event.kind === 'notification')?.input).toMatchObject({ proof: { ancestry: { commits: expect.arrayContaining([value.fixSha, value.sha]) } } })
    rmSync(join(value.root, 'receipt.json'))
    writeFileSync(join(value.root, '.git/shallow'), value.fixSha + '\n')
    const before = value.events().filter(event => event.kind === 'notification').length
    const shallow = await value.confirm()
    expect(shallow.status).toBe(1)
    expect(shallow.stderr).toContain('non-shallow')
    expect(value.events().filter(event => event.kind === 'notification')).toHaveLength(before)
  })

  it('records and retries the original operation through the actual PostgreSQL owner process', async () => {
    const value = await fixture()
    expect((await value.confirm()).status).toBe(0)
    const receipt: unknown = JSON.parse(readFileSync(join(value.root, 'receipt.json'), 'utf8'))
    if (!receipt || typeof receipt !== 'object' || !('operationId' in receipt)) throw new Error('No operation identity')
    const db = await createTestDatabase()
    try {
      const schema = await db.prepare('SELECT current_schema() AS name').get<{name: string}>()
      if (!schema?.name.startsWith('test_')) throw new Error('Expected isolated PostgreSQL schema')
      const run = (args: string[], data?: unknown) => new Promise<{status:number|null;stdout:string;stderr:string}>((resolve, reject) => {
        const child = spawn(join(repository, 'node_modules/.bin/tsx'), [join(repository, 'server/bug-report/feedback-owner-cli.ts'), ...args], {
          cwd: repository, env: {...process.env, CI:'', GITHUB_ACTIONS:'', DATABASE_URL:getTestDatabaseUrl(), DATABASE_SCHEMA:schema.name},
        })
        let stdout='', stderr=''
        child.stdout.on('data', chunk => {stdout+=chunk}); child.stderr.on('data', chunk => {stderr+=chunk})
        child.on('error', reject); child.on('close', status => resolve({status,stdout,stderr}))
        child.stdin.end(data === undefined ? '' : JSON.stringify(data))
      })
      const first = await run(['record'], receipt)
      expect(first.status, first.stderr).toBe(0)
      expect(JSON.parse(first.stdout)).toMatchObject({operationId:receipt.operationId,kind:'deployment',status:'completed',error:null})
      const listed = await run(['status'])
      expect(listed.status, listed.stderr).toBe(0)
      expect(JSON.parse(listed.stdout)).toEqual([JSON.parse(first.stdout)])
      const retried = await run(['retry'], {operationId:receipt.operationId})
      expect(retried.status, retried.stderr).toBe(0)
      expect(JSON.parse(retried.stdout)).toMatchObject({operationId:receipt.operationId,status:'completed',error:null})
      const replayed = await run(['record'], receipt)
      expect(replayed.status, replayed.stderr).toBe(0)
      expect(JSON.parse(replayed.stdout)).toMatchObject({operationId:receipt.operationId,status:'completed'})
    } finally {await db.close()}
  })

  it('reports a persisted notification retry transport failure without changing deployment status', async () => {
    const value = await fixture()
    value.state.notification = 'offline'; value.save()
    const retry = await value.invoke('scripts/release/verify-feedback-deployment.ts', ['--host', 'owner-test', '--retry-operation', 'assessment:known-operation'])
    expect(retry.status).toBe(2)
    expect(JSON.parse(retry.stdout)).toMatchObject({release:'unchanged',deployment:'unchanged',verification:'retained',notification:{operationId:'assessment:known-operation',status:'pending'}})
    expect(value.events().map(event => event.kind)).toEqual(['ssh', 'notification'])
  })

})
