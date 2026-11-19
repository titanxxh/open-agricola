import { createHash } from 'node:crypto'
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { execFileSync } from 'node:child_process'
import type { RuntimePin } from './source-runtime.ts'
import { CONTAINER_IMAGE_REGISTRY } from '../release/container-images.ts'

const repository = CONTAINER_IMAGE_REGISTRY.slice('ghcr.io/'.length)
const registry = 'https://ghcr.io/v2/' + repository
const sha = (bytes: Uint8Array) => 'sha256:' + createHash('sha256').update(bytes).digest('hex')

function descriptor(value: unknown): { digest: string; size: number } {
  if (!value || typeof value !== 'object' || !('digest' in value) || typeof value.digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value.digest)
    || !('size' in value) || typeof value.size !== 'number' || !Number.isSafeInteger(value.size) || value.size < 1) throw new Error('Invalid runtime blob descriptor')
  return {digest: value.digest, size: value.size}
}

/** Build a single-image, untagged OCI archive from pinned registry bytes. Keys stay on the owner machine. */
export async function exportRuntimeArchive(pin: RuntimePin, credentials: { username: string; token: string }, directory: string, maxBytes: number,
  fetcher: typeof fetch = fetch): Promise<string> {
  const auth = await fetcher('https://ghcr.io/token?service=ghcr.io&scope=repository:' + repository + ':pull', {
    headers: {Authorization: 'Basic ' + Buffer.from(credentials.username + ':' + credentials.token).toString('base64')}, redirect: 'error', signal: AbortSignal.timeout(15000),
  })
  if (!auth.ok) throw new Error('Could not obtain owner registry read access')
  const grant: unknown = await auth.json()
  if (!grant || typeof grant !== 'object' || !('token' in grant) || typeof grant.token !== 'string' || !grant.token) throw new Error('Registry did not issue read access')
  const headers = {Authorization: 'Bearer ' + grant.token}
  const response = await fetcher(registry + '/manifests/' + pin.manifestDigest, {headers: {...headers, Accept: 'application/vnd.oci.image.manifest.v1+json'},
    redirect: 'error', signal: AbortSignal.timeout(20000)})
  if (!response.ok) throw new Error('Could not read the immutable runtime manifest')
  const manifest = Buffer.from(await response.arrayBuffer())
  if (manifest.length > 1024 * 1024 || sha(manifest) !== pin.manifestDigest) throw new Error('Runtime manifest digest differs from the trusted pin')
  const doc: unknown = JSON.parse(manifest.toString())
  if (!doc || typeof doc !== 'object' || !('schemaVersion' in doc) || doc.schemaVersion !== 2 || !('mediaType' in doc) ||
    doc.mediaType !== 'application/vnd.oci.image.manifest.v1+json' || !('config' in doc) || !('layers' in doc) || !Array.isArray(doc.layers) ||
    !doc.layers.length || doc.layers.length > 256) throw new Error('Expected a single-platform OCI runtime image')
  const config = descriptor(doc.config), layers = doc.layers.map(descriptor)
  if (config.digest !== pin.configDigest) throw new Error('Runtime config digest differs from the trusted pin')
  const blobPath = (digest: string) => 'blobs/sha256/' + digest.slice(7)
  mkdirSync(join(directory, 'blobs/sha256'), { recursive: true })
  writeFileSync(join(directory, blobPath(pin.manifestDigest)), manifest, {flag:'wx'})
  let total = manifest.length + 4096
  const seen = new Set<string>()
  for (const blob of [config, ...layers]) {
    if (seen.has(blob.digest)) continue
    seen.add(blob.digest)
    total += blob.size + 1024
    if (total > maxBytes) throw new Error('Runtime archive exceeds the configured import limit')
    const download = await fetcher(registry + '/blobs/' + blob.digest, {headers, signal:AbortSignal.timeout(10 * 60_000)})
    if (!download.ok || !download.body) throw new Error('Could not download runtime blob')
    let bytes = 0
    const hash = createHash('sha256')
    await pipeline(Readable.from(download.body), new Transform({transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length
      hash.update(chunk)
      callback(bytes > blob.size ? new Error('Runtime blob exceeds descriptor') : null, chunk)
    }}), createWriteStream(join(directory, blobPath(blob.digest)), {flags:'wx',mode:0o600}))
    if (bytes !== blob.size || 'sha256:' + hash.digest('hex') !== blob.digest) throw new Error('Downloaded runtime blob differs from manifest')
  }
  writeFileSync(join(directory, 'oci-layout'), '{"imageLayoutVersion":"1.0.0"}')
  writeFileSync(join(directory, 'index.json'), JSON.stringify({schemaVersion:2, manifests:[{mediaType:doc.mediaType,digest:pin.manifestDigest,size:manifest.length}]}))
  writeFileSync(join(directory, 'manifest.json'), JSON.stringify([{Config:blobPath(config.digest),RepoTags:null,Layers:layers.map(layer=>blobPath(layer.digest))}]))
  const archive = join(directory, 'runtime.tar')
  execFileSync('tar',['--format=ustar','-cf',archive,'-C',directory,'oci-layout','index.json','manifest.json','blobs'])
  return archive
}
