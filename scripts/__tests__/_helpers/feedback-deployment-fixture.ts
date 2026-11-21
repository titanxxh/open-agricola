// @covers scripts/release/verify-feedback-deployment.ts
import { execFileSync, spawn } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { delimiter, join, resolve } from 'node:path'
import { finalSnapshotMetadata } from './candidate-provenance'
import { reusableTempRoots } from './reusable-temp-roots'
import { stableConfiguration } from '../../ci/candidate-verification'
import { canonicalOwnerLocalCommands, type OwnerLocalReceipt } from '../../ci/owner-local-verification'
import { FULL_TASK_IDS, verificationConfiguration } from '../../ci/verification-tasks'

// Shared by verify-feedback-deployment*.test.ts: a temporary repository with gh/ssh stubs and a frontend listener that
// runs the producer's scripts/release/verify-feedback-deployment.ts end to end.

const repository = resolve(import.meta.dirname, '../../..')
const roots = reusableTempRoots('oa-feedback-deploy-'), servers: Server[] = []
/** Each test file registers this in afterEach: it closes the frontend listeners and resets the temporary roots. */
export async function resetFeedbackDeploymentFixtures() {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
  roots.reset()
}
/** Each test file registers this in afterAll. */
export const disposeFeedbackDeploymentFixtures = () => roots.dispose()

export type FeedbackDeploymentState = { sha: string; configuration: string; evidence: string; provenance: Record<string, unknown>;
  release: { tag_name: string; html_url: string; draft: boolean; prerelease: boolean; published_at: string };
  tag: string; backendSha: string; frontendSha: string; running: boolean; ready: boolean; notification: 'completed' | 'pending' | 'offline';
  frontendStatus: number; frontendBody?: string; frontendBase: string; tagAfterRead?: string }

export async function feedbackDeploymentFixture() {
  const root = roots.create()
  for (const directory of ['scripts/ci', 'scripts/release', 'server/bug-report', 'shared/contract', '.github/workflows', 'e2e-tests', 'bin']) mkdirSync(join(root, directory), { recursive: true })
  cpSync(join(repository, 'scripts/ci'), join(root, 'scripts/ci'), { recursive: true })
  cpSync(join(repository, 'scripts/release'), join(root, 'scripts/release'), { recursive: true })
  cpSync(join(repository, 'server/bug-report/deployment-proof.ts'), join(root, 'server/bug-report/deployment-proof.ts'))
  cpSync(join(repository, 'shared/contract/bug-report-feedback.ts'), join(root, 'shared/contract/bug-report-feedback.ts'))
  cpSync(join(repository, '.github/workflows/candidate-verification.yml'), join(root, '.github/workflows/candidate-verification.yml'))
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'check:architecture': 'pnpm run lint' } }))
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n')
  writeFileSync(join(root, 'e2e-tests', 'fixture.spec.ts'), '// fixture\n')
  writeFileSync(join(root, '.gitignore'), 'bin/\nstate.json\nevents.jsonl\nreceipt.json\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '-b', 'main'); git('config', 'user.name', 'Feedback test'); git('config', 'user.email', 'feedback@example.test')
  git('config', `url.file://${join(root, 'unavailable-origin')}.insteadOf`, 'https://github.com/titanxxh/open-agricola.git')
  git('add', '--all', '--', '.', ':(exclude)docs/superpowers/**'); git('commit', '-m', 'fix fixture')
  const fixSha = git('rev-parse', 'HEAD')
  git('commit', '--allow-empty', '-m', 'production fixture')
  const sha = git('rev-parse', 'HEAD')
  const state: FeedbackDeploymentState = { sha, configuration: '', evidence: 'passed', provenance: finalSnapshotMetadata(sha),
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
  state.configuration = stableConfiguration(root, sha, sha); save()
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
if (args.includes('Accept: application/octet-stream')) { const value = state.provenance[args[1]]; if(typeof value !== 'string') throw Error('Missing receipt bytes'); process.stdout.write(value); }
else if (Object.hasOwn(state.provenance, args[1])) { const value = state.provenance[args[1]]; if(Array.isArray(value) && args.includes('--paginate')) value.forEach(output); else output(value); }
else if(endpoint === 'releases/tags/v9.9.9') output(state.release);
else if(endpoint === 'git/ref/tags/v9.9.9') { output({ref:'refs/tags/v9.9.9',object:{type:'commit',sha:state.tag}}); if(state.tagAfterRead){state.tag=state.tagAfterRead;fs.writeFileSync(path.join(root,'state.json'),JSON.stringify(state));} }
else if(endpoint === 'commits/' + state.sha || endpoint === 'commits/' + state.tag) output({sha:endpoint.slice(8)});
else if(endpoint === 'actions/workflows/candidate-verification.yml') output({id:100,path:'.github/workflows/candidate-verification.yml'});
else if(endpoint.startsWith('actions/workflows/100/runs?')) { if(state.evidence !== 'missing') output({id:1,workflow_id:100,path:'.github/workflows/candidate-verification.yml',event:'workflow_dispatch',head_sha:state.sha,head_branch:'main',display_title:'stable / ' + state.sha + ' / all',repository:{id:1164782262,full_name:'titanxxh/open-agricola'},head_repository:{id:1164782262},status:'completed',run_attempt:1,updated_at:'2026-10-30T00:15:00Z',html_url:'https://github.com/titanxxh/open-agricola/actions/runs/1'}); }
else if(endpoint === 'actions/runs/1/jobs?filter=all&per_page=100') {
  output({id:1,run_id:1,run_attempt:1,name:'candidate-manifest',status:'completed',conclusion:'success',html_url:'https://github.com/titanxxh/open-agricola/actions/runs/1/jobs/1',started_at:'2026-10-30T00:00:00Z',completed_at:'2026-10-30T00:01:00Z',steps:[step('Generate candidate manifest'),step('Stable manifest / 1164782262 / stable / ' + state.sha + ' / ' + state.configuration + ' / ' + state.sha + ' / ' + tasks.join(','))]});
  tasks.filter(task => !(state.evidence === 'partial' && task === 'slow')).forEach((task,index) => output({id:index+2,run_id:1,run_attempt:1,name:'candidate / ' + task + ' / ' + state.configuration,status:'completed',conclusion:state.evidence === 'failed' && task === 'webkit' ? 'failure' : 'success',html_url:'https://github.com/titanxxh/open-agricola/actions/runs/1/jobs/' + (index+2),started_at:'2026-10-30T00:05:00Z',completed_at:'2026-10-30T00:10:00Z',steps:['Checkout candidate','Install dependencies','Verify candidate checkout','Execute verification task','Install browsers','Prepare candidate isolation','Prove native candidate isolation','Stop candidate descendants and collect private diagnostics'].map(step)}));
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

export async function ownerLocalFeedbackDeploymentFixture() {
  const value = await feedbackDeploymentFixture()
  const repository = 'titanxxh/open-agricola'
  const owner = { id: 7, login: 'titanxxh', type: 'User' }
  const started = Date.now() - 300_000
  const at = (seconds: number) => new Date(started + seconds * 1000).toISOString()
  const commands = canonicalOwnerLocalCommands(value.root, value.sha)
  const receipt: OwnerLocalReceipt = {
    format: 1, kind: 'owner-local-verification', repository, repositoryId: 1164782262,
    testedSha: value.sha, candidateSha: value.sha, tree: value.git('rev-parse', 'HEAD^{tree}'),
    configuration: verificationConfiguration(value.root, value.sha), producerConfiguration: verificationConfiguration(value.root, value.sha),
    startedAt: at(0), completedAt: at(60),
    environment: { node: process.version, platform: process.platform, arch: process.arch, nodeExecutable: process.execPath },
    tasks: FULL_TASK_IDS.map(id => ({ id, startedAt: at(0), completedAt: at(60),
      commands: commands[id].map(command => ({ ...command, exitCode: 0, logSha256: 'a'.repeat(64) })) })),
  }
  const url = `https://github.com/${repository}/releases/download/v9.9.9/owner-local-verification.json`
  const asset = { id: 12, name: 'owner-local-verification.json', size: 0, state: 'uploaded', uploader: owner,
    browser_download_url: url, created_at: at(62) }
  const status = { id: 10, context: 'owner-local-verification', state: 'success', creator: owner,
    created_at: at(63), target_url: url, description: '' }
  const release = { ...value.state.release, id: 11, author: owner, assets: [asset], created_at: at(61), published_at: at(64) }
  Object.assign(value.state.provenance, {
    [`repos/${repository}`]: { id: 1164782262, full_name: repository, default_branch: 'main', owner },
    [`repos/${repository}/commits/${value.sha}/statuses?per_page=100`]: [status],
    [`repos/${repository}/releases/tags/v9.9.9`]: release,
  })
  value.state.evidence = 'missing'
  const saveReceipt = () => {
    const bytes = JSON.stringify(receipt) + '\n'
    asset.size = Buffer.byteLength(bytes)
    status.description = `owner-local sha256:${createHash('sha256').update(bytes).digest('hex')}`
    value.state.provenance[`repos/${repository}/releases/assets/12`] = bytes
    value.save()
  }
  saveReceipt()
  return { ...value, receipt, owner, asset, status, release, saveReceipt }
}
