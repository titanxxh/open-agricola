import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { withOwnedOperation, readJson } from './control.mjs'
import { localProof } from './local-proof.mjs'
import { github, inspectReviews } from './review.mjs'

const repository = 'titanxxh/open-agricola'
const fail = message => { throw new Error(message) }
const command = (cwd, executable, args) => execFileSync(executable, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 180000 }).trim()
const git = (cwd, ...args) => command(cwd, 'git', args)
const hash = value => crypto.createHash('sha256').update(value).digest('hex')

function configuration(request) {
  if (!request.config) return request
  const config = readJson(request.config)
  return { ...config, head: config.validatedHead, assignment: request.assignment, legacy: true,
    review: config.securityRequestDeferral ? null : 'security' }
}

function assertTarget(request, claim) {
  if (claim.kind === 'tooling' || request.head !== claim.head || (request.pr !== undefined && request.pr !== claim.pr)
    || (request.issue !== undefined && request.issue !== claim.issue)) fail('publication target differs from its exact assignment')
  if (typeof request.branch !== 'string' || request.branch === 'main' || request.branch.startsWith('audit/')
    || git(request.worktree, 'check-ref-format', '--branch', request.branch) !== request.branch
    || git(request.worktree, 'branch', '--show-current') !== request.branch) fail('publication requires the exact checked-out task branch')
  return claim.pr
}

function pullRequest(root, number, branch, expectedHead) {
  const result = github(root, ['api', `repos/${repository}/pulls/${number}`])
  if (result.number !== number || result.state !== 'open' || result.draft || result.base?.ref !== 'main'
    || result.base?.repo?.full_name !== repository || result.head?.repo?.full_name !== repository
    || result.head?.ref !== branch || (expectedHead && result.head.sha !== expectedHead)) fail('publication PR identity changed or head has not synchronized; reconcile before retry')
  return result
}

function normalProof(request, proof) {
  const normal = readJson(request.normal)
  const positive = value => Number.isSafeInteger(value) && value > 0
  const stages = ['frozen-native', 'frozen-strict', 'frozen-check-native', 'raw-prepare', 'raw-verify', 'prepush', 'local-proof']
  if (!normal || normal.status !== 'passed' || normal.tree !== proof.tree || !positive(request.sourceCases)) fail('complete-native validation is missing or stale')
  const frozen = normal.version !== undefined || normal.steps?.some(step => stages.includes(step.name))
  if (!frozen) {
    if (normal.sourceResponsibilitiesActualPassed !== request.sourceCases) fail('legacy complete-native validation is missing or stale')
    return normal
  }
  if (normal.version !== 1 || normal.head !== request.head || typeof normal.batch !== 'string' || !normal.batch.trim()
    || !Array.isArray(normal.steps) || JSON.stringify(normal.steps.map(step => step.name)) !== JSON.stringify(stages)
    || normal.steps.some(step => step.status !== 'passed' || !step.result || typeof step.result !== 'object' || Array.isArray(step.result))) fail('frozen normal proof requires the exact head and all seven passed stages')
  const targets = normal.targets
  if (!Array.isArray(targets) || !targets.length || new Set(targets).size !== targets.length || targets.some(file => typeof file !== 'string'
    || !/^server\/.+\.test\.ts$/.test(file) || file.includes('\\') || path.posix.normalize(file) !== file || file.split('/').includes('..'))) fail('frozen normal proof has incomplete native targets')
  const [native, strict, checked, prepared, raw, prepush, local] = normal.steps.map(step => step.result)
  if (!positive(native.tests) || native.passed !== native.tests || native.tests < targets.length || native.targets !== targets.length
    || native.sourceResponsibilitiesActualPassed !== request.sourceCases) fail('frozen native proof has incomplete test counts or responsibilities')
  if (strict.roots !== targets.length || !positive(strict.actualFiles) || strict.actualFiles < strict.roots || strict.diagnostics !== 0
    || !Array.isArray(strict.missingRoots) || strict.missingRoots.length) fail('frozen strict proof has incomplete roots or diagnostics')
  if (checked.typesExit !== 0 || checked.fileInventoryExit !== 0 || !Array.isArray(checked.missingTypeRoots) || checked.missingTypeRoots.length) fail('frozen native type proof is incomplete')
  if (prepared.raw !== request.raw || prepared.candidateCommit !== request.head || prepared.candidateFingerprint !== proof.rawCandidateFingerprint
    || raw.sourceResponsibilitiesActualPassed !== request.sourceCases || JSON.stringify(raw.summary) !== JSON.stringify(readJson(path.join(request.raw, 'summary.json')))) fail('frozen RAW stages differ from the current local proof')
  if (prepush.head !== request.head || prepush.status !== 'passed' || prepush.fingerprint !== proof.sourceFingerprint
    || local.head !== request.head || local.tree !== proof.tree || local.raw !== request.raw || local.prepush !== request.prepush
    || local.rawCandidateFingerprint !== proof.rawCandidateFingerprint || local.remoteChecked !== false) fail('frozen final stages differ from the current local proof')
  return { status: 'passed', head: normal.head, tree: normal.tree, targets, sourceResponsibilitiesActualPassed: native.sourceResponsibilitiesActualPassed,
    focus: { numTotalTests: native.tests, numPassedTests: native.passed, numFailedTests: 0, numPendingTests: 0 }, strict }
}

function validateLegacyScope(request, main) {
  if (!request.legacy) return
  if (!Array.isArray(request.reviewReports) || request.reviewReports.some(file => !fs.statSync(file).isFile())) fail('legacy review evidence is missing')
  if (request.requiredDelivery && readJson(request.requiredDelivery).merged !== true) fail('required prefix has not merged')
  const helpers = request.testHelperPaths ?? []
  if (!Array.isArray(helpers) || new Set(helpers).size !== helpers.length || helpers.some(file => typeof file !== 'string'
    || !file.startsWith('shared/') || !file.includes('/__tests__/') || !file.endsWith('.ts') || path.posix.normalize(file) !== file || file.split('/').includes('..'))) fail('invalid explicitly permitted shared test helper')
  const changed = git(request.worktree, 'diff', '--name-only', '-z', main, request.head).split('\0').filter(Boolean)
  if (!changed.length || changed.some(file => !file.startsWith('server/__tests__/') && file !== 'scripts/audit-migration/cases.json' && !helpers.includes(file))) fail('legacy publication exceeds its test-only source scope')
  const inputs = readJson(path.join(path.dirname(request.normal), 'strict-inputs.json'))
  for (const file of helpers) if (!changed.includes(file) || !inputs.some(item => item.file === path.join(request.worktree, file))
    || fs.lstatSync(path.join(request.worktree, file)).isSymbolicLink()) fail('shared test helper is not a checked strict input')
}

function bodyFor(request, proof, normal) {
  if (!request.legacy) {
    if (typeof request.bodyFile !== 'string' || !path.isAbsolute(request.bodyFile)) fail('publication requires an absolute bodyFile')
    const body = fs.readFileSync(request.bodyFile, 'utf8')
    if (!body.trim() || Buffer.byteLength(body) > 60000) fail('PR body must be nonempty and within 60000 bytes')
    return body
  }
  const summary = readJson(path.join(request.raw, 'summary.json'))
  const counts = fs.readFileSync(request.prepushLog, 'utf8').replace(/\u001b\[[0-9;]*m/g, '').split('\n')
    .filter(line => /^\s*(?:Test Files|Tests)\s+/.test(line)).map(line => line.trim())
  if (counts.length < 2) fail('legacy prepush counts are missing')
  const fields = { HEAD: request.head, VALIDATED_HEAD: request.validatedHead, TREE: proof.tree,
    FINGERPRINT: proof.sourceFingerprint, PREPUSH_COUNTS: counts.slice(-2).join('；'), RAW_TESTS: summary.passed,
    RAW_ROOTS: summary.includedTypeRoots, NORMAL_TESTS: normal.focus?.numPassedTests,
    NORMAL_ROOTS: normal.targets?.length, STRICT_INPUTS: normal.strict?.actualFiles }
  return fs.readFileSync(request.bodyTemplate, 'utf8').replace(/\$\$|\$\{([A-Z_]+)\}|\$([A-Z_]+)/g, (token, braced, bare) => {
    if (token === '$$') return '$'
    const field = braced ?? bare
    if (!Object.hasOwn(fields, field) || fields[field] === undefined) fail(`missing publication template field: ${field}`)
    return String(fields[field])
  })
}

function inputFile(workspace, claim, kind, payload) {
  const directory = path.join(workspace, 'operation-inputs', claim.worker, claim.id)
  fs.mkdirSync(directory, { recursive: true })
  const file = path.join(directory, `${kind}.json`)
  fs.writeFileSync(file, JSON.stringify(payload), { flag: 'wx', mode: 0o600 })
  return file
}

function existingReviewRequest(root, number, body, actor) {
  for (let page = 1; page <= 100; page++) {
    const comments = github(root, ['api', `repos/${repository}/issues/${number}/comments?per_page=100&page=${page}`])
    if (!Array.isArray(comments)) fail('incomplete review-request observation')
    if (comments.some(comment => comment.body === body && comment.user?.id === actor.id && comment.user?.login === actor.login)) return true
    if (comments.length < 100) return false
  }
  fail('review-request pagination is incomplete')
}

/** Publish an existing assigned PR only. Every mutation owns the pause lock. */
export async function publishExisting({ root, workspace, request }) {
  const config = configuration(request)
  const review = config.review
  if (![undefined, null, 'code', 'security'].includes(review)) fail('review must be code or security')
  const results = []
  const execute = (kind, callback) => withOwnedOperation({ root, workspace, assignment: config.assignment, operation: `publication:${kind}` }, claim => {
    const number = assertTarget(config, claim)
    const proof = localProof(config)
    const normal = config.legacy ? normalProof(config, proof) : null
    const main = github(root, ['api', `repos/${repository}/branches/main`]).commit.sha
    if (git(config.worktree, 'rev-parse', 'origin/main') !== main) fail('origin/main is stale; fetch/rebase and revalidate')
    git(config.worktree, 'merge-base', '--is-ancestor', main, config.head)
    validateLegacyScope(config, main)
    return callback({ claim, number, proof, normal })
  })
  results.push(await execute('push', ({ number }) => {
    const remote = pullRequest(root, number, config.branch)
    if (remote.head.sha === config.head) return { operation: 'push', state: 'already-current', head: config.head }
    if (config.expectedRemoteHead !== undefined && remote.head.sha !== config.expectedRemoteHead) fail('remote branch differs from the explicitly expected head')
    command(config.worktree, 'git', ['push', `--force-with-lease=refs/heads/${config.branch}:${remote.head.sha}`, 'origin', `HEAD:refs/heads/${config.branch}`])
    pullRequest(root, number, config.branch, config.head)
    return { operation: 'push', state: 'published', head: config.head }
  }))
  results.push(await execute('update-pr', ({ claim, number, proof, normal }) => {
    const remote = pullRequest(root, number, config.branch, config.head)
    const body = bodyFor(config, proof, normal)
    const payload = { body }
    if (config.title !== undefined) {
      if (typeof config.title !== 'string' || !config.title.trim() || config.title.length > 256) fail('invalid PR title')
      payload.title = config.title
    }
    if (remote.body === body && (payload.title === undefined || remote.title === payload.title)) return { operation: 'update-pr', state: 'already-current', bodySha256: hash(body) }
    const file = inputFile(workspace, claim, 'pr-body', payload)
    const updated = github(root, ['api', '-X', 'PATCH', `repos/${repository}/pulls/${number}`, '--input', file])
    if (updated.head?.sha !== config.head || updated.body !== body) fail('PR update response differs; reconcile before retry')
    return { operation: 'update-pr', state: 'updated', bodySha256: hash(body) }
  }))
  if (review) results.push(await execute('request-review', ({ claim, number }) => {
    pullRequest(root, number, config.branch, config.head)
    const observed = inspectReviews({ root, repository, pr: number, head: config.head })
    const gate = review === 'code' ? observed.codeReview : observed.securityReview
    if (gate?.state === 'pass') return { operation: 'request-review', state: 'already-passed', kind: review }
    const marker = `<!-- oa-audit-review-request:${review}:${config.head} -->`
    const body = `${review === 'security' ? '@codex security review' : '@codex review'}\n\n${marker}`
    const actor = github(root, ['api', 'user'])
    if (!Number.isSafeInteger(actor.id) || actor.id < 1 || typeof actor.login !== 'string' || !actor.login.trim()) fail('authenticated review-request author is unknown')
    if (existingReviewRequest(root, number, body, actor)) return { operation: 'request-review', state: 'already-requested', kind: review }
    const file = inputFile(workspace, claim, 'review-request', { body })
    const posted = github(root, ['api', '-X', 'POST', `repos/${repository}/issues/${number}/comments`, '--input', file])
    if (!Number.isSafeInteger(posted.id) || posted.id < 1 || posted.body !== body || posted.user?.id !== actor.id || posted.user?.login !== actor.login) fail('posted review request author/body is unknown; reconcile before retry')
    return { operation: 'request-review', state: 'requested', kind: review, commentId: posted.id, url: posted.html_url }
  }))
  return { mode: 'publication', head: config.head, results, reviewsWaived: false }
}
