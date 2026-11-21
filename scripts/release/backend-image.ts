import { execFileSync, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fullSha } from '../ci/verification-tasks.ts'
import { backendCandidate } from './backend-candidate.ts'
import { BACKEND_IMAGE_CLEANUP_MS, BACKEND_IMAGE_INTAKE_OWNER_TIMEOUT_MS, BACKEND_IMAGE_MAINTENANCE_OWNER_TIMEOUT_MS, parseBackendInstallation, readBackendImportBudget } from './backend-image-receiver.ts'
import { assertExpectedContainerImage, verifyContainerImageBuild } from '../ci/container-images.ts'
import { prepareContainerImageArchive } from './container-images-owner.ts'
import { BACKEND_RESUME_WORK_MS } from './backend-image-progress.ts'
import { ownerValidatorImage } from './owner-validator.ts'
// Storage tools load through a TypeScript resolver in child processes: this entry runs on plain Node.
import { typescriptLoaderArgs } from '../typescript-loader.ts'

const quote = (value: string): string => "'" + value.replaceAll("'", "'\\''") + "'"
// Tolerate about two minutes of silence on owner links before SSH gives up.
const SSH_OPTIONS = ['-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=8']
const sleep = (ms: number) => new Promise(done => setTimeout(done, ms))
/** SSH exits 255 for its own failures (lost or refused connection); an owner-side timeout kills the client. */
const connectionLost = (error: unknown): boolean => !!error && typeof error === 'object'
  && (('status' in error && error.status === 255) || ('signal' in error && error.signal === 'SIGTERM'))
function execute(command: string, args: string[], input?: string, timeout = 30_000): string {
  return execFileSync(command, args, { input, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }).trim()
}
/** execute() without blocking the event loop; failures carry the same status/signal fields. */
function executeAsync(command: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk }); child.stderr.on('data', chunk => { stderr += chunk })
    const timer = setTimeout(() => child.kill('SIGTERM'), timeout)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('close', (status, signal) => {
      clearTimeout(timer)
      if (status === 0) resolve(stdout.trim())
      else reject(Object.assign(new Error(`${command} failed`), { status, signal, stderr }))
    })
  })
}

export async function backendImageDeployment(cwd: string, arguments_: string[]): Promise<void> {
  if (arguments_[0] === 'status' || arguments_[0] === 'resume') {
    backendOperationCommand(cwd, arguments_)
    return
  }
  // ADR 0045: by default the owner machine validates the cutover when both images support it.
  const fullMaintenance = arguments_.includes('--full-maintenance'), input = arguments_.filter(value => value !== '--full-maintenance')
  const split = input.findIndex(value => value.startsWith('--')), positional = split < 0 ? input : input.slice(0, split)
  if (positional.length > 3) throw new Error('Usage: deploy-backend.sh [host] [ref] [remote-dir] --build-run N --build-attempt N --artifact-id N --auth-file FILE --import-budget FILE [--full-maintenance]')
  const sourceSha = backendCandidate(cwd, [positional[1] ?? 'main'])
  const flags = split < 0 ? [] : input.slice(split), selected = new Map<string, string>()
  const required = ['--build-run', '--build-attempt', '--artifact-id', '--auth-file', '--import-budget']
  const names = [...required, '--bootstrap-caddy-image']
  for (let index = 0; index < flags.length; index += 2) {
    const name = flags[index], value = flags[index + 1]
    if (!name || !names.includes(name) || !value || value.startsWith('--') || selected.has(name)) throw new Error('Invalid fixed formal image argument')
    selected.set(name, value)
  }
  if (required.some(name => !selected.has(name))) throw new Error('Fixed formal image evidence is required: --build-run, --build-attempt, --artifact-id, --auth-file and --import-budget')
  const installation = parseBackendInstallation(selected.has('--bootstrap-caddy-image') ? { kind: 'bootstrap', caddyImage: selected.get('--bootstrap-caddy-image') } : undefined)
  const integer = (name: string): number => {
    const value = selected.get(name) ?? ''
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid fixed formal image identifier')
    return Number(value)
  }
  const build = { cwd, runId: integer('--build-run'), runAttempt: integer('--build-attempt'), artifactId: integer('--artifact-id') }
  const budget = readBackendImportBudget(resolve(selected.get('--import-budget') ?? ''))
  let host = positional[0] ?? 'ubuntu@ten-kr'
  if (!host.includes('@')) host = `ubuntu@${host}`
  if (!/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/.test(host)) throw new Error('Invalid backend SSH host')
  const directory = positional[2] ?? '/home/ubuntu/open-agricola'
  if (!/^\/[A-Za-z0-9_./-]+$/.test(directory) || resolve(directory) !== directory || directory === '/') throw new Error('Expected a canonical backend directory')
  const receipt = verifyContainerImageBuild(build), producerSha = receipt.producerSha
  assertExpectedContainerImage(receipt, { purpose: 'formal-candidate', sourceSha, producerSha })
  if (execute('git', ['-C', cwd, 'rev-parse', 'HEAD']) !== producerSha
    || execute('git', ['-C', cwd, 'status', '--porcelain', '--untracked-files=no'])) throw new Error('Run formal image delivery from the clean, exact image producer checkout')
  // ADR 0047: the aarch64 owner validates on a same-source arm64 build. It is reused or built here, before the export
  // and any backend contact, so a missing validator stops the release while the old application still serves.
  const ownerValidation = !fullMaintenance && installation.kind !== 'bootstrap'
  const validatorImage = ownerValidation ? await ownerValidatorImage(sourceSha) : null
  const local = mkdtempSync(join(tmpdir(), 'oa-formal-image-')), operationId = randomUUID()
  const exported = await prepareContainerImageArchive({ receipt, authFile: resolve(selected.get('--auth-file') ?? ''), directory: local, maxBytes: budget.import.maxArchiveMiB * 1024 * 1024 })
  const stage = join(directory, 'backups', `.backend-image-${operationId}`)
  process.stderr.write(`Backend operation: ${operationId}\nOwner image evidence: ${local}\nStatus: ./deploy-backend.sh status ${host} ${sourceSha} ${directory} --operation-id ${operationId}\n`)
  const ssh = (args: string[], script?: string, timeout = 30_000): string => execute('ssh', [...SSH_OPTIONS, host, args.map(quote).join(' ')], script, timeout)
  const prepare = `set -euo pipefail
umask 077
export GIT_NO_REPLACE_OBJECTS=1
cd "$1"
[[ "$(pwd -P)" == "$1" ]] || { echo 'Backend directory contains an alias' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || { echo 'Tracked local edits must be resolved before deployment' >&2; exit 1; }
[[ -f data/postgres-cutover.validated ]] || { echo 'Complete and validate the PostgreSQL cutover before deployment' >&2; exit 1; }
for sha in "$2" "$3"; do
  git fetch origin "$sha" >&2
  [[ "$(git rev-parse 'FETCH_HEAD^{commit}')" == "$sha" ]] || { echo 'Fetched backend candidate mismatch' >&2; exit 1; }
done
mkdir -p backups
mkdir -m 700 "$4"
mkdir -m 700 "$4/policy"
git archive "$3" package.json scripts/ci scripts/release scripts/image-intake.ts scripts/backup-storage.sh scripts/backup-process.sh scripts/backup-files.mjs | tar -x -C "$4/policy"
printf '%s\\n' "$4"
`
  if (ssh(['bash', '-s', '--', directory, sourceSha, producerSha, stage], prepare, 120_000) !== stage) throw new Error('Backend returned another private image staging directory')
  const requestPath = join(local, 'request.json'), remoteRequest = join(stage, 'request.json')
  const request = { format: 1, operationId, directory, stage, sourceSha, producerSha, expiresAt: 0, installation, budget, transfer: exported.transfer }
  const authorize = (): void => {
    request.expiresAt = Date.now() + 300_000
    writeFileSync(requestPath, JSON.stringify(request) + '\n', { mode: 0o600, flush: true })
    execute('scp', [...SSH_OPTIONS, '-p', '--', requestPath, `${host}:${remoteRequest}`])
  }
  authorize()
  const receiver = join(stage, 'policy/scripts/release/backend-image-receiver.ts')
  const target = [remoteRequest, directory, sourceSha, producerSha]
  ssh(['node', receiver, 'preflight', ...target], undefined, 120_000)
  try { execute('scp', [...SSH_OPTIONS, '-p', '--', exported.archivePath, `${host}:${stage}/image.tar`], undefined, 20 * 60_000) }
  catch (error) {
    try { ssh(['node', receiver, 'discard-transfer', ...target], undefined, 120_000) }
    catch (cleanupError) { throw new AggregateError([error], `Formal image archive transfer failed and partial cleanup could not be confirmed; inspect ${stage}`, { cause: cleanupError }) }
    throw error
  }
  authorize()
  ssh(['node', receiver, 'receive', remoteRequest], undefined, BACKEND_IMAGE_INTAKE_OWNER_TIMEOUT_MS)
  if (backendCandidate(cwd, [sourceSha]) !== sourceSha || JSON.stringify(verifyContainerImageBuild(build)) !== JSON.stringify(receipt)) throw new Error('Formal image authority changed during transport')
  if (ownerValidation) {
    // A fresh basis keeps the cutover delta to the last few minutes of writes; it is optional. The pull
    // uses the same root and retention as the daily job (OWNER_BACKUP_ROOT, 30-day pruning).
    const warm = await new Promise<number | null>(done => spawn(process.execPath, [...typescriptLoaderArgs(), resolve(import.meta.dirname, '../owner-backup.ts'), 'pull', '--host', host, '--remote-dir', directory, '--attempts', '1'],
      { stdio: ['ignore', 'ignore', 'inherit'] }).once('close', done).once('error', () => done(null)))
    process.stderr.write(warm === 0 ? 'Owner-local Backup refreshed before the cutover\n' : 'Owner-local Backup warm-up skipped; the cutover pulls in full\n')
  }
  authorize()
  const env = ['env', `BACKEND_VALIDATION=${ownerValidation ? 'owner' : 'host'}`]
  if (process.env.ACCOUNT_REGISTRATION_POLICY) env.push(`ACCOUNT_REGISTRATION_POLICY=${process.env.ACCOUNT_REGISTRATION_POLICY}`)
  const finished = join(local, 'maintenance-finished')
  const owner = validatorImage ? new Promise<string>(done => {
    const child = spawn(process.execPath, [...typescriptLoaderArgs(), resolve(import.meta.dirname, 'owner-cutover.ts'), host, directory, stage, sourceSha, exported.transfer.receipt.imageId, validatorImage, operationId, finished],
      { stdio: ['ignore', 'pipe', 'inherit'] })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.once('close', status => done(status === 0 ? output.trim() : `{"outcome":"error","status":${status}}`))
  }) : Promise.resolve('{"outcome":"host"}')
  let result: string
  try {
    try { result = await executeAsync('ssh', [...SSH_OPTIONS, host, [...env, 'node', join(stage, 'policy/scripts/release/backend-image-maintenance.ts'), 'maintain', ...target].map(quote).join(' ')], BACKEND_IMAGE_MAINTENANCE_OWNER_TIMEOUT_MS) }
    catch (error) {
      // The backend keeps running without this session; follow its journal instead of reporting a failure.
      if (!connectionLost(error)) throw error
      process.stderr.write(`Owner SSH session ended during maintenance; following backend operation ${operationId}\n`)
      result = await followBackendOperation(cwd, { host, sourceSha, directory, operationId })
    }
  } finally {
    writeFileSync(finished, '', { mode: 0o600 })
    process.stderr.write(`Owner-local Validation: ${await owner}\n`)
  }
  process.stdout.write(result + `\nOwner image evidence: ${local}\n`)
}

type OperationTarget = { host: string; sourceSha: string; directory: string; operationId: string }

function operationContext(cwd: string, target: OperationTarget) {
  const { host, sourceSha, directory, operationId } = target
  if (!/^[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/.test(host) || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(operationId)
    || !/^\/[A-Za-z0-9_./-]+$/.test(directory) || resolve(directory) !== directory || directory === '/') throw new Error('Invalid backend operation target')
  const producerSha = fullSha(execute('git', ['-C', cwd, 'rev-parse', 'HEAD']))
  if (execute('git', ['-C', cwd, 'status', '--porcelain', '--untracked-files=no'])) throw new Error('Run backend operation commands from the clean exact producer checkout')
  const stage = join(directory, 'backups', `.backend-image-${operationId}`), path = join(stage, 'request.json')
  const controller = join(stage, 'policy/scripts/release/backend-image-maintenance.ts')
  const ssh = (args: string[], input?: string, timeout = 150_000) => execute('ssh', [...SSH_OPTIONS, host, args.map(quote).join(' ')], input, timeout)
  const statusCommand = `./deploy-backend.sh status ${host} ${sourceSha} ${directory} --operation-id ${operationId}`
  const parseStatus = (output: string, expectedBinding?: string) => {
    const value: unknown = JSON.parse(output)
    if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'backend-image-operation'
      || !('operationId' in value) || value.operationId !== operationId || !('sourceSha' in value) || value.sourceSha !== sourceSha
      || !('producerSha' in value) || value.producerSha !== producerSha || !('bindingSha256' in value)
      || typeof value.bindingSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.bindingSha256)
      || expectedBinding !== undefined && value.bindingSha256 !== expectedBinding
      || !('state' in value) || value.state !== 'running' && value.state !== 'resumable' && value.state !== 'accepted' && value.state !== 'blocked' && value.state !== 'unknown') {
      throw new Error('Backend returned another operation or invalid status')
    }
    return { state: value.state, bindingSha256: value.bindingSha256 }
  }
  const readStatus = () => {
    const output = ssh(['node', controller, 'status', path, directory, sourceSha, producerSha])
    return { output, ...parseStatus(output) }
  }
  const resume = (bindingSha256: string): string => {
    if (backendCandidate(cwd, [sourceSha]) !== sourceSha) throw new Error('Backend continuation candidate authority changed')
    const nonce = randomUUID(), now = Date.now(), authorizationPath = join(stage, `resume-${nonce}.json`)
    const authorization = { format: 1, nonce, operationId, bindingSha256, authorizedAt: now, expiresAt: now + BACKEND_RESUME_WORK_MS, workMs: BACKEND_RESUME_WORK_MS }
    const store = 'require("node:fs").writeFileSync(process.argv[1],require("node:fs").readFileSync(0),{flag:"wx",mode:0o600,flush:true})'
    ssh(['node', '-e', store, authorizationPath], JSON.stringify(authorization) + '\n', 30_000)
    const result = ssh(['node', controller, 'resume', path, directory, sourceSha, producerSha, authorizationPath], undefined, BACKEND_RESUME_WORK_MS + BACKEND_IMAGE_CLEANUP_MS + 60_000)
    const final = parseStatus(result, bindingSha256)
    if (final.state !== 'accepted') throw new Error(`Backend continuation is ${final.state}; acceptance was not confirmed`)
    return result
  }
  return { readStatus, resume, statusCommand }
}

function backendOperationCommand(cwd: string, input: string[]): void {
  const [mode, selectedHost, selectedSha, directory, flag, operationId] = input
  if (input.length !== 6 || !['status', 'resume'].includes(mode) || flag !== '--operation-id'
    || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(operationId ?? '')) throw new Error('Usage: deploy-backend.sh status|resume <host> <full-sha> <remote-dir> --operation-id <UUID>')
  const host = selectedHost.includes('@') ? selectedHost : `ubuntu@${selectedHost}`
  const operation = operationContext(cwd, { host, sourceSha: fullSha(selectedSha), directory, operationId })
  const status = operation.readStatus()
  if (mode === 'status') { process.stdout.write(status.output + '\n'); return }
  if (status.state !== 'resumable' && status.state !== 'accepted') throw new Error(`Backend operation is ${String(status.state)}; inspect its status before continuing`)
  process.stdout.write(operation.resume(status.bindingSha256) + '\n')
}

/**
 * After the owner SSH session ends mid-maintenance, polls the backend journal until it accepts, continues a resumable
 * operation once the link returns, and stops on blocked/unknown or when the backend stays unreachable past the deadline.
 */
export async function followBackendOperation(cwd: string, target: OperationTarget,
  options: { pollMs?: number; deadlineMs?: number } = {}): Promise<string> {
  const pollMs = options.pollMs ?? 30_000, deadline = Date.now() + (options.deadlineMs ?? BACKEND_IMAGE_MAINTENANCE_OWNER_TIMEOUT_MS)
  const operation = operationContext(cwd, target)
  for (;;) {
    let status: ReturnType<typeof operation.readStatus> | undefined
    try { status = operation.readStatus() } catch (error) { if (!connectionLost(error)) throw error }
    if (status?.state === 'accepted') return status.output
    if (status?.state === 'resumable') return operation.resume(status.bindingSha256)
    if (status && status.state !== 'running') throw new Error(`Backend operation is ${status.state}; inspect it with ${operation.statusCommand}`)
    if (Date.now() >= deadline) throw new Error(`Backend operation is ${status ? 'still running' : 'unreachable'} after the owner deadline; inspect it with ${operation.statusCommand}`)
    await sleep(pollMs)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  backendImageDeployment(process.cwd(), process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : 'Formal image deployment failed')
    process.exitCode = 1
  })
}
