import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseDeploymentProof, type DeploymentProof } from '../../server/bug-report/deployment-proof'
import { checkCandidateVerification } from '../ci/candidate-verification'
import { fullSha } from '../ci/verification-tasks'
import { candidateSha, commitRef, github, ownerMachine, RELEASE_REPOSITORY } from './candidate'

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid owner feedback evidence')
  return Object.fromEntries(Object.entries(value))
}
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const gitEnvironment = () => ({ ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_GRAFT_FILE: '/dev/null' })

/** Traverse and hash the raw commit graph so later fix links need no mutable remote lookup. */
function ancestry(cwd: string, sha: string): string[] {
  const git = (args: string[]) => execFileSync('git', args, { cwd, env: gitEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] })
  if (git(['rev-parse', '--is-shallow-repository']).toString().trim() !== 'false') throw new Error('A complete non-shallow Git repository is required')
  const pending = [sha], seen = new Set<string>()
  while (pending.length) {
    const commit = pending.pop()
    if (commit === undefined || seen.has(commit)) continue
    fullSha(commit)
    const body = git(['cat-file', 'commit', commit])
    if (createHash('sha1').update(`commit ${body.length}\0`).update(body).digest('hex') !== commit) throw new Error('Raw ancestry commit hash mismatch')
    seen.add(commit)
    const headers = body.toString('utf8').split('\n\n', 1)[0]
    for (const line of headers.split('\n')) if (line.startsWith('parent ')) pending.push(fullSha(line.slice(7)))
  }
  return [...seen].sort()
}

type Target = { host: string; remoteDir: string }
function parseTarget(value: unknown): Target {
  const target = object(value)
  if (typeof target.host !== 'string' || !/^(?:[a-zA-Z0-9_.-]+@)?[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(target.host)
    || typeof target.remoteDir !== 'string' || !target.remoteDir.startsWith('/') || /[\r\n\0]/.test(target.remoteDir)) {
    throw new Error('Expected an SSH host alias and absolute remote directory')
  }
  return { host: target.host, remoteDir: target.remoteDir }
}
function remote(target: Target, command: string, input?: unknown): string {
  const script = `set -eu; cd -- ${quote(target.remoteDir)}; ${command}`
  const result = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '--', target.host, script], {
    input: input === undefined ? undefined : JSON.stringify(input), encoding: 'utf8', timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Owner SSH operation failed; retry with the saved receipt or operation ID')
  return result.stdout
}
function backend(target: Target): DeploymentProof['backend'] {
  const inspect = `const fs=require('node:fs');const rows=JSON.parse(fs.readFileSync(0,'utf8'));if(rows.length!==1)throw Error('Expected one app container');const c=rows[0];const ids=c.Config.Env.filter(e=>e.startsWith('GAME_BUILD_ID='));if(ids.length!==1)throw Error('Expected one build identity');process.stdout.write(JSON.stringify({containerId:c.Id,running:c.State.Running,gameBuildId:ids[0].slice(14),healthy:c.State.Health?.Status==='healthy'})+'\\n')`
  const ready = `fetch('http://127.0.0.1:5175/api/health',{signal:AbortSignal.timeout(10000)}).then(async r=>{const body=await r.json();process.stdout.write(JSON.stringify({gameBuildId:process.env.GAME_BUILD_ID,ready:r.ok&&body.ok===true})+'\\n')}).catch(()=>process.exit(1))`
  const output = remote(target, `container=$(docker compose --env-file .env -f docker-compose.prod.yml ps -q app); test -n "$container"; docker inspect "$container" | node -e ${quote(inspect)}; docker exec "$container" node -e ${quote(ready)}`)
  const lines = output.trim().split('\n')
  if (lines.length !== 2) throw new Error('Invalid running backend evidence')
  const observed = object(JSON.parse(lines[0])), readiness = object(JSON.parse(lines[1]))
  if (typeof observed.containerId !== 'string' || !observed.containerId || observed.running !== true || observed.healthy !== true
    || typeof observed.gameBuildId !== 'string' || readiness.gameBuildId !== observed.gameBuildId || readiness.ready !== true) throw new Error('Running backend is not ready')
  return { containerId: observed.containerId, gameBuildId: fullSha(observed.gameBuildId), running: true, ready: true }
}
async function frontend(url: URL, basePath: string): Promise<DeploymentProof['frontend']> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: 'no-store', redirect: 'error' })
  if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 4096 || !response.body) throw new Error('Frontend build metadata is unavailable')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.length
      if (length > 4096) throw new Error('Frontend build metadata is too large')
      chunks.push(next.value)
    }
  } finally { await reader.cancel() }
  const value = object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
  if (value.format !== 1 || value.basePath !== basePath || typeof value.gameBuildId !== 'string') throw new Error('Invalid frontend build metadata')
  return { format: 1, gameBuildId: fullSha(value.gameBuildId), basePath, url: url.href }
}

type Receipt = { operationId: string; proof: DeploymentProof; target: Target }
function parseReceipt(value: unknown): Receipt {
  const receipt = object(value)
  if (typeof receipt.operationId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(receipt.operationId)) throw new Error('Invalid feedback operation identity')
  return { operationId: receipt.operationId, proof: parseDeploymentProof(receipt.proof), target: parseTarget(receipt.target) }
}
function operation(value: unknown) {
  const result = object(value)
  if (typeof result.operationId !== 'string' || !['pending', 'completed'].includes(String(result.status))
    || !['deployment', 'reconcile'].includes(String(result.kind))) throw new Error('Invalid feedback operation result')
  return result
}
function notify(target: Target, receipt: Receipt) {
  try {
    const result = operation(JSON.parse(remote(target, 'docker compose --env-file .env -f docker-compose.prod.yml exec -T app node --import tsx server/bug-report/feedback-owner-cli.ts record', receipt)))
    if (result.operationId !== receipt.operationId || result.kind !== 'deployment') throw new Error('Notification response has a different operation identity')
    return result
  } catch (error) {
    return { operationId: receipt.operationId, status: 'pending', error: error instanceof Error ? error.message : 'Owner notification operation failed' }
  }
}

/** Read-only release/deployment observation, followed by the existing feedback service over owner SSH. */
export async function verifyFeedbackDeployment(cwd: string, input: string[]): Promise<Record<string, unknown>> {
  ownerMachine()
  const args = [...input], version = args[0]?.startsWith('--') ? undefined : args.shift()
  const options = new Map<string, string>()
  while (args.length) {
    const key = args.shift(), value = args.shift()
    if (!key || !['--host','--remote-dir','--frontend','--base-path','--receipt','--retry','--retry-operation','--status'].includes(key)
      || value === undefined || options.has(key)) throw new Error('Usage: verify-feedback-deployment.ts [vX.Y.Z] --host host [--remote-dir /path] [--frontend URL --receipt file | --retry receipt | --retry-operation ID | --status operations]')
    options.set(key, value)
  }
  const target = parseTarget({ host: options.get('--host') ?? 'ubuntu@ten-kr', remoteDir: options.get('--remote-dir') ?? '/home/ubuntu/open-agricola' })
  const modes = ['--retry','--retry-operation','--status'].filter(key => options.has(key))
  if (modes.length > 1 || modes.length && version) throw new Error('Choose one verification, retry or status operation')
  const retryOperation = options.get('--retry-operation')
  if (retryOperation) {
    if (!/^[a-zA-Z0-9_:-]{8,250}$/.test(retryOperation)) throw new Error('Invalid feedback operation identity')
    try {
      const result = operation(JSON.parse(remote(target, 'docker compose --env-file .env -f docker-compose.prod.yml exec -T app node --import tsx server/bug-report/feedback-owner-cli.ts retry', { operationId: retryOperation })))
      if (result.operationId !== retryOperation) throw new Error('Notification response has a different operation identity')
      return { release: 'unchanged', deployment: 'unchanged', verification: 'retained', notification: result }
    } catch (error) {
      return { release: 'unchanged', deployment: 'unchanged', verification: 'retained', notification: { operationId: retryOperation,
        status: 'pending', error: error instanceof Error ? error.message : 'Owner notification operation failed' } }
    }
  }
  if (options.has('--status')) {
    if (options.get('--status') !== 'operations') throw new Error('Use --status operations')
    const result: unknown = JSON.parse(remote(target, 'docker compose --env-file .env -f docker-compose.prod.yml exec -T app node --import tsx server/bug-report/feedback-owner-cli.ts status', {}))
    if (!Array.isArray(result)) throw new Error('Invalid feedback operation list')
    return { operations: result.map(operation) }
  }
  const retry = options.get('--retry')
  if (retry) {
    const receipt = parseReceipt(JSON.parse(readFileSync(resolve(cwd, retry), 'utf8')))
    if (options.has('--host') && options.get('--host') !== receipt.target.host
      || options.has('--remote-dir') && options.get('--remote-dir') !== receipt.target.remoteDir) throw new Error('Retry target does not match the saved receipt')
    return { release: 'unchanged', deployment: 'unchanged', verification: 'retained', receipt: resolve(cwd, retry), notification: notify(receipt.target, receipt) }
  }
  if (!version || !/^v\d+\.\d+\.\d+$/.test(version) || !options.has('--frontend') || !options.has('--receipt')) throw new Error('A formal version, --frontend and --receipt are required')
  const receiptPath = resolve(cwd, options.get('--receipt') ?? '')
  if (existsSync(receiptPath)) throw new Error('Receipt already exists; use --retry with that file or choose a new receipt')
  const release = object(github(RELEASE_REPOSITORY, `releases/tags/${encodeURIComponent(version)}`))
  const publishedAt = typeof release.published_at === 'string' ? Date.parse(release.published_at) : NaN
  if (release.tag_name !== version || release.html_url !== `https://github.com/${RELEASE_REPOSITORY}/releases/tag/${version}`
    || release.draft !== false || release.prerelease !== false || !Number.isSafeInteger(publishedAt) || publishedAt < 1 || publishedAt > Date.now()) throw new Error('A published formal Release is required')
  const tagSha = commitRef(RELEASE_REPOSITORY, `tags/${version}`)
  if (!tagSha) throw new Error('Release tag has no exact commit')
  const sha = candidateSha(cwd, RELEASE_REPOSITORY, tagSha)
  if (sha !== tagSha) throw new Error('Release tag commit changed')
  const commits = ancestry(cwd, sha)
  const candidate = checkCandidateVerification(cwd, RELEASE_REPOSITORY, sha)
  if (candidate.status !== 'passed' || candidate.sha !== sha || candidate.repository !== RELEASE_REPOSITORY
    || !candidate.tasks.length || candidate.tasks.some(task => task.status !== 'passed')) throw new Error('Full same-SHA GitHub candidate verification is incomplete')
  const basePath = options.get('--base-path') ?? '/'
  const frontendRoot = new URL(options.get('--frontend') ?? '')
  if (!['https:', 'http:'].includes(frontendRoot.protocol) || frontendRoot.username || frontendRoot.password
    || frontendRoot.search || frontendRoot.hash || frontendRoot.pathname !== basePath || !basePath.endsWith('/')) throw new Error('Frontend URL must match the expected base path')
  const frontendMetadata = await frontend(new URL('frontend-build.json', frontendRoot), basePath)
  const backendMetadata = backend(target)
  const proof = parseDeploymentProof({ repository: RELEASE_REPOSITORY,
    release: { version, url: release.html_url, sha, tagSha, draft: false, prerelease: false, publishedAt }, candidate: { ...candidate, requiredTaskIds: candidate.tasks.map(task => task.id) },
    frontend: frontendMetadata, backend: backendMetadata, ancestry: { format: 'git-raw-closure-v1', commits }, observedAt: Date.now() })
  if (commitRef(RELEASE_REPOSITORY, `tags/${version}`) !== sha) throw new Error('Release tag changed while observing production')
  const receipt = { operationId: randomUUID(), proof, target }
  writeFileSync(receiptPath, JSON.stringify(receipt) + '\n', { mode: 0o600, flag: 'wx' })
  return { release: 'verified', deployment: 'observed', verification: 'passed', receipt: receiptPath, notification: notify(target, receipt) }
}

async function main(): Promise<void> {
  try {
    const result = await verifyFeedbackDeployment(process.cwd(), process.argv.slice(2))
    process.stdout.write(JSON.stringify(result) + '\n')
    const notification = result.notification
    if (notification && typeof notification === 'object' && 'status' in notification && notification.status !== 'completed') process.exitCode = 2
  } catch (error) { console.error(error instanceof Error ? error.message : 'Owner feedback verification failed'); process.exitCode = 1 }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main()
