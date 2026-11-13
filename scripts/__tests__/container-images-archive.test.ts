import { gzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { FULL_TASK_IDS } from '../ci/verification-tasks'
import { parseContainerImageReceipt } from '../release/container-images'
import { loadContainerImageArchive, validateContainerImageArchive } from '../release/container-images-archive'

const roots: string[] = []
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
function fixture(tags: string[] = [], containerd = false, layerBytes = 1024) {
  const root = mkdtempSync(join(tmpdir(), 'oa-image-archive-')); roots.push(root)
  const payload = join(root, 'payload'), bin = join(root, 'bin'); mkdirSync(payload); mkdirSync(bin)
  const sourceSha = 'a'.repeat(40), producerSha = 'b'.repeat(40)
  const layer = Buffer.alloc(layerBytes), config = JSON.stringify({ os: 'linux', architecture: 'amd64',
    config: { Labels: { 'org.opencontainers.image.revision': sourceSha, 'io.open-agricola.release-channel': 'prerelease' } },
    rootfs: { type: 'layers', diff_ids: [`sha256:${sha256(layer)}`] } })
  const imageId = `sha256:${sha256(config)}`
  writeFileSync(join(payload, 'config.json'), config);writeFileSync(join(payload, 'layer.tar'), layer)
  writeFileSync(join(payload, 'manifest.json'), JSON.stringify([{ Config: 'config.json', RepoTags: tags, Layers: ['layer.tar'] }]))
  let manifestDigest: string | null = null
  if (containerd) {
    const blobs = join(payload, 'blobs/sha256'); mkdirSync(blobs, { recursive: true })
    const manifest = JSON.stringify({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json',
      config: { mediaType: 'application/vnd.oci.image.config.v1+json', digest: imageId, size: Buffer.byteLength(config) },
      layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: `sha256:${sha256(layer)}`, size: layer.length }] })
    manifestDigest = `sha256:${sha256(manifest)}`
    writeFileSync(join(blobs, sha256(manifest)), manifest)
    writeFileSync(join(payload, 'index.json'), JSON.stringify({ schemaVersion: 2, manifests: [{
      mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: manifestDigest, size: Buffer.byteLength(manifest),
      annotations: { 'org.opencontainers.image.created': '2026-11-13T02:27:17Z' },
    }] }))
  }
  const nativeImageId = containerd ? manifestDigest : imageId
  const archivePath = join(root, 'image.tar')
  const pack = () => { execFileSync('tar', ['-cf', archivePath, '-C', payload, 'manifest.json', 'config.json', 'layer.tar', ...(containerd ? ['blobs', 'index.json'] : [])]); chmodSync(archivePath, 0o600) }; pack()
  const receipt = parseContainerImageReceipt({ format: 1, repository: 'titanxxh/open-agricola', repositoryId: 123, purpose: 'candidate', channel: 'prerelease', sourceSha, producerSha,
    platform: 'linux/amd64', registryRepository: 'ghcr.io/titanxxh/open-agricola-images', manifestDigest: `sha256:${'e'.repeat(64)}`, imageId,
    build: { runId: 9, runAttempt: 1 }, verification: { kind: 'prerelease', configuration: 'c'.repeat(64), producerConfiguration: 'd'.repeat(64),
      tasks: FULL_TASK_IDS.map((id, index) => ({ id, runId: 3, jobId: index + 1, runAttempt: 1 })) } })
  const metadata = { format: 1, gameBuildId: sourceSha, basePath: '/open-agricola/', releaseChannel: 'prerelease', deploymentTarget: 'prerelease-hosted' }
  const calls = join(root, 'calls.jsonl')
  writeFileSync(join(bin, 'docker'), `#!${process.execPath}
const fs=require('node:fs'),a=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(a)+'\\n');
if(a[0]==='info')console.log(JSON.stringify(${JSON.stringify(containerd ? [['driver-type','io.containerd.snapshotter.v1']] : [])}));
else if(a[0]==='image'&&a[1]==='inspect')console.log(JSON.stringify([{Id:${JSON.stringify(nativeImageId)},Os:'linux',Architecture:'amd64',Config:JSON.parse(${JSON.stringify(config)}).config}]));
else if(a[0]==='create')console.log('f'.repeat(64));
else if(a[0]==='cp')fs.writeFileSync(a.at(-1),${JSON.stringify(JSON.stringify(metadata))});
else if(a[0]==='load'||a[0]==='rm')process.exit(0);else process.exit(2);
`, { mode: 0o700 })
  vi.stubEnv('PATH', bin + ':' + process.env.PATH)
  const transfer = () => ({ format: 1, receipt, archive: { sha256: sha256(readFileSync(archivePath)), bytes: readFileSync(archivePath).length } })
  const expected = { purpose: receipt.purpose, sourceSha, producerSha }
  const load = () => loadContainerImageArchive({ archivePath, transfer: transfer(), expected, maxBytes: 1024 * 1024 })
  return { root, payload, archivePath, config, bin, nativeImageId, manifestDigest, callFile: calls, receipt, transfer, expected, pack, load, calls: () => readFileSync(calls, 'utf8').trim().split('\n').map(line => JSON.parse(line)) }
}

it('loads only the fixed tag-free image and validates its hosted identity without starting it', () => {
  const value = fixture()
  expect(value.load()).toEqual({ nativeImageId: value.receipt.imageId, archiveManifestDigest: null })
  expect(value.calls().some(args => args[0] === 'load')).toBe(true)
  expect(value.calls().some(args => ['run', 'start', 'build', 'tag'].includes(args[0]))).toBe(false)
})

it.skipIf(process.platform !== 'linux')('validates all archive bytes within one archive-sized read budget', () => {
  const value = fixture([], true, 4 * 1024 * 1024), archive = value.transfer().archive
  const bytesRead = () => Number(/^rchar: (\d+)$/m.exec(readFileSync('/proc/self/io', 'utf8'))?.[1])
  const before = bytesRead()
  const checked = validateContainerImageArchive({ archivePath: value.archivePath, imageId: value.receipt.imageId,
    sourceSha: value.receipt.sourceSha, channel: 'prerelease', maxBytes: archive.bytes })
  const actualBytesRead = bytesRead() - before
  expect(checked).toEqual({ ...archive, archiveManifestDigest: value.manifestDigest })
  expect(actualBytesRead).toBeLessThanOrEqual(archive.bytes + 64 * 1024)
})

it('loads a containerd save archive by its verified manifest handle while retaining the separate config digest', () => {
  const value = fixture([], true)
  expect(value.load()).toEqual({ nativeImageId: value.nativeImageId, archiveManifestDigest: value.manifestDigest })
  expect(value.nativeImageId).not.toBe(value.receipt.imageId)
  expect(value.calls().find(args => args[0] === 'image')).toEqual(['image', 'inspect', value.nativeImageId])
})

it.each(['created', 'source', 'name', 'unknown annotation', 'unknown index', 'unknown descriptor', 'platform'])('rejects untrusted OCI %s metadata before loading', failure => {
  const value = fixture([], true), path = join(value.payload, 'index.json'), index = JSON.parse(readFileSync(path, 'utf8'))
  const descriptor = index.manifests[0]
  if (failure === 'created') descriptor.annotations['org.opencontainers.image.created'] = 'not-a-time'
  if (failure === 'source') descriptor.annotations['org.opencontainers.image.source'] = 'https://github.com/titanxxh/open-agricola'
  if (failure === 'name') descriptor.annotations['io.containerd.image.name'] = 'open-agricola:backend'
  if (failure === 'unknown annotation') descriptor.annotations['io.containerd.manifest.subject'] = 'untrusted'
  if (failure === 'unknown index') index.subject = { digest: value.receipt.imageId }
  if (failure === 'unknown descriptor') descriptor.urls = ['https://untrusted.invalid/image']
  if (failure === 'platform') descriptor.platform = { os: 'linux', architecture: 'arm64' }
  writeFileSync(path, JSON.stringify(index)); value.pack()
  expect(value.load).toThrow()
  expect(existsSync(value.callFile)).toBe(false)
})

it('validates a producer archive under its one source-derived build tag without allowing that tag at import', () => {
  const value = fixture(['oa-container-image:' + 'a'.repeat(40)])
  expect(validateContainerImageArchive({ archivePath: value.archivePath, imageId: value.receipt.imageId, sourceSha: value.receipt.sourceSha,
    channel: 'prerelease', maxBytes: 1024 * 1024, allowProducerTag: true })).toMatchObject(value.transfer().archive)
  expect(value.load).toThrow(/tag/)
})

it('rejects ambiguous tar paths before Docker can interpret a hidden repository tag', () => {
  const value = fixture()
  writeFileSync(join(value.payload, 'repositories'), JSON.stringify({ 'open-agricola': { backend: 'f'.repeat(64) } }))
  execFileSync('tar', ['-cf', value.archivePath, '-C', value.payload, '--transform=s#^repositories$#./repositories#', 'manifest.json', 'config.json', 'layer.tar', 'repositories'])
  expect(value.load).toThrow(/Unsafe/)
  expect(existsSync(value.callFile)).toBe(false)
})

it.each(['formal tag', 'extra image', 'truncated', 'bad layer', 'oversize', 'wrong digest'])('rejects %s without loading any image', failure => {
  const value = fixture(failure === 'formal tag' ? ['open-agricola:backend'] : [])
  if (failure === 'extra image') {
    const manifest = JSON.parse(readFileSync(join(value.payload, 'manifest.json'), 'utf8'))
    writeFileSync(join(value.payload, 'manifest.json'), JSON.stringify([...manifest, ...manifest]));value.pack()
  }
  if (failure === 'truncated') writeFileSync(value.archivePath, readFileSync(value.archivePath).subarray(0, 1900))
  if (failure === 'bad layer') { writeFileSync(join(value.payload, 'layer.tar'), 'corrupted');value.pack() }
  const transfer = value.transfer()
  if (failure === 'wrong digest') transfer.archive.sha256 = '0'.repeat(64)
  expect(() => loadContainerImageArchive({ archivePath: value.archivePath, transfer, expected: value.expected, maxBytes: failure === 'oversize' ? 1024 : 1024 * 1024 })).toThrow()
  expect(existsSync(value.callFile)).toBe(false)
})
it('checks the pending native handle before loading rather than accepting the same config digest', () => {
  const value = fixture([], true)
  expect(() => loadContainerImageArchive({ archivePath: value.archivePath, transfer: value.transfer(), expected: value.expected,
    maxBytes: 1024 * 1024, pendingNativeImageId: value.receipt.imageId })).toThrow('native image ID')
  expect(value.calls()).toEqual([['info', '--format', '{{json .DriverStatus}}']])
})

it('retries an interrupted load with its original image ID and still checks hosted metadata', () => {
  const value = fixture(), docker = join(value.bin, 'docker'), script = readFileSync(docker, 'utf8')
  writeFileSync(docker, script.replace("if(a[0]==='info'", "if(a[0]==='load')process.exit(17);if(a[0]==='info'"))
  expect(value.load).toThrow(/load failed/)
  writeFileSync(docker, script)
  expect(value.load()).toEqual({ nativeImageId: value.receipt.imageId, archiveManifestDigest: null })
  expect(value.calls().filter(args => args[0] === 'load')).toHaveLength(2)
  writeFileSync(docker, script.replace('prerelease-hosted', 'stable-hosted'))
  expect(value.load).toThrow(/frontend/)
  expect(value.calls().at(-1)?.[0]).toBe('rm')
})

it('rejects a compressed layer even if an attacker binds its compressed digest in a legacy manifest', () => {
  const value = fixture(), compressed = gzipSync(Buffer.alloc(1024))
  const config = JSON.parse(value.config);config.rootfs.diff_ids = [`sha256:${sha256(compressed)}`]
  const body = JSON.stringify(config);writeFileSync(join(value.payload, 'config.json'), body)
  writeFileSync(join(value.payload, 'layer.tar'), compressed);value.receipt.imageId = `sha256:${sha256(body)}`;value.pack()
  expect(value.load).toThrow(/uncompressed/)
  expect(existsSync(value.callFile)).toBe(false)
})

it('rejects a compression signature even in a crafted layer with a valid tar checksum', () => {
  const value = fixture(), layer = Buffer.alloc(1024)
  Buffer.from('28b52ffd', 'hex').copy(layer)
  layer.fill(32, 148, 156)
  const checksum = layer.subarray(0, 512).reduce((sum, byte) => sum + byte, 0)
  layer.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii')
  const config = JSON.parse(value.config);config.rootfs.diff_ids = [`sha256:${sha256(layer)}`]
  const body = JSON.stringify(config);writeFileSync(join(value.payload, 'config.json'), body)
  writeFileSync(join(value.payload, 'layer.tar'), layer);value.receipt.imageId = `sha256:${sha256(body)}`;value.pack()
  expect(value.load).toThrow(/uncompressed/)
  expect(existsSync(value.callFile)).toBe(false)
})

it('accepts only the native BuildKit creation timestamp beside the fixed producer tag', () => {
  const value = fixture(['oa-container-image:' + 'a'.repeat(40)]), blobs = join(value.payload, 'blobs/sha256')
  mkdirSync(blobs, { recursive: true })
  const layer = readFileSync(join(value.payload, 'layer.tar'))
  writeFileSync(join(blobs, sha256(layer)), layer);writeFileSync(join(blobs, value.receipt.imageId.slice(7)), value.config)
  const manifest = JSON.stringify({ schemaVersion: 2, config: { digest: value.receipt.imageId, size: Buffer.byteLength(value.config) }, layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar', digest: `sha256:${sha256(layer)}`, size: layer.length }] })
  writeFileSync(join(blobs, sha256(manifest)), manifest)
  const annotations = { 'io.containerd.image.name': `docker.io/library/oa-container-image:${value.receipt.sourceSha}`, 'org.opencontainers.image.ref.name': value.receipt.sourceSha,
    'org.opencontainers.image.created': '2026-11-13T02:27:17Z' }
  const index = { schemaVersion: 2, manifests: [{ mediaType: 'application/vnd.oci.image.manifest.v1+json', digest: `sha256:${sha256(manifest)}`, size: Buffer.byteLength(manifest), annotations }] }
  const pack = () => {
    writeFileSync(join(value.payload, 'index.json'), JSON.stringify(index))
    execFileSync('tar', ['-cf', value.archivePath, '-C', value.payload, 'manifest.json', 'config.json', 'layer.tar', 'blobs', 'index.json'])
  }
  pack()
  const validate = () => validateContainerImageArchive({ archivePath: value.archivePath, imageId: value.receipt.imageId, sourceSha: value.receipt.sourceSha,
    channel: 'prerelease', maxBytes: 1024 * 1024, allowProducerTag: true })
  expect(validate()).toMatchObject(value.transfer().archive)
  annotations['org.opencontainers.image.created'] = 'not-a-timestamp';pack();expect(validate).toThrow()
})


it('reports both inspection and exact container cleanup failures while removing its local temporary files', () => {
  const value = fixture(), docker = join(value.bin, 'docker'), script = readFileSync(docker, 'utf8')
  writeFileSync(docker, script.replace('prerelease-hosted', 'stable-hosted').replace("if(a[0]==='info'", "if(a[0]==='rm')process.exit(17);if(a[0]==='info'"))
  let failed = false
  try { value.load() }
  catch (error) {
    failed = true
    expect(error).toBeInstanceOf(AggregateError)
    if (!(error instanceof AggregateError)) throw error
    expect(error.errors).toEqual([
      expect.objectContaining({ message: 'Hosted frontend does not match the image receipt' }),
      expect.objectContaining({ message: 'Container image rm failed; keep the original image binding and retry after inspection' }),
    ])
    const create = value.calls().find(args => args[0] === 'create')
    if (!create) throw new Error('Inspection container creation was not observed', { cause: error })
    expect(error.message).toBe(`Container image inspection cleanup could not be confirmed for ${create[create.indexOf('--name') + 1]}`)
  }
  expect(failed).toBe(true)
  const copied = value.calls().find(args => args[0] === 'cp')?.at(-1)
  if (!copied) throw new Error('Inspection metadata copy was not observed')
  expect(existsSync(dirname(copied))).toBe(false)
})
