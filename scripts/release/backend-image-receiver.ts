import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, constants, copyFileSync, existsSync, lstatSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
import { freemem } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertNativeImageIntake, imageIntakeProperties, parseImageImportBudget } from '../image-intake.ts'
import { fullSha } from '../ci/verification-tasks.ts'
import { assertExpectedContainerImage, parseContainerImageTransfer } from './container-images.ts'
import { inspectLoadedContainerImage, loadContainerImageArchive, nativeContainerImageId } from './container-images-archive.ts'

export const BACKEND_IMAGE_QUEUE_WAIT_MS = 30 * 60_000
export const BACKEND_IMAGE_INTAKE_WORK_MS = 20 * 60_000
export const BACKEND_IMAGE_MAINTENANCE_WORK_MS = 40 * 60_000
export const BACKEND_IMAGE_CLEANUP_MS = 5 * 60_000
export const BACKEND_IMAGE_INTAKE_OWNER_TIMEOUT_MS = BACKEND_IMAGE_QUEUE_WAIT_MS + BACKEND_IMAGE_INTAKE_WORK_MS + BACKEND_IMAGE_CLEANUP_MS + 60_000
export const BACKEND_IMAGE_MAINTENANCE_OWNER_TIMEOUT_MS = BACKEND_IMAGE_QUEUE_WAIT_MS + BACKEND_IMAGE_MAINTENANCE_WORK_MS + BACKEND_IMAGE_CLEANUP_MS + 60_000

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid formal image input')
  return Object.fromEntries(Object.entries(value))
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Missing formal image identity')
  return value
}
function ownerPath(path: string, directory: boolean, maxBytes = 256 * 1024): void {
  if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) throw new Error('Formal image paths must be absolute and contain no aliases')
  const info = lstatSync(path)
  if (info.uid !== process.getuid?.() || info.mode & 0o077
    || (directory ? !info.isDirectory() : !info.isFile() || info.nlink !== 1 || info.size > maxBytes)) throw new Error('Formal image input must be an owner-private regular file or directory')
}
export function parseBackendImportBudget(value: unknown) {
  const input = object(value)
  if (input.format !== 1 || Object.keys(input).sort().join(',') !== 'diskMiB,format,import,reserveMemoryMiB') throw new Error('Expected a format 1 formal import resource budget')
  return { format: 1, ...parseImageImportBudget(input) }
}
export function readBackendImportBudget(path: string) {
  ownerPath(path, false)
  return parseBackendImportBudget(JSON.parse(readFileSync(path, 'utf8')))
}

export function parseBackendInstallation(value: unknown): { kind: 'upgrade' } | { kind: 'bootstrap'; caddyImage: string } {
  if (value === undefined) return { kind: 'upgrade' }
  const input = object(value)
  if (input.kind === 'upgrade' && Object.keys(input).join(',') === 'kind') return { kind: 'upgrade' }
  if (input.kind === 'bootstrap' && Object.keys(input).sort().join(',') === 'caddyImage,kind'
    && typeof input.caddyImage === 'string' && /^caddy@sha256:[a-f0-9]{64}$/.test(input.caddyImage)) return { kind: 'bootstrap', caddyImage: input.caddyImage }
  throw new Error('Expected an upgrade or explicit bootstrap with an immutable preloaded Caddy digest')
}

function parseBackendImageRequest(path: string) {
  ownerPath(path, false)
  const input = object(JSON.parse(readFileSync(path, 'utf8'))), operationId = text(input.operationId)
  if (input.format !== 1 || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(operationId)) throw new Error('Invalid formal image operation')
  const directory = text(input.directory), stage = text(input.stage)
  if (!isAbsolute(directory) || resolve(directory) !== directory || directory === '/' || realpathSync(directory) !== directory
    || stage !== join(directory, 'backups', `.backend-image-${operationId}`) || dirname(path) !== stage) throw new Error('Formal image input belongs to another target')
  ownerPath(stage, true)
  const sourceSha = fullSha(text(input.sourceSha)), producerSha = fullSha(text(input.producerSha))
  const transfer = parseContainerImageTransfer(input.transfer), receipt = transfer.receipt
  if (receipt.purpose !== 'formal-candidate') throw new Error('Formal deployment requires a formal-candidate image')
  assertExpectedContainerImage(receipt, { purpose: 'formal-candidate', sourceSha, producerSha })
  if (typeof input.expiresAt !== 'number' || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0) throw new Error('Formal image authorization is invalid')
  return { format: 1, operationId, directory, stage, sourceSha, producerSha, expiresAt: input.expiresAt,
    installation: parseBackendInstallation(input.installation), budget: parseBackendImportBudget(input.budget), transfer: { ...transfer, receipt } }
}

export function readBackendImageRequest(path: string) {
  const request = parseBackendImageRequest(path), now = Date.now()
  if (request.expiresAt <= now || request.expiresAt > now + 600_000) throw new Error('Formal image authorization is expired or invalid')
  return request
}

export type BackendImageRequest = ReturnType<typeof parseBackendImageRequest>
export type BackendImageTarget = Pick<BackendImageRequest, 'directory' | 'sourceSha' | 'producerSha'>
type OperationKind = 'intake' | 'maintenance'
const binding = ({ expiresAt: _expiresAt, ...request }: BackendImageRequest): string => createHash('sha256').update(JSON.stringify(request)).digest('hex')
const operationPath = (request: BackendImageRequest, kind: OperationKind) => join(request.stage, `${kind}-admission.json`)
const workBudget = (kind: OperationKind) => kind === 'intake' ? BACKEND_IMAGE_INTAKE_WORK_MS : BACKEND_IMAGE_MAINTENANCE_WORK_MS
function target(request: BackendImageRequest, expected?: BackendImageTarget): void {
  if (expected && (request.directory !== expected.directory || request.sourceSha !== expected.sourceSha || request.producerSha !== expected.producerSha)) throw new Error('Formal image request differs from the owner target')
}
function privateObject(path: string): Record<string, unknown> {
  ownerPath(path, false)
  return object(JSON.parse(readFileSync(path, 'utf8')))
}
function positiveTime(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid formal image operation clock')
  return value
}
function newRecord(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600, flush: true })
}
function replaceRecord(path: string, value: unknown): void {
  const temporary = `${path}.${randomUUID()}.tmp`
  try { newRecord(temporary, value); renameSync(temporary, path) }
  finally { rmSync(temporary, { force: true }) }
}
function admission(request: BackendImageRequest, kind: OperationKind) {
  const input = privateObject(operationPath(request, kind)), now = Date.now()
  const admittedAt = positiveTime(input.admittedAt), queueUntil = positiveTime(input.queueUntil)
  if (input.format !== 1 || input.kind !== kind || input.bindingSha256 !== binding(request) || input.authorizedUntil !== request.expiresAt
    || admittedAt > now || admittedAt >= request.expiresAt || request.expiresAt > admittedAt + 600_000
    || queueUntil !== admittedAt + BACKEND_IMAGE_QUEUE_WAIT_MS) throw new Error('Formal image admission differs from the original owner request')
  const base = { format: 1, kind, bindingSha256: binding(request), authorizedUntil: request.expiresAt, admittedAt, queueUntil }
  if (input.phase === 'queued') return { ...base, phase: 'queued' as const }
  if (input.phase !== 'running') throw new Error('Formal image operation is not admitted')
  const startedAt = positiveTime(input.startedAt), workDeadline = positiveTime(input.workDeadline)
  if (startedAt < admittedAt || startedAt > queueUntil || workDeadline !== startedAt + workBudget(kind)) throw new Error('Formal image operation deadline differs from its admission')
  return { ...base, phase: 'running' as const, startedAt, workDeadline }
}
export function admitBackendImageOperation(path: string, kind: OperationKind, expected?: BackendImageTarget): BackendImageRequest {
  const request = readBackendImageRequest(path), admittedAt = Date.now()
  target(request, expected)
  if (admittedAt >= request.expiresAt) throw new Error('Formal image authorization expired before admission')
  newRecord(operationPath(request, kind), { format: 1, kind, phase: 'queued', bindingSha256: binding(request), authorizedUntil: request.expiresAt,
    admittedAt, queueUntil: admittedAt + BACKEND_IMAGE_QUEUE_WAIT_MS })
  return request
}
export function startBackendImageOperation(path: string, action: { kind: 'intake' } | { kind: 'maintenance'; target: BackendImageTarget; operationId: string }) {
  const kind = action.kind, request = parseBackendImageRequest(path)
  if (action.kind === 'maintenance') {
    target(request, action.target)
    if (action.operationId !== request.operationId) throw new Error('Backend maintenance requires its operation lock')
  }
  const queued = admission(request, kind), startedAt = Date.now()
  if (queued.phase !== 'queued' || startedAt > queued.queueUntil) throw new Error('Formal image queue admission expired or already started')
  const running = { ...queued, phase: 'running' as const, startedAt, workDeadline: startedAt + workBudget(kind) }
  replaceRecord(operationPath(request, kind), running)
  return { request, ...running }
}
export function readBackendImageOperation(path: string, kind: OperationKind) {
  const request = parseBackendImageRequest(path), running = admission(request, kind)
  if (running.phase !== 'running' || Date.now() > running.workDeadline) throw new Error('Formal image operation is not running or its deadline expired')
  return { request, ...running }
}

const unitName = (request: BackendImageRequest): string => `oa-formal-image-intake-${createHash('sha256').update(request.directory).digest('hex').slice(0, 16)}-${request.operationId}.service`

function docker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
export function pinBackendDocker(stage: string, runDocker: (args: string[]) => string = docker): () => void {
  const context: unknown = JSON.parse(runDocker(['context', 'inspect']))
  if (!Array.isArray(context) || context.length !== 1) throw new Error('Expected one native Docker context')
  const endpoint = object(object(object(context[0]).Endpoints).docker), socket = endpoint.Host
  if (typeof socket !== 'string' || !/^unix:\/\/\/[A-Za-z0-9_./-]+$/.test(socket)
    || process.env.DOCKER_HOST && process.env.DOCKER_HOST !== socket) throw new Error('Formal image import requires a local Unix Docker daemon')
  const config = mkdtempSync(join(stage, 'docker-config-'))
  const previous = { DOCKER_HOST: process.env.DOCKER_HOST, DOCKER_CONTEXT: process.env.DOCKER_CONTEXT, DOCKER_CONFIG: process.env.DOCKER_CONFIG }
  process.env.DOCKER_HOST = socket; delete process.env.DOCKER_CONTEXT; process.env.DOCKER_CONFIG = config
  return () => {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
    rmSync(config, { recursive: true, force: true })
  }
}
function requireMemory(request: BackendImageRequest): void {
  const required = (request.budget.reserveMemoryMiB + request.budget.import.memoryHeadroomMiB) * 1024 * 1024
  if (freemem() < required) throw new Error('Formal image intake would cross the configured host memory reserve')
}
function requireDisk(request: BackendImageRequest, dockerRoot: string): void {
  const staging = statfsSync(request.stage), storage = statfsSync(dockerRoot), sameDevice = statSync(request.stage).dev === statSync(dockerRoot).dev
  const reserve = request.budget.diskMiB * 1024 * 1024, bytes = request.transfer.archive.bytes
  if (staging.bavail * staging.bsize < reserve + bytes * (sameDevice ? 4 : 2)
    || !sameDevice && storage.bavail * storage.bsize < reserve + bytes * 2) throw new Error('Formal image staging or Docker data device lacks conservative disk headroom')
}

function nativeInfo(): { dockerRoot: string } {
  const info = object(JSON.parse(docker(['info', '--format', '{{json .}}'])))
  if (info.OSType !== 'linux' || !['amd64', 'x86_64'].includes(String(info.Architecture)) || typeof info.DockerRootDir !== 'string'
    || !isAbsolute(info.DockerRootDir) || realpathSync(info.DockerRootDir) !== info.DockerRootDir) throw new Error('Formal images require a native Linux AMD64 Docker daemon')
  return { dockerRoot: info.DockerRootDir }
}
const transferPath = (request: BackendImageRequest) => join(request.stage, 'transfer-preflight.json')
function transferProof(request: BackendImageRequest) {
  const proof = privateObject(transferPath(request)), checkedAt = positiveTime(proof.checkedAt), cleanupUntil = positiveTime(proof.cleanupUntil), now = Date.now()
  if (proof.format !== 1 || proof.bindingSha256 !== binding(request) || cleanupUntil !== checkedAt + 30 * 60_000
    || checkedAt > now || now > cleanupUntil) throw new Error('Transfer cleanup window expired or differs from its preflight')
  return { checkedAt, cleanupUntil }
}
export function preflightBackendImageTransfer(path: string, expected: BackendImageTarget): void {
  const request = readBackendImageRequest(path)
  target(request, expected)
  if (['image.tar', 'image.json', 'intake-admission.json', 'maintenance-admission.json'].some(name => existsSync(join(request.stage, name)))) throw new Error('Transfer preflight must precede the archive and operation admission')
  const unpin = pinBackendDocker(request.stage)
  try { requireDisk(request, nativeInfo().dockerRoot) } finally { unpin() }
  if (existsSync(transferPath(request))) {
    transferProof(request)
    return
  }
  const checkedAt = Date.now()
  newRecord(transferPath(request), { format: 1, bindingSha256: binding(request), checkedAt, cleanupUntil: checkedAt + 30 * 60_000 })
}
export function discardBackendImageTransfer(path: string, expected: BackendImageTarget): { removedBytes: number } {
  const request = parseBackendImageRequest(path)
  target(request, expected)
  transferProof(request)
  if (['image.json', 'maintenance-admission.json', 'source.json', 'maintenance.compose.json', 'empty-storage.json'].some(name => existsSync(join(request.stage, name)))) throw new Error('Transfer has active or accepted operation evidence')
  const claim = operationPath(request, 'intake')
  if (existsSync(claim)) {
    const previous = privateObject(claim)
    if (previous.format !== 1 || previous.kind !== 'intake' || previous.phase !== 'discarded' || previous.bindingSha256 !== binding(request)) throw new Error('Transfer intake is already admitted')
  } else newRecord(claim, { format: 1, kind: 'intake', phase: 'discarded', bindingSha256: binding(request), discardedAt: Date.now() })
  const archive = join(request.stage, 'image.tar')
  if (!existsSync(archive)) return { removedBytes: 0 }
  const info = lstatSync(archive)
  if (!info.isFile() || info.uid !== process.getuid?.() || info.nlink !== 1) throw new Error('Partial transfer must be an owner-owned regular file')
  rmSync(archive)
  return { removedBytes: info.size }
}

export function receiveBackendImage(path: string): string {
  const { request } = readBackendImageOperation(path, 'intake')
  assertNativeImageIntake(unitName(request), request.budget.import.intake)
  const unpin = pinBackendDocker(request.stage)
  let snapshot: string | undefined
  try {
    const { dockerRoot } = nativeInfo()
    requireMemory(request); requireDisk(request, dockerRoot)
    const archive = join(request.stage, 'image.tar'), maxBytes = request.budget.import.maxArchiveMiB * 1024 * 1024
    ownerPath(archive, false, maxBytes)
    if (lstatSync(archive).size !== request.transfer.archive.bytes) throw new Error('Image transfer is incomplete')
    snapshot = join(request.stage, `${randomUUID()}.snapshot.tar`)
    copyFileSync(archive, snapshot, constants.COPYFILE_EXCL); chmodSync(snapshot, 0o400)
    const loaded = loadContainerImageArchive({ archivePath: snapshot, transfer: request.transfer,
      expected: { purpose: 'formal-candidate', sourceSha: request.sourceSha, producerSha: request.producerSha }, maxBytes })
    writeFileSync(join(request.stage, 'image.json'), JSON.stringify({ format: 1, bindingSha256: binding(request),
      sourceSha: request.sourceSha, producerSha: request.producerSha, nativeImageId: loaded.nativeImageId,
      archiveManifestDigest: loaded.archiveManifestDigest, imageId: request.transfer.receipt.imageId }) + '\n', { mode: 0o600, flag: 'wx', flush: true })
    return loaded.nativeImageId
  } finally {
    if (snapshot) rmSync(snapshot, { force: true })
    unpin()
  }
}

export function verifyReceivedBackendImage(path: string, expected: BackendImageTarget, admitted?: 'maintenance', runDocker?: (args: string[]) => string): string {
  const request = admitted ? readBackendImageOperation(path, admitted).request : readBackendImageRequest(path), reportPath = join(request.stage, 'image.json')
  if (request.directory !== expected.directory || request.sourceSha !== expected.sourceSha || request.producerSha !== expected.producerSha) throw new Error('Imported formal image does not match the owner deployment target')
  ownerPath(reportPath, false)
  const report = object(JSON.parse(readFileSync(reportPath, 'utf8')))
  if (report.format !== 1 || report.bindingSha256 !== binding(request) || report.sourceSha !== request.sourceSha
    || report.producerSha !== request.producerSha || report.imageId !== request.transfer.receipt.imageId
    || report.archiveManifestDigest !== null && (typeof report.archiveManifestDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(report.archiveManifestDigest))) throw new Error('Imported formal image belongs to another input or operation')
  const unpin = pinBackendDocker(request.stage, runDocker)
  try {
    requireMemory(request)
    const id = nativeContainerImageId({ configDigest: request.transfer.receipt.imageId, manifestDigest: report.archiveManifestDigest }, runDocker)
    if (id !== report.nativeImageId) throw new Error('Formal image store changed after intake')
    return inspectLoadedContainerImage({ imageId: id, expected: { purpose: 'formal-candidate', sourceSha: request.sourceSha, producerSha: request.producerSha } }, runDocker)
  } finally { unpin() }
}

function runAdmittedBackendImageIntake(path: string): string {
  const operation = readBackendImageOperation(path, 'intake'), request = operation.request
  const remaining = Math.min(BACKEND_IMAGE_INTAKE_WORK_MS, operation.workDeadline - Date.now())
  if (remaining <= 0) throw new Error('Formal image intake work deadline expired')
  const environment = ['PATH', 'HOME', 'USER', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']
    .flatMap(name => process.env[name] === undefined ? [] : [`--setenv=${name}=${process.env[name]}`])
  const properties = imageIntakeProperties(request.budget.import.intake).map(property => property.startsWith('--property=RuntimeMaxSec=')
    ? `--property=RuntimeMaxSec=${Math.max(1, Math.floor(remaining / 1000))}` : property)
  const result = spawnSync('systemd-run', ['--user', '--quiet', '--wait', '--pipe', '--collect', '--service-type=exec',
    `--unit=${unitName(request)}`, `--working-directory=${resolve(import.meta.dirname, '../..')}`,
    ...properties, ...environment, '--', 'setsid', '--wait', process.execPath, fileURLToPath(import.meta.url), '_locked', path],
    { input: '', encoding: 'utf8', timeout: remaining + BACKEND_IMAGE_CLEANUP_MS, maxBuffer: 2 * 1024 * 1024 })
  if (result.status !== 0 || result.error) throw new Error(`Bounded formal image intake failed; private inputs remain at ${request.stage}${result.stderr ? `\n${result.stderr.trim()}` : ''}`)
  const id = result.stdout.trim()
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error('Formal image intake returned no immutable image identity')
  return id
}
export function runBackendImageIntake(path: string): string {
  const request = admitBackendImageOperation(path, 'intake')
  const result = spawnSync('flock', ['-w', String(BACKEND_IMAGE_QUEUE_WAIT_MS / 1000), join(request.directory, 'backups/.maintenance.lock'),
    process.execPath, fileURLToPath(import.meta.url), '_admitted', path],
    { input: '', encoding: 'utf8', timeout: BACKEND_IMAGE_INTAKE_OWNER_TIMEOUT_MS - 60_000, maxBuffer: 2 * 1024 * 1024 })
  if (result.status !== 0 || result.error) throw new Error(`Formal image intake failed; private inputs remain at ${request.stage}${result.stderr ? `\n${result.stderr.trim()}` : ''}`)
  const id = result.stdout.trim()
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error('Formal image intake returned no immutable image identity')
  return id
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, path, directory, sourceSha, producerSha] = process.argv.slice(2)
    if (!path) throw new Error('Usage: backend-image-receiver.ts receive|check|_locked <private-request.json>')
    if ((mode === 'preflight' || mode === 'discard-transfer') && directory && sourceSha && producerSha) {
      const expected = { directory, sourceSha, producerSha }
      if (mode === 'preflight') { preflightBackendImageTransfer(path, expected); process.stdout.write('Transfer preflight accepted\n') }
      else process.stdout.write(JSON.stringify(discardBackendImageTransfer(path, expected)) + '\n')
    } else {
      if (mode === '_admitted') startBackendImageOperation(path, { kind: 'intake' })
      const id = mode === 'receive' ? runBackendImageIntake(path) : mode === 'check' && directory && sourceSha && producerSha ? verifyReceivedBackendImage(path, { directory, sourceSha, producerSha })
        : mode === '_admitted' ? runAdmittedBackendImageIntake(path) : mode === '_locked' ? receiveBackendImage(path) : undefined
      if (!id) throw new Error('Unknown formal image intake action')
      process.stdout.write(id + '\n')
    }
  } catch (error) { console.error(error instanceof Error ? error.message : 'Formal image intake failed'); process.exitCode = 1 }
}
