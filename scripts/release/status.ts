import { spawnSync } from 'node:child_process'
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BROWSER_AUTH_VERSION } from '../../shared/contract/browser-auth.ts'
import { fullSha } from '../ci/verification-tasks.ts'

type State = 'verified' | 'absent' | 'pending' | 'conflict' | 'unavailable'
type Evidence = 'native' | 'live' | 'saved'
type Stage = { state: State; evidence: Evidence; reason: string; observedAt?: string }
type Config = {
  repository: string; version: string; candidateSha: string; apiOrigin: string; appOrigin: string;
  image?: { runId: number; runAttempt: number; artifactId: number };
  backend?: { host: string; directory: string; operationId: string };
  acceptanceFile?: string;
}
class ObservationError extends Error {
  readonly state: State
  readonly reason: string
  constructor(state: State, reason: string) { super(reason); this.state = state; this.reason = reason }
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid object')
  return Object.fromEntries(Object.entries(value))
}
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value) throw new TypeError('Invalid text')
  return value
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key)) || Object.keys(value).some(key => ![...required, ...optional].includes(key))) throw new TypeError('Unexpected fields')
}
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new TypeError('Invalid identifier')
  return value
}
function privateJson(path: string): unknown {
  if (resolve(path) !== path || realpathSync(path) !== path) throw new TypeError('Private file must have a canonical path')
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const info = fstatSync(fd)
    if (!info.isFile() || info.nlink !== 1 || info.uid !== process.getuid?.() || info.mode & 0o077 || info.size < 1 || info.size > 1024 * 1024) throw new TypeError('Invalid private file')
    const bytes = Buffer.alloc(info.size + 1), length = readSync(fd, bytes, 0, bytes.length, 0)
    if (length !== info.size || fstatSync(fd).size !== info.size) throw new TypeError('Private file changed while reading')
    return JSON.parse(bytes.toString('utf8', 0, length))
  } finally { closeSync(fd) }
}
function origin(value: unknown): string {
  const url = new URL(text(value)), local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (!(url.protocol === 'https:' || local && url.protocol === 'http:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new TypeError('Invalid public origin')
  return url.origin
}
function config(value: unknown): Config {
  const input = object(value)
  keys(input, ['repository', 'version', 'candidateSha', 'apiOrigin', 'appOrigin'], ['image', 'backend', 'acceptanceFile'])
  const repository = text(input.repository), version = text(input.version)
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^v\d+\.\d+\.\d+$/.test(version)) throw new TypeError('Invalid release selection')
  const result: Config = { repository, version, candidateSha: fullSha(text(input.candidateSha)), apiOrigin: origin(input.apiOrigin), appOrigin: origin(input.appOrigin) }
  if (input.image !== undefined) {
    const image = object(input.image); keys(image, ['runId', 'runAttempt', 'artifactId'])
    result.image = { runId: integer(image.runId), runAttempt: integer(image.runAttempt), artifactId: integer(image.artifactId) }
  }
  if (input.backend !== undefined) {
    const backend = object(input.backend); keys(backend, ['host', 'directory', 'operationId'])
    const host = text(backend.host), directory = text(backend.directory), operationId = text(backend.operationId)
    if (!/^(?:[A-Za-z0-9_.-]+@)?[A-Za-z0-9_.-]+$/.test(host) || !/^\/[A-Za-z0-9_./-]+$/.test(directory) || resolve(directory) !== directory || directory === '/'
      || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(operationId)) throw new TypeError('Invalid backend selection')
    result.backend = { host, directory, operationId }
  }
  if (input.acceptanceFile !== undefined) {
    result.acceptanceFile = text(input.acceptanceFile)
    if (resolve(result.acceptanceFile) !== result.acceptanceFile) throw new TypeError('Invalid saved acceptance path')
  }
  return result
}
function command(cwd: string, program: string, args: string[], input?: string) {
  return spawnSync(program, args, { cwd, input, encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
}
function provider(cwd: string, repository: string, endpoint: string): Record<string, unknown> {
  const result = command(cwd, 'gh', ['api', `repos/${repository}/${endpoint}`])
  if (result.error || result.status !== 0) {
    if (!result.error && /\(HTTP 404\)/.test(result.stderr)) throw new ObservationError('absent', 'native-record-missing')
    throw new ObservationError('unavailable', 'native-query-unavailable')
  }
  try { return object(JSON.parse(result.stdout)) }
  catch { throw new ObservationError('conflict', 'invalid-native-record') }
}
async function stage(evidence: Evidence, observe: () => Stage | Promise<Stage>): Promise<Stage> {
  try { return await observe() }
  catch (error) {
    return { evidence, state: error instanceof ObservationError ? error.state : 'unavailable', reason: error instanceof ObservationError ? error.reason : 'observation-unavailable' }
  }
}
function release(cwd: string, selected: Config): Stage {
  const metadata = provider(cwd, selected.repository, `releases/tags/${selected.version}`)
  if (metadata.tag_name !== selected.version || metadata.prerelease !== false || typeof metadata.draft !== 'boolean') throw new ObservationError('conflict', 'release-identity-mismatch')
  let target = object(provider(cwd, selected.repository, `git/ref/tags/${selected.version}`).object)
  for (let depth = 0; target.type === 'tag' && depth < 10; depth++) target = object(provider(cwd, selected.repository, `git/tags/${fullSha(text(target.sha))}`).object)
  if (target.type !== 'commit' || target.sha !== selected.candidateSha) throw new ObservationError('conflict', 'release-candidate-mismatch')
  if (metadata.draft) return { state: 'pending', evidence: 'native', reason: 'release-is-draft' }
  const result = command(cwd, process.execPath, [join(import.meta.dirname, '../ci/candidate-verification.ts'), 'check', '--repository', selected.repository, '--sha', selected.candidateSha])
  let proof: Record<string, unknown>
  try { proof = object(JSON.parse(result.stdout)) } catch { throw new ObservationError('unavailable', 'candidate-proof-unavailable') }
  if (result.error || proof.repository !== selected.repository || proof.sha !== selected.candidateSha) throw new ObservationError('unavailable', 'candidate-proof-unavailable')
  if (result.status === 0 && proof.status === 'passed') return { state: 'verified', evidence: 'native', reason: 'published-candidate-verified' }
  if (result.status === 1 && proof.status === 'blocked') return { state: 'pending', evidence: 'native', reason: 'candidate-verification-incomplete' }
  throw new ObservationError('unavailable', 'candidate-proof-unavailable')
}
function image(cwd: string, selected: Config): Stage {
  if (!selected.image) return { state: 'unavailable', evidence: 'native', reason: 'image-selection-not-configured' }
  const { runId, runAttempt, artifactId } = selected.image
  const run = provider(cwd, selected.repository, `actions/runs/${runId}/attempts/${runAttempt}`)
  if (run.id !== runId || run.run_attempt !== runAttempt) throw new ObservationError('conflict', 'image-run-mismatch')
  if (run.status !== 'completed') return { state: 'pending', evidence: 'native', reason: 'image-build-incomplete' }
  if (run.conclusion !== 'success') throw new ObservationError('conflict', 'image-build-not-successful')
  const script = `import {verifyContainerImageBuild} from ${JSON.stringify(new URL('./container-images.ts', import.meta.url).href)};const selected=JSON.parse(process.argv[1]);process.stdout.write(JSON.stringify(verifyContainerImageBuild(selected)));`
  const result = command(cwd, process.execPath, ['--input-type=module', '-e', script, JSON.stringify({ cwd, runId, runAttempt, artifactId })])
  if (result.error || result.status !== 0) throw new ObservationError('unavailable', 'image-proof-unavailable')
  const receipt = object(JSON.parse(result.stdout))
  if (receipt.sourceSha !== selected.candidateSha || receipt.purpose !== 'formal-candidate' || receipt.channel !== 'stable' || receipt.repository !== selected.repository) throw new ObservationError('conflict', 'image-candidate-mismatch')
  return { state: 'verified', evidence: 'native', reason: 'native-image-proof-verified' }
}
function backend(cwd: string, selected: Config): Stage {
  if (!selected.backend) return { state: 'unavailable', evidence: 'native', reason: 'backend-selection-not-configured' }
  const { host, directory, operationId } = selected.backend
  const result = command(cwd, process.execPath, [join(import.meta.dirname, 'backend-image.ts'), 'status', host, selected.candidateSha, directory, '--operation-id', operationId])
  if (result.error || result.status !== 0) throw new ObservationError('unavailable', 'backend-operation-unavailable')
  const value = object(JSON.parse(result.stdout))
  if (value.kind !== 'backend-image-operation' || value.operationId !== operationId || value.sourceSha !== selected.candidateSha) throw new ObservationError('conflict', 'backend-operation-mismatch')
  if (value.state === 'accepted') return { state: 'verified', evidence: 'native', reason: 'backend-operation-accepted' }
  if (value.state === 'running' || value.state === 'resumable') return { state: 'pending', evidence: 'native', reason: value.state === 'running' ? 'backend-operation-running' : 'backend-operation-resumable' }
  if (value.state === 'blocked') throw new ObservationError('conflict', 'backend-operation-blocked')
  throw new ObservationError('unavailable', 'backend-operation-unknown')
}
async function publicJson(url: URL): Promise<Record<string, unknown>> {
  const response = await fetch(url, { method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } })
  if (response.status === 404) throw new ObservationError('absent', 'public-record-missing')
  if (response.status !== 200 || !response.body) throw new ObservationError('unavailable', 'public-query-unavailable')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > 64 * 1024) throw new ObservationError('conflict', 'public-response-too-large')
      chunks.push(value)
    }
    try { return object(JSON.parse(Buffer.concat(chunks).toString('utf8'))) }
    catch { throw new ObservationError('conflict', 'invalid-public-record') }
  } finally { await reader.cancel().catch(() => undefined) }
}
async function pages(selected: Config): Promise<Stage> {
  const [build, policy, health] = await Promise.all([publicJson(new URL('/frontend-build.json', selected.appOrigin)),
    publicJson(new URL('/api/auth/browser-policy', selected.apiOrigin)), publicJson(new URL('/api/health', selected.apiOrigin))])
  if (build.format !== 1 || build.gameBuildId !== selected.candidateSha || build.basePath !== '/' || build.releaseChannel !== 'stable' || build.deploymentTarget !== 'stable-pages'
    || policy.version !== BROWSER_AUTH_VERSION || policy.buildId !== selected.candidateSha || policy.appOrigin !== selected.appOrigin || policy.apiOrigin !== selected.apiOrigin) throw new ObservationError('conflict', 'live-build-or-origin-mismatch')
  if (health.ok !== true) throw new ObservationError('pending', 'live-backend-not-ready')
  return { state: 'verified', evidence: 'live', reason: 'pages-and-observed-backend-match', observedAt: new Date().toISOString() }
}
function acceptance(selected: Config): Stage {
  if (!selected.acceptanceFile) return { state: 'unavailable', evidence: 'saved', reason: 'saved-acceptance-not-configured' }
  let value: Record<string, unknown>
  try { value = object(privateJson(selected.acceptanceFile)) }
  catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') throw new ObservationError('absent', 'saved-acceptance-missing')
    throw new ObservationError('unavailable', 'saved-acceptance-unreadable')
  }
  if (value.format !== 1 || value.expectedBuild !== selected.candidateSha || value.gamesCreated !== 0 || value.gameplayCommands !== 0) throw new ObservationError('conflict', 'saved-acceptance-mismatch')
  if (typeof value.appOrigin !== 'string' || typeof value.apiOrigin !== 'string') throw new ObservationError('conflict', 'saved-acceptance-origins-missing')
  if (value.appOrigin !== selected.appOrigin || value.apiOrigin !== selected.apiOrigin) throw new ObservationError('conflict', 'saved-acceptance-origin-mismatch')
  if (value.passed !== true) throw new ObservationError('conflict', 'saved-acceptance-failed')
  const completedAt = typeof value.completedAt === 'string' ? Date.parse(value.completedAt) : NaN
  if (!Number.isFinite(completedAt) || completedAt > Date.now() + 60_000 || !Array.isArray(value.browsers)) throw new ObservationError('conflict', 'saved-acceptance-incomplete')
  const browsers = value.browsers.map(object)
  if (browsers.length !== 2 || !['chromium', 'webkit'].every(engine => browsers.some(browser => browser.engine === engine
    && ['login', 'logout', 'cookie', 'lobby', 'ordinaryRoom', 'reconnect', 'replay'].every(key => browser[key] === true)
    && browser.routedInstances === 2 && browser.blockedRequests === 0 && Array.isArray(browser.cleanupFailures) && browser.cleanupFailures.length === 0))) throw new ObservationError('conflict', 'saved-acceptance-incomplete')
  return { state: 'verified', evidence: 'saved', reason: 'saved-acceptance-passed-not-live', observedAt: new Date(completedAt).toISOString() }
}

export async function releaseStatus(cwd: string, input: string[]): Promise<unknown> {
  if (input.length !== 2 || input[0] !== '--config') throw new TypeError('Usage: release:status --config /private/release-status.json')
  const selected = config(privateJson(text(input[1])))
  const [releaseStage, imageStage, backendStage, pagesStage, acceptanceStage] = await Promise.all([
    stage('native', () => release(cwd, selected)), stage('native', () => image(cwd, selected)), stage('native', () => backend(cwd, selected)),
    stage('live', () => pages(selected)), stage('saved', () => acceptance(selected)),
  ])
  return { kind: 'release-status', candidateSha: selected.candidateSha, observedAt: new Date().toISOString(),
    stages: { release: releaseStage, image: imageStage, backend: backendStage, pages: pagesStage, acceptance: acceptanceStage } }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await releaseStatus(process.cwd(), process.argv.slice(2)))) }
  catch { console.error(JSON.stringify({ kind: 'release-status', error: 'invalid-private-configuration' })); process.exitCode = 1 }
}
