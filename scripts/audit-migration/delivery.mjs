import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { applyControl, readControl, readJson, withOwnedOperation, workflowDirectory } from './control.mjs'
import { github, inspectCi, inspectReviews, pullIdentity } from './review.mjs'
import { adoptLegacy } from './legacy.mjs'
import { localProof } from './local-proof.mjs'
export { localProof } from './local-proof.mjs'

const fail = message => { throw new Error(message) }
const gate = (state, reasons = [], evidence = []) => ({ state, reasons, evidence })
const command = (cwd, file, args) => execFileSync(file, args, { cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024 })
const git = (cwd, ...args) => command(cwd, 'git', args).trim()
const repository = 'titanxxh/open-agricola'
const requireRepository = request => {
  if (request.repository !== undefined && request.repository !== repository) fail('workflow target repository must be titanxxh/open-agricola')
}

export function workflowStatus(root, workspace, request) {
  requireRepository(request)
  workspace = workflowDirectory(root, workspace)
  const control = readControl(workspace)
  const review = inspectReviews({ root, repository, pr: request.pr, head: request.head })
  const scope = control.finishOnly.some(item => item.issue === request.issue && item.pr === request.pr && item.head === request.head)
  let source = gate('unknown', ['no current local proof paths provided'])
  if (request.worktree && request.raw && request.prepush) {
    try { source = gate('pass', [], [localProof(request)]) } catch (error) { source = gate('fail', [error.message]) }
  }
  const waiver = control.waivers.find(item => item.issue === request.issue && item.pr === request.pr && item.head === request.head && item.gates.includes('remoteCi'))
  const remoteCi = inspectCi({ root, repository, head: request.head, event: 'pull_request', names: ['CI', 'CI Full'] })
  const running = []
  const results = path.join(workspace, 'results')
  const walk = directory => {
    if (!fs.existsSync(directory)) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(file)
      else if (entry.name.endsWith('.started') && !fs.existsSync(file.slice(0, -8))) running.push(readJson(file))
    }
  }
  walk(results)
  const permission = gate(control.mode === 'active' || scope ? 'unknown' : 'fail', [control.mode === 'active' || scope ? 'a matching current-epoch assignment is required for execution' : 'paused without exact finish-only scope'])
  const blockers = [...permission.reasons]
  for (const name of ['identity', 'codeReview', 'securityReview', 'physicalThumb', 'threads']) if (review[name]?.state !== 'pass') blockers.push(`${name}: ${review[name]?.state ?? 'unknown'}`)
  if (source.state !== 'pass') blockers.push(`source/localPrepush/raw: ${source.state}`)
  if (!waiver && remoteCi.state !== 'pass') blockers.push(`remoteCi: ${remoteCi.state}`)
  return { ...review, mergePermitted: false, blockers, control, permission, runtime: { admissionPaused: control.mode === 'paused', alreadyAdmittedLocalOperations: running.filter(item => item.operation.startsWith('local-validation:')), alreadyAdmittedRemoteOperations: running.filter(item => !item.operation.startsWith('local-validation:')), processStopConfirmed: false }, source, localPrepush: source, raw: source, remoteCi, remoteCiRequirement: waiver ? { state: 'not-required', permission: waiver.id, authority: waiver.authority, observation: remoteCi } : { state: 'required' } }
}

export async function deliver({ root, workspace, request }) {
  requireRepository(request)
  if (request.reconcile === true) return reconcileDelivery({ root, workspace, request })
  if (request.legacyKind === 'publish') {
    const { publishExisting } = await import('./publish.mjs')
    return publishExisting({ root, workspace, request })
  }
  const operation = request.localOnly ? 'local-validation:local-proof' : 'delivery:merge'
  return withOwnedOperation({ root, workspace, assignment: request.assignment, operation }, claim => {
    if ((request.issue !== undefined && request.issue !== claim.issue) || request.pr !== claim.pr || request.head !== claim.head || claim.kind === 'tooling') fail('delivery target differs from assignment')
    request = { ...request, issue: claim.issue }
    const proof = localProof(request)
    if (request.localOnly) return { phase: 'local-proof', ...proof }
    const review = inspectReviews({ root, repository, pr: request.pr, head: request.head })
    const required = ['identity', 'codeReview', 'securityReview', 'physicalThumb', 'threads']
    if (required.some(name => review[name]?.state !== 'pass')) fail(`delivery review gates are not passed: ${required.filter(name => review[name]?.state !== 'pass').join(', ')}`)
    const main = github(root, ['api', `repos/${repository}/branches/main`]).commit.sha
    if (git(request.worktree, 'rev-parse', 'origin/main') !== main) fail('origin/main is stale; fetch/rebase and revalidate')
    command(request.worktree, 'git', ['merge-base', '--is-ancestor', main, request.head])
    const waiver = readControl(workspace).waivers.find(item => item.issue === request.issue && item.pr === request.pr && item.head === request.head && item.gates.includes('remoteCi'))
    if (!waiver) {
      const ci = inspectCi({ root, repository, head: request.head, event: 'pull_request', names: ['CI', 'CI Full'] })
      const mainCi = inspectCi({ root, repository, head: main, event: 'push', names: ['CI', 'CI Full', 'E2E'] })
      if (ci.state !== 'pass' || mainCi.state !== 'pass') fail('required PR and previous-main remote CI are not passed')
    }
    localProof(request)
    const finalPr = github(root, ['api', `repos/${repository}/pulls/${request.pr}`])
    const finalMain = github(root, ['api', `repos/${repository}/branches/main`]).commit.sha
    if (pullIdentity({ pull: finalPr, pr: request.pr, head: request.head, repository }).state !== 'pass' || finalMain !== main) fail('remote identity changed during delivery checks')
    if (request.merge !== true) return { phase: 'ready', head: request.head, proof, review, remoteCiRequired: !waiver }
    command(request.worktree, 'gh', ['pr', 'merge', String(request.pr), '--repo', repository, '--admin', '--rebase', '--match-head-commit', request.head])
    const merged = github(root, ['api', `repos/${repository}/pulls/${request.pr}`])
    if (pullIdentity({ pull: merged, pr: request.pr, head: request.head, repository, merged: true }).state !== 'pass') fail('merge result is unknown; reconcile exact PR/head before another claim')
    command(request.worktree, 'git', ['fetch', 'origin', 'main'])
    if (git(request.worktree, 'rev-parse', `${merged.merge_commit_sha}^{tree}`) !== proof.tree) fail('merged tree differs from locally reviewed source')
    const mergedCi = waiver ? { state: 'not-required', permission: waiver.id } : inspectCi({ root, repository, head: merged.merge_commit_sha, event: 'push', names: ['CI', 'CI Full', 'E2E'] })
    return { phase: mergedCi.state === 'pass' || waiver ? 'complete' : 'merged-awaiting-ci', head: request.head, mergeCommit: merged.merge_commit_sha, proof, review, mergedCi }
  })
}

export function reconcileDelivery({ root, workspace, request }) {
  requireRepository(request)
  workspace = workflowDirectory(root, workspace)
  if (!Number.isSafeInteger(request.pr) || request.pr < 1 || !/^[a-f0-9]{40}$/.test(request.head)) fail('reconciliation requires exact repository, PR and head')
  const pull = github(root, ['api', `repos/${repository}/pulls/${request.pr}`])
  const identity = pullIdentity({ pull, pr: request.pr, head: request.head, repository, merged: pull.merged === true })
  if (identity.state !== 'pass') fail(`reconciliation PR identity differs: ${identity.reasons.join('; ')}`)
  if (!pull.merged || !pull.merge_commit_sha) return { phase: 'unmerged', head: request.head, state: pull.state, remoteWrites: false }
  const merged = github(root, ['api', `repos/${repository}/git/commits/${pull.merge_commit_sha}`])
  const proof = localProof(request)
  if (merged.tree?.sha !== proof.tree) fail('merged tree differs from current locally validated tree')
  const review = inspectReviews({ root, repository, pr: request.pr, head: request.head, merged: true })
  const reviewComplete = ['identity', 'codeReview', 'securityReview', 'physicalThumb', 'threads'].every(name => review[name]?.state === 'pass')
  const waiver = readControl(workspace).waivers.find(item => item.issue === request.issue && item.pr === request.pr && item.head === request.head && item.gates.includes('remoteCi'))
  const mergedCi = inspectCi({ root, repository, head: pull.merge_commit_sha, event: 'push', names: ['CI', 'CI Full', 'E2E'] })
  return { phase: reviewComplete && (waiver || mergedCi.state === 'pass') ? 'complete' : 'merged-awaiting-gates', head: request.head, mergeCommit: pull.merge_commit_sha, proof, review, mergedCi, remoteCiRequirement: waiver ? { state: 'not-required', permission: waiver.id } : { state: 'required' }, remoteWrites: false }
}

export async function workflowCommand(root, action, options) {
  const workspace = workflowDirectory(root, options.get('run') ?? options.get('workspace'))
  const file = options.get('request')
  if (action === 'status') {
    const request = file ? readJson(file) : { pr: Number(options.get('pr')), head: options.get('head'), issue: options.has('issue') ? Number(options.get('issue')) : undefined }
    const result = workflowStatus(root, workspace, request)
    if (options.get('output')) fs.writeFileSync(options.get('output'), `${JSON.stringify(result, null, 2)}\n`)
    return result
  }
  if (typeof file !== 'string') fail(`${action} requires --request JSON`)
  const request = readJson(file)
  if (action === 'control') return applyControl({ root, workspace, request })
  if (action === 'adopt-legacy') return adoptLegacy({ root, workspace, request })
  if (action === 'publish') {
    const { publishExisting } = await import('./publish.mjs')
    return publishExisting({ root, workspace, request })
  }
  if (action === 'delivery') return deliver({ root, workspace, request })
  fail(`unknown workflow command: ${action}`)
}
