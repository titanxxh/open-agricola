// Fast rebind (#1778): after a formal release that leaves the identity boundary unchanged, the window re-measures only
// what the formal side can affect (handoff, boundary, audit chains, formal browser proof) and carries the rest of the
// evidence from the last full acceptance of the same candidate, image and generation.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { privateJson } from './context.mjs'

/**
 * Formal-side files that define the identity boundary pre relies on: handoff issue/exchange, sessions and logout,
 * Beta eligibility, account deletion, the browser policy and the gateway's copy of it. Broad routers (server/index.ts,
 * ws-server, PageRouter) are left out on purpose: the fast path still runs handoff and boundary on every engine
 * against the live formal build, which exercises those routes. Git pathspecs, relative to the repository root.
 */
export const IDENTITY_BOUNDARY_PATHS = [
  'client/app/PrereleaseHandoffPage.tsx',
  'client/services/prerelease.ts',
  'server/auth.ts',
  'server/auth-cookies.ts',
  'server/request-auth.ts',
  'server/http-origin.ts',
  'server/oauth/handler.ts',
  ':(glob)server/beta-access-*.ts',
  ':(glob)server/prerelease-*.ts',
  'shared/contract/beta-access.ts',
  'shared/contract/browser-auth.ts',
  'shared/contract/prerelease-identity.ts',
  ':(glob)server/database/*beta-access*.sql',
  ':(glob)server/database/*prerelease*.sql',
  ':(glob)server/database/*browser-auth*.sql',
  'scripts/prerelease/browser-policy.ts',
]

/** Steps the fast path marks done without running; their evidence comes from the last full acceptance. */
export const FAST_SKIPPED_STEPS = ['suite-multihand', 'suite-team', 'suite-sandbox', 'suite-viewer', 'suite-continuity', 'deletion', 'chain-deletion', 'deletion-rows']
export const FULL_ACCEPTANCE_MAX_AGE_MS = 7 * 24 * 60 * 60_000

const sha = /^[a-f0-9]{40}$/, digest = /^[a-f0-9]{64}$/
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex')

/** The archived copy of one evidence file: its recorded path, else the same name beside or under the acceptance file. */
function evidenceFile(acceptancePath, entry) {
  const name = basename(entry.path)
  return [entry.path, join(dirname(acceptancePath), 'evidence', name), join(dirname(acceptancePath), name)]
    .find(path => existsSync(path) && hashBytes(readFileSync(path)) === entry.sha256) ?? null
}

/**
 * Reads the last full acceptance and every evidence body it names, verified by hash. It must itself be full (no
 * carried item) and every body must name the same formal build, which is where the boundary diff starts.
 */
export function loadFullAcceptance(path) {
  const value = privateJson(path, 'Full acceptance'), sha256 = hashBytes(readFileSync(path))
  if (value?.format !== 1 || value.channel !== 'prerelease' || !sha.test(value.buildId ?? '') || typeof value.image !== 'string' || typeof value.generation !== 'string'
    || typeof value.acceptedAt !== 'number' || !value.evidence || typeof value.evidence !== 'object') throw new Error('Full acceptance is not a prerelease acceptance record')
  const evidence = {}, formalBuilds = new Set()
  for (const [item, entry] of Object.entries(value.evidence)) {
    if (item === 'formal-browser-policy') continue
    if (!entry || typeof entry.path !== 'string' || !digest.test(entry.sha256 ?? '')) throw new Error(`Full acceptance item ${item} is malformed`)
    const file = evidenceFile(path, entry)
    if (!file) throw new Error(`Full acceptance evidence ${item} is missing or changed; keep the archived evidence beside the acceptance file`)
    const body = JSON.parse(readFileSync(file, 'utf8'))
    if (body.item !== item || body.passed !== true) throw new Error(`Full acceptance evidence ${item} did not pass`)
    if (body.carriedFrom) throw new Error('The named acceptance carried evidence; point fullAcceptance at the last full acceptance')
    if (body.candidate !== value.buildId || body.generation !== value.generation) throw new Error(`Full acceptance evidence ${item} belongs to another candidate or generation`)
    formalBuilds.add(body.formalBuild)
    evidence[item] = { path: file, sha256: entry.sha256, body }
  }
  if (formalBuilds.size !== 1 || !sha.test([...formalBuilds][0] ?? '')) throw new Error('Full acceptance evidence must name one formal build')
  return { path, sha256, buildId: value.buildId, image: value.image, generation: value.generation, acceptedAt: value.acceptedAt, formalBuild: [...formalBuilds][0], evidence }
}

/**
 * Changed identity-boundary files between two formal builds, with the SHA-256 of the exact diff the owner can
 * acknowledge. `git(args)` returns stdout and throws on failure; full indexes keep the hash independent of the clone.
 */
export function boundaryDiff(git, from, to) {
  if (!sha.test(from) || !sha.test(to)) throw new Error('Boundary diff needs two full formal SHAs')
  const files = git(['diff', '--name-only', '--no-renames', from, to, '--', ...IDENTITY_BOUNDARY_PATHS]).split('\n').filter(Boolean).sort()
  const patch = git(['diff', '--no-color', '--no-ext-diff', '--no-renames', '--full-index', '--binary', from, to, '--', ...IDENTITY_BOUNDARY_PATHS])
  return { from, to, files, diffSha256: hashBytes(patch) }
}

/**
 * Mechanical path choice. Fast only when an owner did not force full, a full acceptance is named, it is younger than
 * seven days, it accepted the same installed candidate, image and generation, and the boundary diff from its formal
 * build is empty or exactly the acknowledged one.
 */
export function rebindDecision({ request = 'auto', full, status, boundary, acknowledged = null, now = Date.now() }) {
  const reasons = []
  if (request === 'full') reasons.push('owner requested a full acceptance')
  if (!full) reasons.push('no full acceptance is named')
  else {
    if (now - full.acceptedAt > FULL_ACCEPTANCE_MAX_AGE_MS) reasons.push('the last full acceptance is older than seven days')
    if (full.buildId !== status?.installed?.buildId) reasons.push('the installed candidate differs from the last full acceptance')
    if (full.image !== status?.installed?.image) reasons.push('the installed image differs from the last full acceptance')
    if (full.generation !== status?.generation) reasons.push('the data generation differs from the last full acceptance')
  }
  if (boundary?.files.length && boundary.diffSha256 !== acknowledged) reasons.push(`identity-boundary files changed: ${boundary.files.join(', ')}`)
  const record = { path: reasons.length ? 'full' : 'fast', reasons,
    ...(full ? { fullAcceptance: { path: full.path, sha256: full.sha256, acceptedAt: full.acceptedAt, formalBuild: full.formalBuild } } : {}),
    ...(boundary ? { boundary: { ...boundary, acknowledged: boundary.files.length > 0 && boundary.diffSha256 === acknowledged } } : {}) }
  return record
}
