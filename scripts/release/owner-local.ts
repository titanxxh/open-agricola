import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { admitFinalSnapshot, checkCandidateVerification } from '../ci/candidate-verification.ts'
import { OWNER_LOCAL_ASSET, OWNER_LOCAL_CONTEXT, ownerLocalRepository, rebindOwnerLocalReceipt } from '../ci/owner-local-verification.ts'
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
function releases(repository: string): Record<string, unknown>[] {
  return execFileSync('gh', ['api', `repos/${repository}/releases?per_page=100`, '--paginate', '--jq', '.[] | @json'], {
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).split('\n').filter(line => line.trim()).map(line => object(JSON.parse(line)))
}
function nativeId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new Error('Invalid native owner release identity')
  return value
}

export function publishOwnerLocalRelease(cwd: string, selected: { version: string; repository: string; sha: string; path: string }): void {
  const { version, repository, sha } = selected
  const { repositoryId, main } = admitFinalSnapshot(cwd, repository, sha)
  const authority = ownerLocalRepository(github(repository, ''), repository)
  const user = object(JSON.parse(execFileSync('gh', ['api', 'user'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })))
  if (authority.repositoryId !== repositoryId || user.id !== authority.ownerId || user.type !== 'User') throw new Error('Only the native repository owner may authorize local verification')
  const metadata = lstatSync(selected.path)
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size <= 0 || metadata.size > 1024 * 1024) throw new Error('Expected a bounded regular local verification receipt')
  const receipt = rebindOwnerLocalReceipt(cwd, JSON.parse(readFileSync(selected.path, 'utf8')), { repository, repositoryId, candidateSha: sha, producerSha: main })
  const bytes = Buffer.from(JSON.stringify(receipt) + '\n'), digest = createHash('sha256').update(bytes).digest('hex')
  const marker = `<!-- owner-local-verification:v1 ${sha} ${digest} -->`
  const existing = releases(repository).filter(release => release.tag_name === version)
  if (existing.length > 1) throw new Error('Multiple releases identify the local candidate version')
  let release = existing[0]
  if (release && (release.prerelease !== false || object(release.author).id !== authority.ownerId || commitRef(repository, `tags/${version}`) !== sha)) throw new Error('Existing local release differs from its owner, channel or fixed candidate')
  if (release?.draft === false) {
    const result = checkCandidateVerification(cwd, repository, sha)
    if (result.ownerLocal?.receiptSha256 !== digest || result.ownerLocal.releaseId !== nativeId(release.id)) throw new Error('Existing published release lacks the same owner-local authorization')
    console.log(JSON.stringify({ status: 'existing', channel: 'stable', verification: 'owner-local', version, sha, url: release.html_url }))
    return
  }
  if (release && (release.draft !== true || typeof release.body !== 'string' || !release.body.includes(marker) || release.target_commitish !== sha)) throw new Error('Only the matching draft prepared by owner-local publication may resume')
  ensureCommitRef(repository, `tags/${version}`, sha)
  if (!release) {
    const notes = object(api(repository, 'releases/generate-notes', 'POST', { tag_name: version, target_commitish: sha }))
    if (typeof notes.body !== 'string') throw new Error('GitHub did not generate formal release notes')
    release = object(api(repository, 'releases', 'POST', { tag_name: version, target_commitish: sha, name: version,
      draft: true, prerelease: false, body: `${marker}\n\n${notes.body}\n\nVerified on the owner's machine using the complete candidate task plan. Tested source: ${receipt.testedSha}. Candidate: ${sha}. Their source trees and verification configuration are identical.\n` }))
  }
  const releaseId = nativeId(release.id)
  const root = mkdtempSync(join(tmpdir(), 'oa-owner-local-publish-'))
  try {
    const path = join(root, OWNER_LOCAL_ASSET); writeFileSync(path, bytes, { mode: 0o600 })
    const current = object(github(repository, `releases/${releaseId}`))
    if (!Array.isArray(current.assets) || current.draft !== true || object(current.author).id !== authority.ownerId) throw new Error('Owner-local draft changed before receipt upload')
    const assets = current.assets.map(object).filter(asset => asset.name === OWNER_LOCAL_ASSET)
    if (assets.length > 1) throw new Error('Duplicate owner-local receipt assets')
    if (assets.length === 0) {
      execFileSync('gh', ['api', `https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${OWNER_LOCAL_ASSET}`,
        '--method', 'POST', '-H', 'Content-Type: application/json', '--input', path], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 })
    }
    const updated = object(github(repository, `releases/${releaseId}`))
    if (!Array.isArray(updated.assets)) throw new Error('Owner-local uploaded receipt is missing')
    const asset = updated.assets.map(object).find(asset => asset.name === OWNER_LOCAL_ASSET)
    const url = `https://github.com/${repository}/releases/download/${version}/${OWNER_LOCAL_ASSET}`
    if (!asset || asset.browser_download_url !== url || object(asset.uploader).id !== authority.ownerId) throw new Error('Owner-local uploaded receipt identity differs')
    const uploaded = execFileSync('gh', ['api', `repos/${repository}/releases/assets/${nativeId(asset.id)}`, '-H', 'Accept: application/octet-stream'], { maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
    if (!uploaded.equals(bytes)) throw new Error('Existing owner-local receipt bytes differ; preserve the draft and inspect it')
    api(repository, `statuses/${sha}`, 'POST', { state: 'success', context: OWNER_LOCAL_CONTEXT, description: `owner-local sha256:${digest}`, target_url: url })
    const authorized = checkCandidateVerification(cwd, repository, sha, { ownerDraftReleaseId: releaseId })
    if (authorized.ownerLocal?.receiptSha256 !== digest || authorized.ownerLocal.releaseId !== releaseId) throw new Error('Native owner-local authorization did not bind the prepared draft')
    api(repository, `releases/${releaseId}`, 'PATCH', { draft: false, make_latest: 'true' })
    const published = checkCandidateVerification(cwd, repository, sha)
    if (published.ownerLocal?.receiptSha256 !== digest || published.ownerLocal.releaseId !== releaseId) throw new Error('Published owner-local release could not be verified')
    console.log(JSON.stringify({ status: 'published', channel: 'stable', verification: 'owner-local', version, sha, url: updated.html_url }))
  } finally { rmSync(root, { recursive: true, force: true }) }
}
