import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { closeSync, lstatSync, mkdtempSync, openSync, readFileSync, readSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { assertExpectedContainerImage, parseContainerImageTransfer, type ExpectedContainerImage } from './container-images.ts'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid image archive metadata')
  return Object.fromEntries(Object.entries(value))
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid image archive string')
  return value
}
function strings(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Invalid image archive list')
  return value.map(string)
}
function imageId(value: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error('Expected an immutable Docker image ID')
  return value
}
function privateFile(path: string): number {
  if (resolve(path) !== path) throw new Error('Image archive must have an absolute path')
  for (let current = path; ; current = dirname(current)) {
    if (lstatSync(current).isSymbolicLink()) throw new Error('Image archive path contains a symlink')
    if (dirname(current) === current) break
  }
  const info = lstatSync(path)
  if (!info.isFile() || info.uid !== process.getuid?.() || info.mode & 0o077) throw new Error('Image archive must be an owner-private regular file')
  return info.size
}
function docker(args: string[], timeout = 30_000): string {
  const env: NodeJS.ProcessEnv = {}
  for (const key of ['PATH', 'HOME', 'USER', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG']) if (process.env[key]) env[key] = process.env[key]
  try { return execFileSync('docker', args, { env, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim() }
  catch { throw new Error(`Container image ${args[0]} failed; keep the original image binding and retry after inspection`) }
}
export function nativeContainerImageId({ configDigest, manifestDigest }: { configDigest: string; manifestDigest: string | null }, runDocker: (args: string[]) => string = docker): string {
  imageId(configDigest)
  if (manifestDigest !== null) imageId(manifestDigest)
  const status: unknown = JSON.parse(runDocker(['info', '--format', '{{json .DriverStatus}}']))
  if (!Array.isArray(status) || status.some(row => !Array.isArray(row) || row.length !== 2 || row.some(value => typeof value !== 'string'))) throw new Error('Unknown Docker image store')
  const driver = status.find(row => row[0] === 'driver-type')?.[1]
  if (driver === undefined) return configDigest
  if (driver !== 'io.containerd.snapshotter.v1' || manifestDigest === null) throw new Error('Docker image store requires a verified single-platform manifest')
  return manifestDigest
}

function identity(config: Record<string, unknown>, expected: Pick<ExpectedContainerImage, 'purpose' | 'sourceSha'>): void {
  const labels = object(config.Labels), channel = expected.purpose === 'candidate' ? 'prerelease' : 'stable'
  if (labels['org.opencontainers.image.source'] !== undefined) throw new Error('Image contains automatic repository linkage')
  if (labels['org.opencontainers.image.revision'] !== expected.sourceSha || labels['io.open-agricola.release-channel'] !== channel) throw new Error('Image source or channel differs from the receipt')
}

export function inspectLoadedContainerImage({ imageId: id, expected }: { imageId: string; expected: ExpectedContainerImage }, runDocker: (args: string[]) => string = docker): string {
  imageId(id)
  const inspected: unknown = JSON.parse(runDocker(['image', 'inspect', id]))
  if (!Array.isArray(inspected) || inspected.length !== 1) throw new Error('Expected one loaded image')
  const image = object(inspected[0]), config = object(image.Config)
  if (image.Id !== id || image.Os !== 'linux' || image.Architecture !== 'amd64') throw new Error('Loaded image ID or platform differs')
  identity(config, expected)
  const directory = mkdtempSync(join(tmpdir(), 'oa-image-inspection-')), name = `oa-image-inspection-${randomUUID()}`
  let created = false
  try {
    const volumes = config.Volumes === undefined || config.Volumes === null ? [] : Object.keys(object(config.Volumes))
    if (volumes.length > 128 || volumes.some(path => !/^\/[A-Za-z0-9_./-]*$/.test(path) || path.split('/').includes('..'))) throw new Error('Unsupported image volume declarations')
    runDocker(['create', '--name', name, '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      '--memory', '64m', '--cpus', '0.25', '--pids-limit', '32', ...volumes.flatMap(path => ['--mount', `type=tmpfs,destination=${path}`]), '--entrypoint', '/bin/false', id])
    created = true
    const path = join(directory, 'frontend-build.json')
    runDocker(['cp', `${name}:/app/frontend-dist/frontend-build.json`, path])
    const info = lstatSync(path)
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) throw new Error('Invalid hosted frontend metadata file')
    const metadata = object(JSON.parse(readFileSync(path, 'utf8'))), channel = expected.purpose === 'candidate' ? 'prerelease' : 'stable'
    if (metadata.format !== 1 || metadata.gameBuildId !== expected.sourceSha || metadata.basePath !== '/open-agricola/'
      || metadata.releaseChannel !== channel || metadata.deploymentTarget !== `${channel}-hosted`) throw new Error('Hosted frontend does not match the image receipt')
    return id
  } finally {
    if (created) runDocker(['rm', '-v', name])
    rmSync(directory, { force: true, recursive: true })
  }
}

type Entry = { offset: number; size: number; sha256: string }
function archiveContents(fd: number, bytes: number) {
  const entries = new Map<string, Entry>(), header = Buffer.alloc(512), chunk = Buffer.alloc(1024 * 1024), hash = createHash('sha256')
  let offset = 0, ended = false
  const field = (start: number, length: number) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '')
  const octal = (value: string): number => {
    if (!/^[ 0-7]*$/.test(value)) throw new Error('Unsupported image tar number')
    const result = Number.parseInt(value.trim() || '0', 8)
    if (!Number.isSafeInteger(result) || result < 0) throw new Error('Invalid image tar number')
    return result
  }
  while (offset + 512 <= bytes) {
    if (readSync(fd, header, 0, 512, offset) !== 512) throw new Error('Truncated image archive')
    hash.update(header)
    if (header.every(byte => byte === 0)) {
      if (bytes - offset < 1024 || bytes % 512) throw new Error('Truncated image tar terminator')
      for (let cursor = offset + 512; cursor < bytes;) {
        const size = readSync(fd, chunk, 0, Math.min(chunk.length, bytes - cursor), cursor)
        if (!size || !chunk.subarray(0, size).every(byte => byte === 0)) throw new Error('Unexpected data after image tar terminator')
        hash.update(chunk.subarray(0, size))
        cursor += size
      }
      ended = true; break
    }
    const checksum = octal(field(148, 8)), actual = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0)
    if (actual !== checksum) throw new Error('Invalid image tar checksum')
    const prefix = field(345, 155), name = (prefix ? prefix + '/' : '') + field(0, 100), type = field(156, 1), size = octal(field(124, 12))
    if (!/^[A-Za-z0-9._/-]+$/.test(name) || name.startsWith('/') || name.replace(/\/$/, '').split('/').some(part => !part || part === '.' || part === '..') || entries.has(name)
      || !['', '0', '5'].includes(type) || type === '5' && size !== 0 || offset + 512 + size > bytes || entries.size >= 100_000) throw new Error('Unsafe, duplicate or truncated image tar member')
    const start = offset + 512, end = start + Math.ceil(size / 512) * 512, memberHash = createHash('sha256')
    if (end > bytes) throw new Error('Truncated image archive padding')
    for (let cursor = start; cursor < end;) {
      const length = readSync(fd, chunk, 0, Math.min(chunk.length, end - cursor), cursor)
      if (!length) throw new Error('Truncated image archive member')
      hash.update(chunk.subarray(0, length))
      memberHash.update(chunk.subarray(0, Math.min(length, Math.max(0, start + size - cursor))))
      cursor += length
    }
    if (type !== '5') entries.set(name, { offset: start, size, sha256: memberHash.digest('hex') })
    offset = end
  }
  if (!ended) throw new Error('Image archive has no complete terminator')
  return { entries, sha256: hash.digest('hex') }
}

function validateArchive(fd: number, bytes: number, receipt: { imageId: string; sourceSha: string; purpose: 'candidate' | 'trusted-policy' }, allowProducerTag: boolean) {
  const { entries, sha256 } = archiveContents(fd, bytes)
  const entry = (name: string): Entry => { const result = entries.get(name); if (!result) throw new Error('Missing image archive member'); return result }
  const json = (name: string): unknown => {
    const item = entry(name)
    if (item.size > 1024 * 1024) throw new Error('Image archive metadata is too large')
    const buffer = Buffer.alloc(item.size)
    if (readSync(fd, buffer, 0, buffer.length, item.offset) !== buffer.length) throw new Error('Truncated image metadata')
    return JSON.parse(buffer.toString('utf8'))
  }
  const manifest = json('manifest.json')
  if (!Array.isArray(manifest) || manifest.length !== 1) throw new Error('Image archive must contain exactly one image')
  const image = object(manifest[0]), tags = image.RepoTags
  const tag = `oa-container-image:${receipt.sourceSha}`
  const tagged = allowProducerTag && Array.isArray(tags) && tags.length === 1 && tags[0] === tag
  if (tags !== null && (!Array.isArray(tags) || tags.length !== 0) && !tagged) throw new Error('Image archive must not contain unexpected repository tags')
  if (entries.has('repositories')) {
    const repositories = object(json('repositories'))
    if (Object.keys(repositories).length) {
      const mapping = object(repositories['oa-container-image'])
      if (!tagged || Object.keys(repositories).join() !== 'oa-container-image' || Object.keys(mapping).join() !== receipt.sourceSha
        || !/^[a-f0-9]{64}$/.test(string(mapping[receipt.sourceSha]))) throw new Error('Image archive may not overwrite repository tags')
    }
  }
  const configPath = string(image.Config), configEntry = entry(configPath), config = object(json(configPath))
  if (`sha256:${configEntry.sha256}` !== receipt.imageId || config.os !== 'linux' || config.architecture !== 'amd64') throw new Error('Archive config ID or platform differs from receipt')
  identity(object(config.config), receipt)
  const layers = strings(image.Layers), rootfs = object(config.rootfs), diffs = strings(rootfs.diff_ids)
  if (rootfs.type !== 'layers' || layers.length !== diffs.length || new Set(layers).size !== layers.length) throw new Error('Invalid archive layer set')
  for (const [index, path] of layers.entries()) {
    const layer = entry(path), header = Buffer.alloc(512)
    if (layer.size < 1024 || layer.size % 512 || readSync(fd, header, 0, 512, layer.offset) !== 512) throw new Error('Expected a complete uncompressed image layer')
    const checksum = header.subarray(148, 156).toString('ascii').replace(/\0.*$/s, '').trim()
    const sum = header.reduce((value, byte, index) => value + (index >= 148 && index < 156 ? 32 : byte), 0)
    if (!header.every(byte => byte === 0) && (!/^[0-7]+$/.test(checksum) || Number.parseInt(checksum, 8) !== sum)
      || ['1f8b', '425a68', 'fd377a585a00', '28b52ffd', '04224d18'].some(magic => header.subarray(0, magic.length / 2).toString('hex') === magic)) throw new Error('Expected an uncompressed tar layer')
    if (`sha256:${layer.sha256}` !== diffs[index]) throw new Error('Image layer differs from its uncompressed config digest')
  }
  let archiveManifestDigest: string | null = null
  if (entries.has('index.json')) {
    const index = object(json('index.json')), descriptors = index.manifests
    if (Object.keys(index).some(key => !['schemaVersion', 'mediaType', 'manifests'].includes(key))
      || index.mediaType !== undefined && index.mediaType !== 'application/vnd.oci.image.index.v1+json'
      || index.schemaVersion !== 2 || index.annotations !== undefined || !Array.isArray(descriptors) || descriptors.length !== 1) throw new Error('Unexpected OCI image index or tags')
    const descriptor = object(descriptors[0]), digest = string(descriptor.digest)
    const annotations = descriptor.annotations === undefined ? {} : object(descriptor.annotations)
    const created = annotations['org.opencontainers.image.created']
    const creationTime = created === undefined || typeof created === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(created) && Number.isFinite(Date.parse(created))
    const annotationNames = Object.keys(annotations).filter(key => key !== 'org.opencontainers.image.created')
    const allowedAnnotations = creationTime && (annotationNames.length === 0 || tagged && annotationNames.sort().join(',') === 'io.containerd.image.name,org.opencontainers.image.ref.name'
      && annotations['io.containerd.image.name'] === `docker.io/library/${tag}` && annotations['org.opencontainers.image.ref.name'] === receipt.sourceSha)
    if (descriptor.platform !== undefined) {
      const platform = object(descriptor.platform)
      if (Object.keys(platform).sort().join(',') !== 'architecture,os' || platform.architecture !== 'amd64' || platform.os !== 'linux') throw new Error('Unexpected OCI platform')
    }
    if (Object.keys(descriptor).some(key => !['mediaType', 'digest', 'size', 'annotations', 'platform'].includes(key))
      || !/^sha256:[a-f0-9]{64}$/.test(digest) || Object.keys(annotations).length > 0 && !allowedAnnotations
      || !['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].includes(string(descriptor.mediaType))) throw new Error('Unexpected OCI image descriptor or tags')
    const path = 'blobs/sha256/' + digest.slice(7), blob = entry(path)
    if (`sha256:${blob.sha256}` !== digest || descriptor.size !== blob.size) throw new Error('OCI manifest digest differs')
    const manifest = object(json(path)), config = object(manifest.config), descriptorsOfLayers = manifest.layers
    if (Object.keys(manifest).some(key => !['schemaVersion', 'mediaType', 'config', 'layers'].includes(key)) || manifest.schemaVersion !== 2
      || Object.keys(config).some(key => !['mediaType', 'digest', 'size'].includes(key)) || config.size !== configEntry.size
      || config.digest !== receipt.imageId || manifest.annotations !== undefined || !Array.isArray(descriptorsOfLayers)
      || descriptorsOfLayers.length !== layers.length) throw new Error('OCI image does not match Docker archive identity')
    for (const [index, value] of descriptorsOfLayers.entries()) {
      const descriptor = object(value)
      if (Object.keys(descriptor).some(key => !['mediaType', 'digest', 'size'].includes(key)) || descriptor.digest !== diffs[index] || descriptor.annotations !== undefined || descriptor.size !== entry(layers[index]).size
        || !['application/vnd.oci.image.layer.v1.tar', 'application/vnd.docker.image.rootfs.diff.tar'].includes(string(descriptor.mediaType))) throw new Error('OCI archive contains a compressed or mismatched layer')
    }
    archiveManifestDigest = digest
  }
  return { archiveManifestDigest, sha256 }
}

export function validateContainerImageArchive({ archivePath, imageId: id, sourceSha, channel, maxBytes, allowProducerTag = false }: {
  archivePath: string; imageId: string; sourceSha: string; channel: 'stable' | 'prerelease'; maxBytes: number; allowProducerTag?: boolean
}): { sha256: string; bytes: number; archiveManifestDigest: string | null } {
  imageId(id)
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || !['stable', 'prerelease'].includes(channel)) throw new Error('Invalid expected image identity')
  const bytes = privateFile(archivePath)
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || bytes > maxBytes) throw new Error('Image archive exceeds its byte bound')
  const fd = openSync(archivePath, 'r')
  try {
    return { ...validateArchive(fd, bytes, { imageId: id, sourceSha, purpose: channel === 'prerelease' ? 'candidate' : 'trusted-policy' }, allowProducerTag), bytes }
  } finally { closeSync(fd) }
}

export function loadContainerImageArchive({ archivePath, transfer: input, expected, maxBytes, pendingNativeImageId }: {
  archivePath: string; transfer: unknown; expected: ExpectedContainerImage; maxBytes: number; pendingNativeImageId?: string
}): { nativeImageId: string; archiveManifestDigest: string | null } {
  const transfer = parseContainerImageTransfer(input); assertExpectedContainerImage(transfer.receipt, expected)
  if (privateFile(archivePath) !== transfer.archive.bytes) throw new Error('Image transfer is incomplete')
  const archive = validateContainerImageArchive({ archivePath, imageId: transfer.receipt.imageId, sourceSha: transfer.receipt.sourceSha, channel: transfer.receipt.channel, maxBytes })
  if (archive.sha256 !== transfer.archive.sha256) throw new Error('Image transfer digest differs')
  const nativeImageId = nativeContainerImageId({ configDigest: transfer.receipt.imageId, manifestDigest: archive.archiveManifestDigest })
  if (pendingNativeImageId !== undefined && pendingNativeImageId !== nativeImageId) throw new Error('Pending operation must retain its native image ID')
  docker(['load', '--platform', 'linux/amd64', '--input', archivePath], 15 * 60_000)
  inspectLoadedContainerImage({ imageId: nativeImageId, expected })
  return { nativeImageId, archiveManifestDigest: archive.archiveManifestDigest }
}
