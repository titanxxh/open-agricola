import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { admitFinalSnapshot, assertCandidateCheckout, checkCandidateVerification, mainCommit } from '../ci/candidate-verification.ts'
import { OWNER_LOCAL_ASSET, OWNER_LOCAL_CONTEXT, PRERELEASE_OWNER_LOCAL_CONTEXT, ownerLocalRepository, rebindOwnerLocalReceipt, rebindPrereleaseOwnerLocalReceipt } from '../ci/owner-local-verification.ts'
import { admitPrereleaseSnapshot, checkPrereleaseVerification, fixPrereleaseCandidate } from '../ci/prerelease-verification.ts'
import { commitRef, ensureCommitRef, github } from './candidate.ts'

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid owner-local release metadata')
  return Object.fromEntries(Object.entries(value))
}
function api(repository: string, endpoint: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): unknown {
  const output = execFileSync('gh', ['api', `repos/${repository}/${endpoint}`, '--method', method, ...(body === undefined ? [] : ['--input', '-'])], {
    input: body === undefined ? undefined : JSON.stringify(body), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  })
  return output.trim() ? JSON.parse(output) : null
}
function collection(repository: string, endpoint: string): Record<string, unknown>[] {
  return execFileSync('gh', ['api', `repos/${repository}/${endpoint}`, '--paginate', '--jq', '.[] | @json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).split('\n').filter(line => line.trim()).map(line => object(JSON.parse(line)))
}
function nativeId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid native owner release identity')
  return value
}
function nativeTime(value: unknown): number {
  const time = typeof value === 'string' ? Date.parse(value) : NaN
  if (!Number.isFinite(time) || time > Date.now() + 60_000) throw new Error('Invalid native owner release chronology')
  return time
}
type DraftBinding = { channel: 'stable' | 'prerelease'; repository: string; version: string; sha: string; releaseId: number; ownerId: number; marker: string }
function draftRelease(binding: DraftBinding) {
  const { repository, version, sha, releaseId, ownerId, marker } = binding
  const release = object(github(repository, `releases/${releaseId}`))
  if (release.id !== releaseId || release.tag_name !== version || release.target_commitish !== sha || release.draft !== true
    || release.prerelease !== (binding.channel === 'prerelease') || object(release.author).id !== ownerId || typeof release.body !== 'string'
    || !release.body.includes(marker) || !Array.isArray(release.assets) || commitRef(repository, `tags/${version}`) !== sha) throw new Error('Owner-local prepared draft identity changed')
  return { createdAt: nativeTime(release.created_at), assets: release.assets.map(object) }
}
function draftAsset(binding: DraftBinding, bytes: Buffer, completedAt: number) {
  const release = draftRelease(binding), assets = release.assets.filter(asset => asset.name === OWNER_LOCAL_ASSET), asset = assets[0]
  const prefix = `https://github.com/${binding.repository}/releases/download/`
  const url = asset?.browser_download_url
  const validUrl = typeof url === 'string' && (url === `${prefix}${binding.version}/${OWNER_LOCAL_ASSET}`
    || url.startsWith(prefix) && new RegExp(`^untagged-[a-f0-9]{1,64}/${OWNER_LOCAL_ASSET.replace('.', '\\.')}$`).test(url.slice(prefix.length)))
  if (assets.length !== 1 || !asset || asset.state !== 'uploaded' || asset.size !== bytes.length
    || object(asset.uploader).id !== binding.ownerId || !validUrl) throw new Error('Owner-local uploaded receipt identity differs')
  const id = nativeId(asset.id), createdAt = nativeTime(asset.created_at)
  if (createdAt + 1000 < completedAt || release.createdAt > createdAt) throw new Error('Owner-local draft asset chronology differs')
  const uploaded = execFileSync('gh', ['api', `repos/${binding.repository}/releases/assets/${id}`, '-H', 'Accept: application/octet-stream'], { maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
  if (!uploaded.equals(bytes)) throw new Error('Existing owner-local receipt bytes differ; preserve the draft and inspect it')
  return { id, createdAt }
}
function verifyDraftStatus(binding: DraftBinding, digest: string, target: string, assetCreatedAt: number): void {
  const latest = collection(binding.repository, `commits/${binding.sha}/statuses?per_page=100`)
    .filter(status => status.context === (binding.channel === 'stable' ? OWNER_LOCAL_CONTEXT : PRERELEASE_OWNER_LOCAL_CONTEXT) && status.creator !== null && typeof status.creator === 'object'
      && 'id' in status.creator && status.creator.id === binding.ownerId).sort((a, b) => nativeId(b.id) - nativeId(a.id))[0]
  if (!latest || latest.state !== 'success' || latest.target_url !== target || latest.description !== `owner-local sha256:${digest}`) throw new Error('Native owner-local authorization did not bind the prepared draft')
  nativeId(latest.id)
  if (nativeTime(latest.created_at) < assetCreatedAt) throw new Error('Native owner-local status predates the prepared asset')
}
function publishedReleaseUrl(binding: DraftBinding): string {
  const release = object(JSON.parse(execFileSync('gh', ['api', `repos/${binding.repository}/releases/${binding.releaseId}`], {
    encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  })))
  const url = `https://github.com/${binding.repository}/releases/tag/${binding.version}`
  if (release.id !== binding.releaseId || release.tag_name !== binding.version || release.draft !== false || release.prerelease !== (binding.channel === 'prerelease')
    || object(release.author).id !== binding.ownerId || release.html_url !== url || commitRef(binding.repository, `tags/${binding.version}`) !== binding.sha) throw new Error('Published owner-local release identity differs')
  return url
}

function reconcilePublishedRelease(cwd: string, binding: DraftBinding, digest: string, assetId: number): string {
  const prerelease = binding.channel === 'prerelease'
  const verifier = prerelease ? '../ci/prerelease-verification.ts' : '../ci/candidate-verification.ts'
  const output = execFileSync(process.execPath, [join(import.meta.dirname, verifier), 'check',
    '--repository', binding.repository, '--sha', binding.sha], {
    cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
  })
  const result = object(JSON.parse(output)), proof = object(result.ownerLocal)
  if (result.status !== 'passed' || result.repository !== binding.repository || result.sha !== binding.sha
    || proof.kind !== (prerelease ? 'owner-local-prerelease' : 'owner-local') || proof.receiptSha256 !== digest || proof.releaseId !== binding.releaseId
    || proof.assetId !== assetId || proof.ownerId !== binding.ownerId) throw new Error('Native published proof differs from the owner-local publication')
  return publishedReleaseUrl(binding)
}

export function publishOwnerLocalRelease(cwd: string, selected: { version: string; repository: string; sha: string; path: string; channel?: 'stable' | 'prerelease' }): void {
  const { version, repository, sha, channel = 'stable' } = selected
  const admit = () => {
    if (channel === 'stable') return admitFinalSnapshot(cwd, repository, sha)
    const producer = mainCommit(repository)
    assertCandidateCheckout(resolve(import.meta.dirname, '../..'), producer)
    if (commitRef(repository, 'heads/prerelease') !== sha) throw new Error('Owner-local prerelease must match the current integration branch')
    fixPrereleaseCandidate(cwd, repository, sha)
    const source = admitPrereleaseSnapshot(cwd, repository, sha)
    if (source.main !== producer) throw new Error('Protected main changed during prerelease authorization')
    return source
  }
  const check = () => channel === 'stable' ? checkCandidateVerification(cwd, repository, sha) : checkPrereleaseVerification(cwd, repository, sha)
  const rebind = channel === 'stable' ? rebindOwnerLocalReceipt : rebindPrereleaseOwnerLocalReceipt
  const authority = ownerLocalRepository(github(repository, ''), repository)
  const user = object(JSON.parse(execFileSync('gh', ['api', 'user'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })))
  if (user.id !== authority.ownerId || user.type !== 'User') throw new Error('Only the native repository owner may authorize local verification')
  const { repositoryId, main } = admit()
  if (authority.repositoryId !== repositoryId) throw new Error('Owner-local repository identity changed')
  const metadata = lstatSync(selected.path)
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size <= 0 || metadata.size > 1024 * 1024) throw new Error('Expected a bounded regular local verification receipt')
  const receipt = rebind(cwd, JSON.parse(readFileSync(selected.path, 'utf8')), { repository, repositoryId, candidateSha: sha, producerSha: main })
  const bytes = Buffer.from(JSON.stringify(receipt) + '\n'), digest = createHash('sha256').update(bytes).digest('hex')
  const marker = `<!-- owner-local-verification:v1 ${sha} ${digest} -->`
  const existing = collection(repository, 'releases?per_page=100').filter(release => release.tag_name === version)
  if (existing.length > 1) throw new Error('Multiple releases identify the local candidate version')
  let release = existing[0]
  if (release && (release.prerelease !== (channel === 'prerelease') || object(release.author).id !== authority.ownerId || commitRef(repository, `tags/${version}`) !== sha)) throw new Error('Existing local release differs from its owner, channel or fixed candidate')
  if (release?.draft === false) {
    const result = check()
    if (result.ownerLocal?.receiptSha256 !== digest || result.ownerLocal.releaseId !== nativeId(release.id)) throw new Error('Existing published release lacks the same owner-local authorization')
    const url = publishedReleaseUrl({ channel, repository, version, sha, releaseId: nativeId(release.id), ownerId: authority.ownerId, marker })
    console.log(JSON.stringify({ status: 'existing', channel, verification: 'owner-local', version, sha, url }))
    return
  }
  if (release && (release.draft !== true || typeof release.body !== 'string' || !release.body.includes(marker) || release.target_commitish !== sha)) throw new Error('Only the matching draft prepared by owner-local publication may resume')
  ensureCommitRef(repository, `tags/${version}`, sha)
  if (!release) {
    const notes = object(api(repository, 'releases/generate-notes', 'POST', { tag_name: version, target_commitish: sha }))
    if (typeof notes.body !== 'string') throw new Error('GitHub did not generate formal release notes')
    release = object(api(repository, 'releases', 'POST', { tag_name: version, target_commitish: sha, name: version,
      draft: true, prerelease: channel === 'prerelease', body: `${marker}\n\n${notes.body}\n\nVerified on the owner's machine using the complete candidate task plan. Tested source: ${receipt.testedSha}. Candidate: ${sha}. Their source trees and verification configuration are identical.\n` }))
  }
  const releaseId = nativeId(release.id)
  const binding = { channel, repository, version, sha, releaseId, ownerId: authority.ownerId, marker }
  const root = mkdtempSync(join(tmpdir(), 'oa-owner-local-publish-'))
  try {
    const path = join(root, OWNER_LOCAL_ASSET); writeFileSync(path, bytes, { mode: 0o600 })
    const current = draftRelease(binding)
    const assets = current.assets.filter(asset => asset.name === OWNER_LOCAL_ASSET)
    if (assets.length > 1) throw new Error('Duplicate owner-local receipt assets')
    if (assets.length === 0) {
      execFileSync('gh', ['api', `https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${OWNER_LOCAL_ASSET}`,
        '--method', 'POST', '-H', 'Content-Type: application/json', '--input', path], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 })
    }
    const url = `https://github.com/${repository}/releases/download/${version}/${OWNER_LOCAL_ASSET}`
    const asset = draftAsset(binding, bytes, Date.parse(receipt.completedAt))
    api(repository, `statuses/${sha}`, 'POST', { state: 'success', context: channel === 'stable' ? OWNER_LOCAL_CONTEXT : PRERELEASE_OWNER_LOCAL_CONTEXT, description: `owner-local sha256:${digest}`, target_url: url })
    verifyDraftStatus(binding, digest, url, asset.createdAt)
    if (draftAsset(binding, bytes, Date.parse(receipt.completedAt)).id !== asset.id) throw new Error('Owner-local draft receipt changed before publication')
    const final = admit()
    rebind(cwd, receipt, { repository, repositoryId: final.repositoryId, candidateSha: sha, producerSha: final.main })
    try { api(repository, `releases/${releaseId}`, 'PATCH', { draft: false, make_latest: channel === 'stable' ? 'true' : 'false' }) }
    catch (publicationError) {
      let publishedUrl: string
      try { publishedUrl = reconcilePublishedRelease(cwd, binding, digest, asset.id) }
      catch (readbackError) {
        throw new AggregateError([publicationError, readbackError], 'Owner-local publication response failed and native published proof could not be confirmed; inspect the existing release before retrying', { cause: readbackError })
      }
      console.log(JSON.stringify({ status: 'published', channel, verification: 'owner-local', version, sha, url: publishedUrl }))
      return
    }
    const published = check()
    if (published.ownerLocal?.receiptSha256 !== digest || published.ownerLocal.releaseId !== releaseId || published.ownerLocal.assetId !== asset.id) throw new Error('Published owner-local release could not be verified')
    const publishedUrl = publishedReleaseUrl(binding)
    console.log(JSON.stringify({ status: 'published', channel, verification: 'owner-local', version, sha, url: publishedUrl }))
  } finally { rmSync(root, { recursive: true, force: true }) }
}
