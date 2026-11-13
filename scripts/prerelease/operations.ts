import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertScopedPaths, loadPrereleaseEnvironment, parsePrereleaseTarget, targetFingerprint } from './config'
import { checkPrereleaseVerification } from '../ci/prerelease-verification'
import { FULL_TASK_IDS } from '../ci/verification-tasks'
import { ownerMachine, RELEASE_REPOSITORY } from '../release/candidate'
import { runPrereleaseOperation, type OperationRequest } from './flow'
import { controlDirectory, gatewayAlias } from './runtime'
import { parseImageImportRequest, runImageImport } from './image-import'
import { assertExpectedContainerImage, verifyContainerImageBuild } from '../release/container-images.ts'
import { prepareContainerImageArchive } from '../release/container-images-owner.ts'
import { runBoundedImageImport } from './image-import-limits'

export function prerequisitePlan(configFile: string) {
  const raw: unknown = JSON.parse(readFileSync(configFile, 'utf8'))
  const target = parsePrereleaseTarget(raw)
  loadPrereleaseEnvironment(target)
  return { target, summary: { channel: target.channel, targetId: target.targetId, origin: target.origin,
    project: target.project, database: target.database.name, bucket: target.objects.bucket,
    ...(target.proxyNetwork ? { proxyUpstream: `${gatewayAlias(target)}:5176` } : {}),
    retentionDays: 7, fingerprint: targetFingerprint(target) } }
}

const policyRoot = resolve(import.meta.dirname, '../..')
const policySha = (directory: string) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: directory, encoding: 'utf8' }).trim()
const shell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid owner operation envelope')
  return Object.fromEntries(Object.entries(value))
}

function verifyReceipt(value: unknown, buildId: string | undefined): void {
  if (!buildId || !/^[a-f0-9]{40}$/.test(buildId)) throw new Error('A complete fixed-SHA candidate receipt is required')
  const receipt = object(value)
  const tasks = receipt.tasks
  if (receipt.status !== 'passed' || receipt.channel !== 'prerelease' || receipt.repository !== RELEASE_REPOSITORY || receipt.sha !== buildId
    || typeof receipt.configuration !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.configuration)
    || typeof receipt.producerConfiguration !== 'string' || !/^[a-f0-9]{64}$/.test(receipt.producerConfiguration) || !Array.isArray(tasks)
    || tasks.length !== FULL_TASK_IDS.length || FULL_TASK_IDS.some(id => !tasks.some(task => {
      const row = object(task)
      return row.id === id && row.status === 'passed' && typeof row.runId === 'number' && row.runId > 0 && typeof row.jobId === 'number' && row.jobId > 0
    }))) throw new Error('A complete same-channel fixed-candidate GitHub receipt is required')
}

function parseRequest(value: unknown): OperationRequest {
  const input = object(value)
  const actions = ['initialize', 'status', 'maintain', 'backup', 'budget-check', 'retention', 'deploy', 'reset', 'reinitialize', 'finish-close', 'open', 'identities', 'apply-identities', 'restore', 'activate-recovery', 'verify-access', 'verify-formal-browser', 'reverify']
  if (typeof input.action !== 'string' || !actions.includes(input.action) || typeof input.expectedCurrent !== 'string'
    || !/^(empty|[a-f0-9]{40})$/.test(input.expectedCurrent)) throw new Error('Explicit operation and expected-current SHA are required')
  const optional = (key: string): string | undefined => {
    const entry = input[key]
    if (entry === undefined) return undefined
    if (typeof entry !== 'string' || !entry) throw new Error('Invalid owner operation argument')
    return entry
  }
  return { action: input.action, expectedCurrent: input.expectedCurrent, buildId: optional('buildId'), generation: optional('generation'),
    acceptLoss: optional('acceptLoss'), operationId: optional('operationId'), acceptanceFile: optional('acceptanceFile'), authorityFile: optional('authorityFile'), retirementFile: optional('retirementFile'),
    associationsFile: optional('associationsFile'), auditFile: optional('auditFile'), verificationFile: optional('verificationFile'), backupStem: optional('backupStem'),
    backupGeneration: optional('backupGeneration'), expectedSourceCurrent: optional('expectedSourceCurrent'), sourceTarget: input.sourceTarget === undefined ? undefined : parsePrereleaseTarget(input.sourceTarget) }
}

async function inputEnvelope(): Promise<Record<string, unknown>> {
  let input = ''
  for await (const chunk of process.stdin) {
    input += String(chunk)
    if (input.length > 256 * 1024) throw new Error('Owner envelope is too large')
  }
  return object(JSON.parse(input))
}

export async function operations(args: string[]): Promise<void> {
  if (args[0] === 'receive' || args[0] === '_locked') {
    ownerMachine()
    const input = await inputEnvelope()
    const target = parsePrereleaseTarget(input.target)
    const imageImport = ['prepare-image-import', 'import-image'].includes(String(object(input.request).action))
    const request = imageImport ? parseImageImportRequest(input.request) : parseRequest(input.request)
    if (input.policySha !== policySha(target.policyDirectory) || typeof input.expiresAt !== 'number' || input.expiresAt <= Date.now()
      || input.expiresAt > Date.now() + 10 * 60_000 || input.fingerprint !== targetFingerprint(target)) throw new Error('Owner envelope is expired or bound to a different policy/target')
    if (args[0] === 'receive' && !process.env.SSH_CONNECTION) throw new Error('Remote application requires the owner SSH transport')
    if (args[0] === '_locked' && process.env.PRERELEASE_LOCK_SCOPE !== targetFingerprint(target)) throw new Error('Prerelease operation lock is missing')
    assertScopedPaths(target)
    if (!imageImport && request.action !== 'retention') loadPrereleaseEnvironment(target)
    if ('buildId' in request && (request.action === 'deploy' || request.action === 'open' || request.action === 'restore')) verifyReceipt(input.receipt, request.buildId)
    if (args[0] === 'receive') { process.stdout.write(locked(target, input)); return }
    process.stdout.write(JSON.stringify('transfer' in request ? runImageImport(target, request) : await runPrereleaseOperation(target, request)) + '\n')
    return
  }
  const values = new Map<string, string>()
  const flags = ['--config', '--expected-current', '--sha', '--generation', '--accept-loss', '--operation-id', '--acceptance', '--authority-receipt', '--retirement-receipt', '--ssh', '--associations', '--audit', '--verification', '--source-config', '--expected-source-current', '--backup', '--backup-generation', '--purpose', '--build-run', '--build-attempt', '--artifact-id', '--auth-file']
  for (let index = 1; index < args.length; index += 2) {
    if (!flags.includes(args[index]) || !args[index + 1] || values.has(args[index])) throw new Error('Unknown, duplicate or incomplete owner option')
    values.set(args[index], args[index + 1])
  }
  const config = values.get('--config')
  if (!config) throw new Error('Use --config <owner-target.json>')
  const target = parsePrereleaseTarget(JSON.parse(readFileSync(config, 'utf8')))
  if (args[0] === 'plan') {
    process.stdout.write(JSON.stringify(prerequisitePlan(config).summary) + '\n'); return
  }
  ownerMachine()
  if (args[0] === 'import-image') return ownerImport(target, values)
  const request = parseRequest({ action: args[0], expectedCurrent: values.get('--expected-current'), buildId: values.get('--sha'), generation: values.get('--generation'),
    acceptLoss: values.get('--accept-loss'), operationId: values.get('--operation-id'), acceptanceFile: values.get('--acceptance'), authorityFile: values.get('--authority-receipt'), retirementFile: values.get('--retirement-receipt'),
    associationsFile: values.get('--associations'), auditFile: values.get('--audit'), verificationFile: values.get('--verification'), backupStem: values.get('--backup'),
    backupGeneration: values.get('--backup-generation'), expectedSourceCurrent: values.get('--expected-source-current'),
    sourceTarget: values.get('--source-config') ? JSON.parse(readFileSync(values.get('--source-config')!, 'utf8')) : undefined })
  const ssh = values.get('--ssh')
  if (!ssh && request.action !== 'retention') loadPrereleaseEnvironment(target)
  let receipt: unknown = null
  if (request.action === 'deploy' || request.action === 'open' || request.action === 'restore') {
    if (!request.buildId || !/^[a-f0-9]{40}$/.test(request.buildId)) throw new Error('A fixed full candidate SHA is required')
    receipt = checkPrereleaseVerification(policyRoot, RELEASE_REPOSITORY, request.buildId)
    verifyReceipt(receipt, request.buildId)
  }
  const envelope = { format: 1, policySha: policySha(policyRoot), expiresAt: Date.now() + 5 * 60_000, fingerprint: targetFingerprint(target), target, request, receipt }
  process.stdout.write(sendEnvelope(target, envelope, ssh))
}

function sendEnvelope(target: ReturnType<typeof parsePrereleaseTarget>, envelope: Record<string, unknown>, ssh?: string): string {
  if (!ssh) return locked(target, envelope)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9@_.-]*$/.test(ssh)) throw new Error('Invalid owner SSH host')
  const remote = `cd ${shell(target.policyDirectory)} && exec node --import tsx scripts/prerelease/operations.ts receive`
  const result = spawnSync('ssh', ['-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2', ssh, remote],
    { input: JSON.stringify(envelope), encoding: 'utf8', timeout: 60 * 60_000, stdio: ['pipe', 'pipe', 'pipe'] })
  if (result.status !== 0 || result.error) throw new Error('Remote prerelease operation failed; read the scoped maintenance or image-import record')
  return result.stdout
}

async function ownerImport(target: ReturnType<typeof parsePrereleaseTarget>, values: Map<string, string>): Promise<void> {
  const purpose = values.get('--purpose'), sourceSha = values.get('--sha'), authFile = values.get('--auth-file')
  const operationId = values.get('--operation-id'), expectedCurrent = values.get('--expected-current'), ssh = values.get('--ssh')
  if (purpose !== 'candidate' && purpose !== 'trusted-policy' || !sourceSha || !/^[a-f0-9]{40}$/.test(sourceSha) || !authFile
    || !operationId || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(operationId)
    || !expectedCurrent || !/^(empty|[a-f0-9]{40})$/.test(expectedCurrent)
    || ssh && !/^[a-zA-Z0-9][a-zA-Z0-9@_.-]*$/.test(ssh)) throw new Error('Image import requires purpose, fixed SHA, private auth file, operation UUID and expected-current SHA')
  const number = (flag: string): number => {
    const raw = values.get(flag), value = Number(raw)
    if (!raw || !/^[1-9][0-9]*$/.test(raw) || !Number.isSafeInteger(value)) throw new Error('Image import requires explicit build run, attempt and artifact IDs')
    return value
  }
  const receipt = verifyContainerImageBuild({ cwd: policyRoot, runId: number('--build-run'), runAttempt: number('--build-attempt'), artifactId: number('--artifact-id') })
  const producerSha = policySha(policyRoot)
  assertExpectedContainerImage(receipt, { purpose, sourceSha, producerSha })
  const directory = mkdtempSync(join(tmpdir(), 'oa-owner-image-import-'))
  try {
    const prepared = await prepareContainerImageArchive({ receipt, authFile: resolve(authFile), directory, maxBytes: target.budgets.import.maxArchiveMiB * 1024 * 1024 })
    const envelope = (action: 'prepare-image-import' | 'import-image') => ({ format: 1, policySha: producerSha,
      expiresAt: Date.now() + 5 * 60_000, fingerprint: targetFingerprint(target), target,
      request: { action, expectedCurrent, operationId, transfer: prepared.transfer } })
    const staged = object(JSON.parse(sendEnvelope(target, envelope('prepare-image-import'), ssh)))
    const path = join(controlDirectory(target), `image-import-${operationId}.tar`)
    if (staged.archivePath !== path || staged.imageId !== receipt.imageId) throw new Error('Remote image staging identity differs')
    if (ssh) {
      const result = spawnSync('scp', ['-p', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2', '--', prepared.archivePath, `${ssh}:${path}`],
        { timeout: 30 * 60_000, stdio: ['ignore', 'ignore', 'pipe'] })
      if (result.status !== 0 || result.error) throw new Error('Image archive transfer failed; retry the original image operation')
    } else { copyFileSync(prepared.archivePath, path); chmodSync(path, 0o600) }
    process.stdout.write(sendEnvelope(target, envelope('import-image'), ssh))
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

function locked(target: ReturnType<typeof parsePrereleaseTarget>, envelope: Record<string, unknown>): string {
  assertScopedPaths(target)
  if (!['retention', 'prepare-image-import', 'import-image'].includes(String(object(envelope.request).action))) loadPrereleaseEnvironment(target)
  mkdirSync(controlDirectory(target), { recursive: true, mode: 0o700 })
  const request = object(envelope.request)
  const result = request.action === 'import-image' ? runBoundedImageImport(target, parseImageImportRequest(request).operationId, JSON.stringify(envelope))
    : spawnSync('flock', ['-w', '60', join(controlDirectory(target), '.operation.lock'), process.execPath, '--import', 'tsx',
    join(target.policyDirectory, 'scripts/prerelease/operations.ts'), '_locked'], { cwd: target.policyDirectory,
    env: { ...process.env, PRERELEASE_LOCK_SCOPE: targetFingerprint(target) }, encoding: 'utf8', input: JSON.stringify(envelope), timeout: 60 * 60_000 })
  if (result.status !== 0 || result.error) throw new Error(result.stderr?.trim() || result.error?.message || 'Scoped prerelease operation failed')
  return result.stdout
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await operations(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : 'Prerelease operation failed'); process.exitCode = 1 }
}
