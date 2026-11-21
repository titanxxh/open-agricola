import { createHash } from 'node:crypto'
import { ownerLocalRepository, rebindLocalReceipt, type OwnerLocalSelection } from './owner-local-admission.ts'
import {
  OWNER_LOCAL_ASSET, OWNER_LOCAL_CONTEXT, PRERELEASE_OWNER_LOCAL_CONTEXT,
  type LocalProof, type OwnerLocalProof, type PrereleaseOwnerLocalProof,
} from './owner-local-format.ts'
import { fullSha } from './verification-tasks.ts'

// Acceptance of owner-local evidence: the owner's native commit status, the release and asset it names, the asset
// bytes, and the receipt they carry, checked against the selected candidate and producer.

export type OwnerLocalGitHubReader = (endpoint: string, collection?: string) => unknown

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid owner-local evidence object')
  return Object.fromEntries(Object.entries(value))
}
const text = (value: unknown): string => { if (typeof value !== 'string' || !value) throw new Error('Invalid owner-local evidence text'); return value }
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid owner-local native identity')
  return value
}
const time = (value: unknown): number => {
  const result = Date.parse(text(value))
  if (!Number.isFinite(result) || result > Date.now() + 60_000) throw new Error('Invalid owner-local execution time')
  return result
}
const sha256 = (value: Buffer): string => createHash('sha256').update(value).digest('hex')

function tagSha(read: OwnerLocalGitHubReader, prefix: string, tag: string): string {
  let target = object(object(read(`${prefix}/git/ref/tags/${tag}`)).object)
  for (let depth = 0; depth < 10; depth++) {
    const sha = fullSha(text(target.sha))
    if (target.type === 'commit') return sha
    if (target.type !== 'tag') break
    target = object(object(read(`${prefix}/git/tags/${sha}`)).object)
  }
  throw new Error('Owner-local release tag does not identify an immutable commit')
}

type LocalVerificationInput = OwnerLocalSelection & {
  cwd: string; read: OwnerLocalGitHubReader; download: (endpoint: string) => Buffer; draftReleaseId?: number
}
function checkLocalVerification({ cwd, repository, repositoryId, candidateSha, producerSha, continuity, read, download, draftReleaseId }: LocalVerificationInput, channel: 'stable' | 'prerelease'): LocalProof | null {
  const prefix = `repos/${repository}`
  let statuses: unknown
  try { statuses = read(`${prefix}/commits/${candidateSha}/statuses?per_page=100`, '[]') } catch { return null }
  if (!Array.isArray(statuses)) throw new Error('Invalid native owner-local statuses')
  const candidates = statuses.map(object).filter(status => status.context === (channel === 'stable' ? OWNER_LOCAL_CONTEXT : PRERELEASE_OWNER_LOCAL_CONTEXT))
  if (!candidates.length) return null
  const authority = ownerLocalRepository(read(prefix), repository)
  if (authority.repositoryId !== repositoryId) throw new Error('Owner-local native repository identity differs')
  const status = candidates.filter(status => status.creator !== null && typeof status.creator === 'object'
    && 'id' in status.creator && status.creator.id === authority.ownerId).sort((a, b) => integer(b.id) - integer(a.id))[0]
  if (!status || status.state !== 'success') return null
  const url = text(status.target_url), marker = /^owner-local sha256:([a-f0-9]{64})$/.exec(text(status.description))
  const expectedPrefix = `https://github.com/${repository}/releases/download/`
  if (!marker || !url.startsWith(expectedPrefix)) throw new Error('Owner-local status must bind its exact native release asset digest')
  const version = url.slice(expectedPrefix.length).split('/')[0]
  const versionPattern = channel === 'stable' ? /^v\d+\.\d+\.\d+$/ : /^v\d+\.\d+\.\d+-beta\.[1-9]\d*$/
  if (!versionPattern.test(version) || url !== `${expectedPrefix}${version}/${OWNER_LOCAL_ASSET}`) throw new Error('Owner-local status target does not match its release channel')
  const release = object(read(draftReleaseId === undefined ? `${prefix}/releases/tags/${version}` : `${prefix}/releases/${integer(draftReleaseId)}`))
  if (draftReleaseId !== undefined && release.id !== draftReleaseId || release.tag_name !== version || release.prerelease !== (channel === 'prerelease')
    || release.draft !== false && !(draftReleaseId !== undefined && release.draft === true)
    || integer(object(release.author).id) !== authority.ownerId || tagSha(read, prefix, version) !== candidateSha || !Array.isArray(release.assets)) throw new Error('Owner-local release identity or publication differs')
  const assets = release.assets.map(object).filter(asset => asset.name === OWNER_LOCAL_ASSET), asset = assets[0]
  if (assets.length !== 1 || !asset || asset.state !== 'uploaded' || asset.browser_download_url !== url
    || integer(object(asset.uploader).id) !== authority.ownerId || integer(asset.size) > 1024 * 1024) throw new Error('Owner-local receipt asset is missing, unbounded or not uploaded by the owner')
  const bytes = download(`${prefix}/releases/assets/${integer(asset.id)}`)
  if (bytes.length !== asset.size || sha256(bytes) !== marker[1]) throw new Error('Owner-local receipt bytes differ from the owner status')
  let uploaded: unknown
  try { uploaded = JSON.parse(bytes.toString('utf8')) }
  catch (cause) { throw new Error('Owner-local receipt asset is not valid JSON', { cause }) }
  const receipt = rebindLocalReceipt(cwd, uploaded, { repository, repositoryId, candidateSha, producerSha, continuity }, channel)
  if (receipt.candidateSha !== candidateSha || object(uploaded).candidateSha !== candidateSha
    || time(status.created_at) + 1000 < time(receipt.completedAt) || time(asset.created_at) + 1000 < time(receipt.completedAt)
    || time(status.created_at) < time(asset.created_at) || time(release.created_at) > time(asset.created_at)
    || release.draft === false && time(release.published_at) + 1000 < time(receipt.completedAt)) throw new Error('Owner-local native evidence chronology differs from execution')
  const configuration = createHash('sha256').update(channel === 'stable' ? 'open-agricola-stable-main-verification-v1\0' : 'open-agricola-prerelease-verification-v1\0').update(receipt.configuration).update('\0').update(receipt.producerConfiguration).digest('hex')
  const proof: OwnerLocalProof = { kind: 'owner-local', configuration, producerConfiguration: receipt.producerConfiguration, receiptSha256: marker[1], statusId: integer(status.id),
    releaseId: integer(release.id), assetId: integer(asset.id), ownerId: authority.ownerId, url }
  return receipt.kind === OWNER_LOCAL_CONTEXT ? proof : { ...proof, kind: 'owner-local-prerelease', executionEvidenceSha256: receipt.execution.evidenceSha256 }
}

export function checkOwnerLocalVerification(input: LocalVerificationInput): OwnerLocalProof | null {
  const proof = checkLocalVerification(input, 'stable')
  if (proof && proof.kind !== 'owner-local') throw new Error('Expected stable owner-local authorization')
  return proof
}
export function checkPrereleaseOwnerLocalVerification(input: LocalVerificationInput): PrereleaseOwnerLocalProof | null {
  const proof = checkLocalVerification(input, 'prerelease')
  if (proof && proof.kind !== 'owner-local-prerelease') throw new Error('Expected prerelease owner-local authorization')
  return proof
}
