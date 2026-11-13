import { randomUUID } from 'node:crypto'
import { constants, copyFileSync, lstatSync, existsSync, openSync, closeSync, readFileSync, rmSync, statfsSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { assertExpectedContainerImage, parseContainerImageTransfer } from '../release/container-images.ts'
import { loadContainerImageArchive } from '../release/container-images-archive.ts'
import { assertOwnerPath, targetFingerprint, type PrereleaseTarget } from './config'
import { assertCapacity, command, importedImagePath } from './docker'
import { atomicJson, controlDirectory, readRuntime } from './runtime'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid owner image import')
  return Object.fromEntries(Object.entries(value))
}

export function parseImageImportRequest(value: unknown) {
  const input = object(value)
  if (input.action !== 'prepare-image-import' && input.action !== 'import-image'
    || typeof input.expectedCurrent !== 'string' || !/^(empty|[a-f0-9]{40})$/.test(input.expectedCurrent)
    || typeof input.operationId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.operationId)) throw new Error('Explicit image import action, current SHA and operation UUID are required')
  return { action: input.action, expectedCurrent: input.expectedCurrent, operationId: input.operationId, transfer: parseContainerImageTransfer(input.transfer) }
}

export function runImageImport(target: PrereleaseTarget, request: ReturnType<typeof parseImageImportRequest>) {
  const record = readRuntime(target), { transfer } = request, receipt = transfer.receipt
  if (request.expectedCurrent !== (record.buildId ?? 'empty') && (!record.operation || request.expectedCurrent !== (record.operation.sourceBuildId ?? 'empty'))) throw new Error('Image import expected-current SHA differs')
  if (record.mode !== 'maintenance') throw new Error('Image import requires maintenance or an uninstalled target')
  const producerSha = command('git', ['rev-parse', 'HEAD'], { cwd: target.policyDirectory })
  const pendingImageId = receipt.purpose === 'candidate' && record.operation && record.operation.buildId === receipt.sourceSha ? record.operation.image
    : receipt.purpose === 'candidate' && record.installed && record.installed.buildId === receipt.sourceSha ? record.installed.image : undefined
  const expected = { purpose: receipt.purpose, sourceSha: receipt.sourceSha, producerSha, pendingImageId }
  assertExpectedContainerImage(receipt, expected)
  const maxBytes = target.budgets.import.maxArchiveMiB * 1024 * 1024
  if (transfer.archive.bytes > maxBytes) throw new Error('Image archive exceeds the target import budget')
  const fingerprint = targetFingerprint(target)
  const journalPath = join(controlDirectory(target), `image-import-${request.operationId}.json`)
  const archivePath = join(controlDirectory(target), `image-import-${request.operationId}.tar`)
  const cachePath = importedImagePath(target, receipt.purpose, receipt.sourceSha, producerSha)
  for (const path of [journalPath, archivePath, cachePath]) assertOwnerPath(path)
  const binding = { fingerprint, transfer }
  let replacePartial = false
  for (const path of [journalPath, cachePath]) {
    if (!existsSync(path)) continue
    const existing = object(JSON.parse(readFileSync(path, 'utf8')))
    const previous = parseContainerImageTransfer(existing.transfer)
    if (existing.fingerprint !== fingerprint || JSON.stringify(previous.receipt) !== JSON.stringify(receipt)) throw new Error('Resume the original image transfer; a same-source rebuild cannot replace its receipt or image ID')
    if (path === journalPath && JSON.stringify(previous.archive) !== JSON.stringify(transfer.archive)) {
      if (request.action !== 'prepare-image-import') throw new Error('Image archive differs from the prepared transfer')
      replacePartial = true
    }
  }
  if (command('docker', ['ps', '-q', '--filter', `label=com.docker.compose.project=${target.project}`, '--filter', 'label=com.docker.compose.service=app'])) throw new Error('Image import requires the application to be stopped through explicit maintenance')
  assertCapacity(target, 'import')
  const endpoint = object(JSON.parse(command('docker', ['context', 'inspect', '--format', '{{json .Endpoints.docker}}'])))
  if (typeof endpoint.Host !== 'string' || !endpoint.Host.startsWith('unix://') || process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) throw new Error('Image import requires the local host Docker daemon')
  const info = object(JSON.parse(command('docker', ['info', '--format', '{{json .}}'])))
  if (info.OSType !== 'linux' || !['amd64', 'x86_64'].includes(String(info.Architecture)) || typeof info.DockerRootDir !== 'string' || !isAbsolute(info.DockerRootDir)) throw new Error('Image target must be a native linux/amd64 Docker host')
  assertOwnerPath(info.DockerRootDir)
  const staging = statfsSync(target.directory), docker = statfsSync(info.DockerRootDir)
  const sameDevice = statSync(target.directory).dev === statSync(info.DockerRootDir).dev
  const reserve = target.budgets.diskMiB * 1024 * 1024, bytes = transfer.archive.bytes
  // Admission headroom only: shared dockerd extraction is not a filesystem or cgroup quota.
  if (staging.bavail * staging.bsize < reserve + bytes * (sameDevice ? 4 : 2)
    || !sameDevice && docker.bavail * docker.bsize < reserve + bytes * 2) throw new Error('Image import staging or Docker data device lacks conservative disk headroom')
  if (request.action === 'prepare-image-import') {
    if (replacePartial) rmSync(archivePath, { force: true })
    atomicJson(journalPath, binding)
    if (!existsSync(archivePath)) closeSync(openSync(archivePath, 'wx', 0o600))
    return { imageId: receipt.imageId, archivePath }
  }
  if (!existsSync(journalPath)) throw new Error('Prepare the fixed image transfer before importing it')
  const upload = lstatSync(archivePath)
  if (!upload.isFile() || upload.uid !== process.getuid?.() || upload.mode & 0o077 || upload.size !== transfer.archive.bytes) throw new Error('Image transfer is incomplete or not owner-private')
  const snapshot = join(controlDirectory(target), `image-snapshot-${randomUUID()}.tar`)
  let imageId: string
  try {
    // A concurrent SCP can change the upload, but cannot change this independent inode after copying.
    copyFileSync(archivePath, snapshot, constants.COPYFILE_EXCL | constants.COPYFILE_FICLONE)
    imageId = loadContainerImageArchive({ archivePath: snapshot, transfer, expected, maxBytes })
  } finally { rmSync(snapshot, { force: true }) }
  rmSync(archivePath)
  atomicJson(cachePath, binding)
  return { imageId, sourceSha: receipt.sourceSha, purpose: receipt.purpose }
}
