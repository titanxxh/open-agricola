import { createHash } from 'node:crypto'
import { CONTAINER_IMAGE_REGISTRY } from '../release/container-images.ts'

const packageName = CONTAINER_IMAGE_REGISTRY.slice('ghcr.io/titanxxh/'.length)
const packageEndpoint = `https://api.github.com/user/packages/container/${packageName}`
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid registry metadata')
  return Object.fromEntries(Object.entries(value))
}

export function inspectRegistryManifest(value: unknown, imageId: string): void {
  const manifest = object(value)
  if (manifest.annotations && 'org.opencontainers.image.source' in object(manifest.annotations)) throw new Error('Registry manifest contains automatic repository linkage')
  if (manifest.schemaVersion !== 2 || manifest.manifests || object(manifest.config).digest !== imageId) throw new Error('Registry manifest differs from the verified single-platform image')
}

export type RegistryCredentials = { publishToken: string; probeToken: string; publisher: string; expectedPackageId: string }

async function registryResponse(reference: string, login?: { user: string; token: string }): Promise<Response | null> {
  if (!/^sha256:[a-f0-9]{64}$/.test(reference) && !/^[a-z0-9-]+$/.test(reference)) throw new Error('Invalid fixed registry reference')
  const headers: Record<string, string> = login ? { Authorization: `Basic ${Buffer.from(`${login.user}:${login.token}`).toString('base64')}` } : {}
  const auth = await fetch(`https://ghcr.io/token?service=ghcr.io&scope=repository:titanxxh/${packageName}:pull`,
    { headers, signal: AbortSignal.timeout(10_000), redirect: 'error' })
  if (auth.status === 401 || auth.status === 403) return null
  if (!auth.ok) throw new Error('Registry access probe failed; inspect owner package setup')
  const body = object(await auth.json())
  if (typeof body.token !== 'string' || !body.token) throw new Error('Registry returned no scoped token')
  const response = await fetch(`https://ghcr.io/v2/titanxxh/${packageName}/manifests/${reference}`, {
    headers: { Authorization: `Bearer ${body.token}`, Accept: 'application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' },
    signal: AbortSignal.timeout(10_000), redirect: 'error',
  })
  if (response.status === 401 || response.status === 403) return null
  if (!response.ok) throw new Error('Cannot establish access to the known registry version; inspect owner package setup')
  return response
}

export async function assertPrivateReadDenials(reference: string, credentials: RegistryCredentials): Promise<void> {
  if (await registryResponse(reference)) throw new Error('Private image permits anonymous reads')
  if (await registryResponse(reference, { user: process.env.GITHUB_ACTOR ?? credentials.publisher, token: credentials.probeToken })) {
    throw new Error('Private image grants this public repository access; review Actions/Codespaces package setup')
  }
}

export async function publishedRegistryManifest(reference: string, imageId: string, credentials: RegistryCredentials): Promise<string> {
  const response = await registryResponse(reference, { user: credentials.publisher, token: credentials.publishToken })
  if (!response) throw new Error('Publisher cannot read the uploaded private image')
  const bytes = Buffer.from(await response.arrayBuffer())
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`
  if (response.headers.get('docker-content-digest') !== digest) throw new Error('Registry manifest content digest mismatch')
  inspectRegistryManifest(JSON.parse(bytes.toString('utf8')), imageId)
  return digest
}

export async function checkPrivateRegistry(credentials: RegistryCredentials, afterFirstPublish = false): Promise<number | null> {
  if (credentials.publisher !== 'titanxxh' || !credentials.publishToken || !credentials.probeToken || credentials.publishToken === credentials.probeToken) {
    throw new Error('Separate namespace-owner publish and repository-read credentials are required')
  }
  const headers = { Authorization: `Bearer ${credentials.publishToken}`, Accept: 'application/vnd.github+json' }
  const who = await fetch('https://api.github.com/user', { headers, signal: AbortSignal.timeout(10_000) })
  if (!who.ok || object(await who.json()).login !== 'titanxxh') throw new Error('Dedicated registry publisher must own the private namespace')
  const response = await fetch(packageEndpoint, { headers, signal: AbortSignal.timeout(10_000) })
  if (response.status === 404 && credentials.expectedPackageId === '' && !afterFirstPublish) return null
  if (!response.ok) throw new Error('Private package setup is required')
  const metadata = object(await response.json())
  if (metadata.visibility !== 'private' || metadata.repository != null) throw new Error('Package must be private and independent of repository permissions')
  if (typeof metadata.id !== 'number' || !Number.isSafeInteger(metadata.id) || metadata.id < 1 || metadata.name !== packageName
    || metadata.package_type !== 'container' || String(metadata.id) !== credentials.expectedPackageId && !(afterFirstPublish && credentials.expectedPackageId === '')) {
    throw new Error('Existing package has no matching owner setup identity; inspect independent ACL and set GHCR_PRIVATE_PACKAGE_ID')
  }
  const versions = await fetch(`${packageEndpoint}/versions?per_page=1`, { headers, signal: AbortSignal.timeout(10_000) })
  const entries: unknown = await versions.json()
  if (!versions.ok || !Array.isArray(entries) || typeof object(entries[0]).name !== 'string') throw new Error('Private package setup needs an existing immutable version for access checks')
  const reference = object(entries[0]).name
  if (typeof reference !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(reference)) throw new Error('Package version is not an immutable manifest digest')
  await assertPrivateReadDenials(reference, credentials)
  return metadata.id
}
