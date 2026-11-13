import { execFileSync, spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, constants, copyFileSync, lstatSync, mkdtempSync, readFileSync, realpathSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
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

export function readBackendImageRequest(path: string) {
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
  if (typeof input.expiresAt !== 'number' || !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= Date.now()
    || input.expiresAt > Date.now() + 300_000) throw new Error('Formal image authorization is expired or invalid')
  return { format: 1, operationId, directory, stage, sourceSha, producerSha, expiresAt: input.expiresAt,
    installation: parseBackendInstallation(input.installation), budget: parseBackendImportBudget(input.budget), transfer: { ...transfer, receipt } }
}

export type BackendImageRequest = ReturnType<typeof readBackendImageRequest>
const binding = ({ expiresAt: _expiresAt, ...request }: BackendImageRequest): string => createHash('sha256').update(JSON.stringify(request)).digest('hex')
const unitName = (request: BackendImageRequest): string => `oa-formal-image-intake-${createHash('sha256').update(request.directory).digest('hex').slice(0, 16)}-${request.operationId}.service`

function docker(args: string[]): string {
  return execFileSync('docker', args, { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}
export function pinBackendDocker(stage: string): () => void {
  const context: unknown = JSON.parse(docker(['context', 'inspect']))
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

export function receiveBackendImage(path: string): string {
  const request = readBackendImageRequest(path)
  assertNativeImageIntake(unitName(request), request.budget.import.intake)
  const unpin = pinBackendDocker(request.stage)
  let snapshot: string | undefined
  try {
    const info = object(JSON.parse(docker(['info', '--format', '{{json .}}'])))
    if (info.OSType !== 'linux' || !['amd64', 'x86_64'].includes(String(info.Architecture)) || typeof info.DockerRootDir !== 'string'
      || !isAbsolute(info.DockerRootDir) || realpathSync(info.DockerRootDir) !== info.DockerRootDir) throw new Error('Formal images require a native Linux AMD64 Docker daemon')
    requireMemory(request); requireDisk(request, info.DockerRootDir)
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

export function verifyReceivedBackendImage(path: string, expected: Pick<BackendImageRequest, 'directory' | 'sourceSha' | 'producerSha'>): string {
  const request = readBackendImageRequest(path), reportPath = join(request.stage, 'image.json')
  if (request.directory !== expected.directory || request.sourceSha !== expected.sourceSha || request.producerSha !== expected.producerSha) throw new Error('Imported formal image does not match the owner deployment target')
  ownerPath(reportPath, false)
  const report = object(JSON.parse(readFileSync(reportPath, 'utf8')))
  if (report.format !== 1 || report.bindingSha256 !== binding(request) || report.sourceSha !== request.sourceSha
    || report.producerSha !== request.producerSha || report.imageId !== request.transfer.receipt.imageId
    || report.archiveManifestDigest !== null && (typeof report.archiveManifestDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(report.archiveManifestDigest))) throw new Error('Imported formal image belongs to another input or operation')
  const unpin = pinBackendDocker(request.stage)
  try {
    requireMemory(request)
    const id = nativeContainerImageId({ configDigest: request.transfer.receipt.imageId, manifestDigest: report.archiveManifestDigest })
    if (id !== report.nativeImageId) throw new Error('Formal image store changed after intake')
    return inspectLoadedContainerImage({ imageId: id, expected: { purpose: 'formal-candidate', sourceSha: request.sourceSha, producerSha: request.producerSha } })
  } finally { unpin() }
}

export function runBackendImageIntake(path: string): string {
  const request = readBackendImageRequest(path)
  const environment = ['PATH', 'HOME', 'USER', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']
    .flatMap(name => process.env[name] === undefined ? [] : [`--setenv=${name}=${process.env[name]}`])
  const result = spawnSync('systemd-run', ['--user', '--quiet', '--wait', '--pipe', '--collect', '--service-type=exec',
    `--unit=${unitName(request)}`, `--working-directory=${resolve(import.meta.dirname, '../..')}`,
    ...imageIntakeProperties(request.budget.import.intake), ...environment,
    '--', 'setsid', '--wait', 'flock', '-w', '60', join(request.directory, 'backups/.maintenance.lock'),
    process.execPath, fileURLToPath(import.meta.url), '_locked', path],
  { input: '', encoding: 'utf8', timeout: 21 * 60_000, maxBuffer: 2 * 1024 * 1024 })
  if (result.status !== 0 || result.error) throw new Error(`Bounded formal image intake failed; private inputs remain at ${request.stage}${result.stderr ? `\n${result.stderr.trim()}` : ''}`)
  const id = result.stdout.trim()
  if (!/^sha256:[a-f0-9]{64}$/.test(id)) throw new Error('Formal image intake returned no immutable image identity')
  return id
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [mode, path, directory, sourceSha, producerSha] = process.argv.slice(2)
    if (!path) throw new Error('Usage: backend-image-receiver.ts receive|check|_locked <private-request.json>')
    const id = mode === 'receive' ? runBackendImageIntake(path) : mode === 'check' && directory && sourceSha && producerSha ? verifyReceivedBackendImage(path, { directory, sourceSha, producerSha })
      : mode === '_locked' ? receiveBackendImage(path) : undefined
    if (!id) throw new Error('Unknown formal image intake action')
    process.stdout.write(id + '\n')
  } catch (error) { console.error(error instanceof Error ? error.message : 'Formal image intake failed'); process.exitCode = 1 }
}
