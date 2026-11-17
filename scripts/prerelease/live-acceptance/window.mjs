// Owner-only scripted reverify window (#1731): after an accepted formal deploy, reverify the installed prerelease
// candidate in place and reopen it with fresh acceptance. One command; it stops at the first failure, prints what to
// run next and never retries by itself. Progress lives in <windowDirectory>/state.json with one log per step.
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { caseLabels, SUITE_ENGINES } from './suites.mjs'
import { acceptanceRecord, collectResults } from './evidence.mjs'
import { loadAcceptanceConfig, privateDirectory, privateJson } from './context.mjs'
import { logoutAll, setBeta } from './formal-admin.mjs'
import { loginBudget } from './login-budget.mjs'
import { FAST_SKIPPED_STEPS, IDENTITY_BOUNDARY_PATHS, boundaryDiff, loadFullAcceptance, rebindDecision } from './rebind.mjs'

const root = resolve(import.meta.dirname, '../../..')
const CLI = 'scripts/prerelease/live-acceptance/cli.mjs'
/** Must equal the constant in owner-accounts/create.mjs, which runs alone inside the formal container. */
export const DISPOSABLE_AUTHORIZATION = 'disposable-nonadmin-prerelease-acceptance-accounts'
export const LIMITS = { closeToReverifyMs: 10 * 60_000, auditToActivateMs: 30_000, activateToOpenMs: 30_000, proofMaxAgeMs: 30 * 60_000 }
// Stop before a hard limit the formal authority or host enforces, instead of sending a request it will refuse.
const HEADROOM_MS = 5_000

export const SUITE_STEPS = [
  { step: 'suite-handoff', suite: 'handoff', args: [] },
  { step: 'suite-boundary', suite: 'boundary', args: [] },
  { step: 'suite-multihand', suite: 'multihand', args: ['--guest', 'B'] },
  { step: 'suite-team', suite: 'team', args: ['--players', 'A,B,D,E'] },
  { step: 'suite-sandbox', suite: 'sandbox', args: [] },
  { step: 'suite-viewer', suite: 'viewer', args: [], room: true },
  { step: 'suite-continuity', suite: 'continuity', args: [], room: true },
]
const SUITE_RUNS = [...SUITE_STEPS, { step: 'deletion', suite: 'deletion', args: ['--labels', 'D,E'] }, { step: 'readback', suite: 'readback', args: [] }]
// The optional policy phase (#1778) moves host owner-tools to the owner's newer main SHA inside the same closure:
// checkout, maintain (stops the app), import that SHA's trusted-policy image. The installed candidate stays; `open`
// then reuses its earlier complete verification (installed receipt continuity), so no candidate import or deploy runs.
export const POLICY_STEPS = ['policy-host', 'policy-maintain', 'policy-import']
export const WINDOW_STEPS = ['policy-host', 'preconditions', 'policy-maintain', 'policy-import', 'reverify', 'accounts', 'chain-initial', ...SUITE_STEPS.map(entry => entry.step),
  'deletion', 'chain-deletion', 'deletion-rows', 'owner-notes', 'bundle', 'formal-browser', 'copy-evidence', 'final-open', 'readback', 'cleanup', 'archive']

export class WindowStop extends Error {
  constructor(message, next = []) { super(message); this.name = 'WindowStop'; this.next = next }
}

const sha = /^[a-f0-9]{40}$/, uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const hashFile = path => createHash('sha256').update(readFileSync(path)).digest('hex')

/**
 * { format: 1, windowId, generation, formalFrom, formalBuild, previousRun, run, windowDirectory, exchangeDirectory, ownerNotes?,
 *   policy?, fullAcceptance?, acknowledgeBoundaryDiff?, rebind? }. `fullAcceptance` names the last full acceptance file (its
 *   evidence archived beside it) that a fast rebind carries from; `rebind: 'full'` forces the full suites.
 */
export function parseWindowConfig(value) {
  if (value?.format !== 1) throw new Error('Window config format 1 is required')
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(value.windowId ?? '')) throw new Error('Window id must be a short lowercase label')
  if (!uuid.test(value.generation ?? '')) throw new Error('Window generation must be the installed pre data generation UUID')
  if (!sha.test(value.formalFrom ?? '') || !sha.test(value.formalBuild ?? '') || value.formalFrom === value.formalBuild) throw new Error('formalFrom and formalBuild must be the previous and new formal SHAs')
  // Host and owner read receipts at identical paths, so the exchange directory is an absolute path valid on both.
  if (!/^\/[A-Za-z0-9._/-]+$/.test(value.exchangeDirectory ?? '') || value.exchangeDirectory.split('/').includes('..')) throw new Error('Exchange directory must be a plain absolute path')
  for (const key of ['previousRun', 'run', 'windowDirectory']) if (typeof value[key] !== 'string' || !value[key]) throw new Error(`Window config needs ${key}`)
  if (value.ownerNotes !== undefined && (typeof value.ownerNotes !== 'string' || !value.ownerNotes)) throw new Error('ownerNotes must be a path')
  if (value.policy !== undefined) parsePolicy(value.policy)
  if (value.fullAcceptance !== undefined && (typeof value.fullAcceptance !== 'string' || !value.fullAcceptance)) throw new Error('fullAcceptance must be a path')
  if (value.acknowledgeBoundaryDiff !== undefined && !/^[a-f0-9]{64}$/.test(value.acknowledgeBoundaryDiff)) throw new Error('acknowledgeBoundaryDiff must be the SHA-256 of the identity-boundary diff')
  if (value.rebind !== undefined && !['auto', 'full'].includes(value.rebind)) throw new Error("rebind must be 'auto' or 'full'")
  return value
}

/**
 * { from, to, image: { run, attempt, artifact }, authFile, dependenciesInstalled?, guardRestarted? }: host owner-tools
 * moves from `from` to `to` (the owner checkout HEAD); the image ids name the successful trusted-policy build of `to`.
 */
function parsePolicy(policy) {
  if (!policy || typeof policy !== 'object' || !sha.test(policy.from ?? '') || !sha.test(policy.to ?? '') || policy.from === policy.to) throw new Error('policy needs the previous and new host owner-tools SHAs')
  const image = policy.image ?? {}
  if (!['run', 'attempt', 'artifact'].every(key => Number.isSafeInteger(image[key]) && image[key] > 0)) throw new Error('policy.image needs the trusted-policy build run, attempt and artifact ids')
  if (typeof policy.authFile !== 'string' || !policy.authFile.startsWith('/')) throw new Error('policy.authFile must be the absolute private GHCR read credential path')
  for (const key of ['dependenciesInstalled', 'guardRestarted']) if (policy[key] !== undefined && policy[key] !== true) throw new Error(`policy.${key} may only be true`)
  return policy
}

/** Relative TypeScript/ESM import closure of one entry file in `directory`; the storage guard runs exactly this code. */
export function importClosure(directory, entry) {
  const seen = new Set(), pending = [entry]
  while (pending.length) {
    const file = pending.pop()
    if (seen.has(file)) continue
    seen.add(file)
    const text = readFileSync(join(directory, file), 'utf8')
    for (const match of text.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const base = join(dirname(file), match[1])
      const resolved = [base, `${base}.ts`, `${base}.mjs`, `${base}/index.ts`].find(path => existsSync(join(directory, path)) && statSync(join(directory, path)).isFile())
      if (resolved) pending.push(resolved)
    }
  }
  return [...seen].sort()
}

// ---- State: pure transitions, persisted after every change -------------------------------------------------------

export const newState = (windowId, now) => ({ format: 1, windowId, createdAt: now, ops: {}, steps: {} })

export function markStep(state, step, status, now, extra = {}) {
  if (!WINDOW_STEPS.includes(step)) throw new Error(`Unknown window step ${step}`)
  const previous = state.steps[step] ?? { attempts: 0 }
  const entry = status === 'started'
    ? { status, attempts: previous.attempts + 1, startedAt: now }
    : { ...previous, ...extra, status, finishedAt: now }
  return { ...state, steps: { ...state.steps, [step]: entry } }
}

export const nextStep = state => WINDOW_STEPS.find(step => state.steps[step]?.status !== 'done') ?? null

/** Marks every unfinished step up to and including `step` done, e.g. after finding the target already opened by it. */
export function markThrough(state, step, now, note) {
  let next = state
  for (const name of WINDOW_STEPS.slice(0, WINDOW_STEPS.indexOf(step) + 1)) if (next.steps[name]?.status !== 'done') next = markStep(next, name, 'done', now, { note })
  return next
}

/** The formal browser proof must be ≤30 min old at `open`; an old proof and the evidence copy that embeds it are redone. */
export function staleSteps(state, now) {
  const proof = state.steps['formal-browser']
  if (proof?.status !== 'done' || state.steps['final-open']?.status === 'done') return []
  return now - proof.finishedAt > LIMITS.proofMaxAgeMs - 5 * 60_000 ? ['formal-browser', 'copy-evidence'] : []
}

export function resetSteps(state, steps) {
  const remaining = { ...state.steps }
  for (const step of steps) delete remaining[step]
  return { ...state, steps: remaining }
}

/** Reverify keeps one operation id across attempts; every attempt needs a fresh close (receipts are valid 10 min). */
export function reverifyOps(state, mint = randomUUID) {
  return { reverify: state.ops.reverify ?? mint(), close: mint() }
}

/** Case/engine pairs a suite still lacks: a passing newest result, from a run that kept the public origin closed. */
export function suiteGaps(results, suite) {
  const required = SUITE_ENGINES[suite].flatMap(engine => caseLabels(suite, engine).map(label => ({ case: label, engine })))
  return required.filter(pair => !results.some(row => row.result.case === pair.case && row.engine === pair.engine && row.result.passed === true
    && (row.run.mode !== 'maintenance' || row.run.publicStill503 === true)))
}

/** Exact commands that rerun only the missing or failed cases, one per engine. */
export function rerunCommands({ configPath, runDirectory, room }, suiteStep, gaps) {
  const entry = SUITE_RUNS.find(candidate => candidate.step === suiteStep)
  const engines = [...new Set(gaps.map(gap => gap.engine))]
  return engines.map(engine => ['node', '--import', 'tsx', CLI, 'run', '--config', configPath, '--run', runDirectory, '--suite', entry.suite, ...entry.args,
    ...(entry.room ? ['--room', room] : []), '--engine', engine, '--case', gaps.filter(gap => gap.engine === engine).map(gap => gap.case).join(',')].join(' '))
}

/**
 * What --resume does with an unfinished step. Suites finish from evidence; account creation and deletion are not
 * re-entrant, so after an interruption they continue only with --confirm-step <step>, which first checks the target.
 */
export function resumeDecision(step, entry, { gaps = null, confirmed = false, fast = false } = {}) {
  if (!entry) return { action: 'run' }
  if (entry.status === 'done') return { action: 'skip' }
  if (gaps && gaps.length === 0) return { action: 'complete', reason: 'every required case has a passing newest result' }
  // On the fast path the accounts step creates nothing; granting Beta again is harmless.
  if (step === 'accounts' && fast) return { action: 'run' }
  if (step === 'accounts') return confirmed ? { action: 'check-accounts' }
    : { action: 'stop', reason: 'Account creation may already have committed; rerun with --confirm-step accounts to check the formal accounts and continue' }
  if (step === 'deletion') return confirmed ? { action: 'run' }
    : { action: 'stop', reason: 'The deletion suite is not re-entrant; check the D/E rows, then rerun with --confirm-step deletion only if the accounts still exist' }
  if (gaps) return { action: 'stop', reason: `Suite ${step} still lacks passing results; rerun the listed cases, then --resume` }
  return { action: 'run' }
}

/**
 * Whether pre is open, and under this window's acceptance. After a lost `open` response the host may already be
 * open; it counts as ours only when its acceptance hash, build, generation and formal build all match this window.
 */
export function openBinding(status, { candidate, generation, formalBuild, reverifyOperationId, acceptance }) {
  if (status?.mode !== 'open') return 'closed'
  const ours = !!acceptance && status.acceptance?.sha256 === acceptance.sha256 && acceptance.operationId === reverifyOperationId
    && acceptance.buildId === candidate && acceptance.generation === generation && status.installed?.buildId === candidate
    && status.generation === generation && status.acceptance?.formalBuildId === formalBuild
  return ours ? 'ours' : 'other'
}

/**
 * A `verify-open` file is usable for ten minutes; reuse it only while at least five remain, so the chain and `open`
 * that follow it always finish inside its limit. Anything older, unreadable or missing is verified again.
 */
export function verifiedOpenFresh(path, now = Date.now()) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'))
    return typeof value.verifiedAt === 'number' && value.verifiedAt <= now && now - value.verifiedAt < 5 * 60_000
  } catch { return false }
}

export function assertWithin(label, elapsedMs, limitMs) {
  if (elapsedMs > limitMs - HEADROOM_MS) throw new WindowStop(`${label} took ${elapsedMs} ms, beyond the ${limitMs} ms limit; rerun with --resume to repeat the step`)
}

// ---- Accounts and owner notes -------------------------------------------------------------------------------------

export function accountRequest(operationId, random = randomBytes) {
  return { authorization: DISPOSABLE_AUTHORIZATION, operationId, accounts: ['D', 'E'].map(label => ({
    label, username: `preacc_${label.toLowerCase()}_${random(6).toString('hex')}`, password: random(24).toString('base64url'), displayName: `Pre acceptance ${label}`,
  })) }
}

/** The private team accounts file the suites read, joined by label with what the formal helper created. */
export function teamAccounts(request, created) {
  return { format: 1, purpose: 'Team 4-seat acceptance (D, E), delete after acceptance', operationId: request.operationId, accounts: request.accounts.map(account => {
    const row = created.find(entry => entry.label === account.label)
    if (!row || row.username !== account.username || typeof row.id !== 'string' || !row.id) throw new Error(`Formal account ${account.label} was not created as requested`)
    return { id: row.id, username: account.username, password: account.password, displayName: account.displayName }
  }) }
}

/** The previous window's archived team room, which continuity and the Viewer read after reverification. */
export function previousTeamRoom(previousRun) {
  for (const name of readdirSync(previousRun).filter(file => /^result-team-.+\.json$/.test(file)).sort().reverse()) {
    const result = JSON.parse(readFileSync(join(previousRun, name), 'utf8')).results?.find(row => row.case === 'team-game')
    if (result?.passed === true && uuid.test(result.roomId ?? '')) return result.roomId
  }
  throw new Error('The previous run has no passing team game room')
}

/** Per-run network retries and bounded evaluations, so the owner notes show where a pass needed help. */
export function runDiagnostics(runDirectory) {
  return readdirSync(runDirectory).filter(file => /^result-.+\.json$/.test(file)).sort().flatMap(file => {
    const run = JSON.parse(readFileSync(join(runDirectory, file), 'utf8'))
    const networkRetries = run.networkRetries ?? [], boundedEvaluations = run.boundedEvaluations ?? []
    return networkRetries.length || boundedEvaluations.length ? [{ file, suite: run.suite, engine: run.engine, passed: run.passed, networkRetries, boundedEvaluations }] : []
  })
}

const isPlain = value => value && typeof value === 'object' && !Array.isArray(value)
/** Generated facts win over owner text with the same key; the owner file only adds notes. */
function mergeNotes(generated, owner) {
  const merged = { ...owner }
  for (const [key, value] of Object.entries(generated)) merged[key] = isPlain(value) && isPlain(owner[key]) ? mergeNotes(value, owner[key]) : value
  return merged
}

/**
 * Requires a complete zero-row snapshot for deleted D/E on formal and pre. Formal deletion may finish in the
 * background (HTTP 202), so a nonzero snapshot fails the collecting step and a resume collects it again.
 */
export function assertNoResidualRows(rows) {
  const missing = ['D', 'E'].filter(label => !rows[label] || !rows[label].formal || !rows[label].pre)
  if (missing.length) throw new WindowStop(`Deletion row counts for ${missing.join(', ')} are missing; collect them again with --resume true`)
  const left = Object.entries(rows).flatMap(([label, scopes]) => Object.entries(scopes).flatMap(([scope, counts]) => Object.entries(counts)
    .filter(([, count]) => count !== 0).map(([table, count]) => `${label} ${scope}.${table}=${count}`)))
  if (left.length) throw new WindowStop(`Deleted accounts still have rows (${left.join(', ')}); wait for deletion to finish or repair it, then --resume true`)
}

/**
 * Generated owner notes. A full window proves D/E deletion here; a fast rebind deleted nobody, so its deletion-audit
 * item is carried and only the path decision (with any acknowledged boundary diff) is added to the boundary item.
 */
export function ownerNotes({ candidate, formalFrom, formalTo, rows = null, receipts = null, diagnostics, rebind = null }, owner = {}) {
  const fast = rebind?.path === 'fast'
  if (!fast) {
    assertNoResidualRows(rows)
    for (const name of ['close', 'associations', 'identity-verified', 'audit', 'activate']) if (!receipts?.[name]?.sha256) throw new Error(`Deletion audit receipt ${name} is missing`)
  }
  return mergeNotes({
    'retained-data': { reverify: { installed: candidate, formalFrom, formalTo, note: 'The formal build changed; pre was reverified in place without reinstalling or resetting data.' } },
    ...(fast ? {} : { 'deletion-audit': { accounts: ['D', 'E'], remainingRows: rows, receipts } }),
    'browser-boundary': { diagnostics, ...(rebind ? { rebind } : {}) },
  }, owner)
}

// ---- Process and host I/O (injectable for tests) ------------------------------------------------------------------

function writePrivateJson(path, value) {
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); chmodSync(temporary, 0o600); renameSync(temporary, path)
}

/** Default I/O: child processes in the trusted owner checkout, logged to the current step's log file. */
export function processIo() {
  let logPath = null
  const log = text => { if (logPath && text) appendFileSync(logPath, text.endsWith('\n') ? text : text + '\n', { mode: 0o600 }) }
  return {
    fetch: (...args) => fetch(...args),
    setLog: path => { logPath = path },
    log,
    run(command, args, { input, timeoutMs = 10 * 60_000, quiet = false } = {}) {
      log(`$ ${[command, ...args].join(' ')}  # ${new Date().toISOString()}`)
      const result = spawnSync(command, args, { cwd: root, input, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] })
      if (!quiet) { log(result.stdout ?? ''); log(result.stderr ?? '') }
      return { status: result.error ? null : result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '', error: result.error?.message ?? null }
    },
  }
}

const must = (result, label) => {
  if (result.status !== 0) throw new WindowStop(`${label} failed (${result.error ?? `exit ${result.status}`}): ${(result.stderr || result.stdout).trim().split('\n').slice(-3).join(' | ').slice(0, 600)}`)
  return result.stdout
}
const lastJson = text => JSON.parse(text.trim().split('\n').at(-1))

function hostTools(io, ctx) {
  const host = ctx.config.ssh, target = ctx.config.targetConfig, cookie = ctx.config.ownerCookie
  const ssh = (command, input, label = 'ssh') => must(io.run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', host, command], { input, timeoutMs: 120_000 }), label)
  const script = (body, label) => must(io.run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', host, 'bash', '-s'], { input: body + '\n', timeoutMs: 120_000 }), label).trim()
  const toHost = (paths, directory) => must(io.run('scp', ['-q', '-p', '-r', ...paths, `${host}:${directory}/`], { timeoutMs: 5 * 60_000 }), 'copy to host')
  const fromHost = (path, local) => must(io.run('scp', ['-q', '-p', `${host}:${path}`, local], { timeoutMs: 5 * 60_000 }), 'copy from host')
  const deploy = (action, extra = [], timeoutMs = 10 * 60_000) => lastJson(must(io.run('./deploy-prerelease.sh', [action, '--config', target, '--ssh', host, '--expected-current', ctx.config.candidate, ...extra],
    { timeoutMs }), `deploy-prerelease ${action}`))
  const authority = (action, generation, operationId, extra) => must(io.run(process.execPath, ['--import', 'tsx', 'scripts/prerelease/authority.ts', action,
    '--config', target, '--cookie-file', cookie, '--generation', generation, '--operation-id', operationId, ...extra], { timeoutMs: 120_000 }), `authority ${action}`)
  const cli = (args, timeoutMs = 10 * 60_000) => io.run(process.execPath, ['--import', 'tsx', CLI, ...args], { timeoutMs })
  const formalContainer = `${ctx.target.formal.project}-app-1`
  if (!/^[a-z0-9][a-z0-9_.-]*$/.test(formalContainer)) throw new Error('Invalid formal container name')
  /** Copies one owner-accounts helper into the formal container, runs it with JSON on stdin, then removes it. */
  const formalHelper = (name, input, env = {}) => {
    const remote = `/tmp/oa-window-${name}-${randomUUID()}.mjs`
    const source = readFileSync(join(root, 'scripts/prerelease/owner-accounts', `${name}.mjs`)).toString('base64')
    ssh(`docker exec -i ${formalContainer} sh -c 'umask 077; base64 -d > ${remote}'`, source, `install ${name} helper`)
    try {
      const flags = Object.entries(env).map(([key, value]) => { if (!/^[A-Z_]+$/.test(key) || !/^[A-Za-z0-9._-]+$/.test(value)) throw new Error('Invalid helper env'); return `-e ${key}=${value}` }).join(' ')
      const result = io.run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', host,
        `docker exec -i -w /app ${flags} ${formalContainer} timeout 80 node --import ./scripts/typescript-runtime.mjs ${remote}`], { input: JSON.stringify(input), timeoutMs: 120_000, quiet: true })
      return lastJson(must(result, `${name} helper`))
    } finally { io.run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', host, `docker exec ${formalContainer} rm -f ${remote}`], { timeoutMs: 60_000 }) }
  }
  return { ssh, script, toHost, fromHost, deploy, authority, cli, formalHelper }
}

// ---- Steps --------------------------------------------------------------------------------------------------------

/** Reads the live target and decides whether an `open` it reports belongs to this window's acceptance file. */
function liveOpen(t, ctx, win, reverifyOperationId, acceptancePath) {
  const live = t.deploy('status')
  const previous = existsSync(acceptancePath) ? { ...JSON.parse(readFileSync(acceptancePath, 'utf8')), sha256: hashFile(acceptancePath) } : null
  return { live, binding: openBinding(live, { candidate: ctx.config.candidate, generation: win.generation, formalBuild: win.formalBuild, reverifyOperationId, acceptance: previous }) }
}
const OPEN_ELSEWHERE = 'Pre is already open under a different acceptance or build; inspect it before continuing this window'

function storageCycle(t, ctx) {
  const cycle = t.script(`python3 -c "import json;print(json.load(open('${ctx.target.directory}/control/storage-guard.json'))['healthyCycle'])"`, 'storage guard')
  if (!uuid.test(cycle)) throw new WindowStop('The prerelease storage guard is not healthy')
  return cycle
}

async function liveFormalBuild(io, origins) {
  const read = async url => { const response = await io.fetch(url, { signal: AbortSignal.timeout(15_000) }); return { status: response.status, body: await response.json().catch(() => ({})) } }
  const pages = await read(origins.formalApp + '/frontend-build.json'), policy = await read(origins.formalApi + '/api/auth/browser-policy'), health = await read(origins.formalApi + '/api/health')
  return { pages: pages.body.gameBuildId ?? null, policy: policy.body.buildId ?? null, healthy: health.status === 200 && health.body.ok === true }
}

/** Audit chain on the installed candidate. Nothing runs between audit-complete and activate (<30 s apart). */
async function auditChain(io, tools, win, tag) {
  const X = win.exchangeDirectory, file = name => join(X, `${tag}-${name}.json`)
  const ops = { close: randomUUID(), associate: randomUUID(), audit: randomUUID(), activate: randomUUID() }
  writePrivateJson(file('ops'), ops)
  tools.authority('close', win.generation, ops.close, ['--output', file('close')])
  const identities = tools.deploy('identities'); writePrivateJson(file('identities'), identities)
  tools.fromHost(identities.path, file('identities-manifest'))
  tools.authority('associate', win.generation, ops.associate, ['--manifest', file('identities-manifest'), '--output', file('associations')])
  tools.toHost([file('associations')], X)
  const applied = tools.deploy('apply-identities', ['--associations', file('associations')]); writePrivateJson(file('apply'), applied)
  tools.fromHost(applied.path, file('identity-verified'))
  tools.authority('audit-complete', win.generation, ops.audit, ['--verification', file('identity-verified'), '--output', file('audit')])
  const audited = Date.now()
  assertWithin('audit-complete → activate', Date.now() - audited, LIMITS.auditToActivateMs)
  tools.authority('activate', win.generation, ops.activate, ['--audit', file('audit'), '--output', file('activate')])
  const activatedAt = Date.now()
  tools.toHost([file('activate'), file('audit'), file('identity-verified')], X)
  return { activatedAt, files: Object.fromEntries(['close', 'associations', 'identity-verified', 'audit', 'activate'].map(name => [name, file(name)])) }
}

function runSuite(tools, env, entry) {
  const args = ['run', '--config', env.configPath, '--run', env.runDirectory, '--suite', entry.suite, ...entry.args, ...(entry.room ? ['--room', env.room()] : [])]
  const result = tools.cli(args, 45 * 60_000)
  const gaps = suiteGaps(collectResults([env.runDirectory]), entry.suite)
  if (result.status !== 0 || gaps.length) {
    const next = rerunCommands({ configPath: env.configPath, runDirectory: env.runDirectory, room: entry.room ? env.room() : null }, entry.step, gaps)
    throw new WindowStop(`Suite ${entry.suite} did not pass (exit ${result.status}); rerun only the listed cases, then --resume`, next.length ? next : [`node --import tsx ${CLI} ${args.join(' ')}`])
  }
  return {}
}

/**
 * Decides fast or full once per window from the last full acceptance and the identity-boundary diff of the formal
 * builds. The formal SHAs are fetched into the owner checkout when missing.
 */
function decideRebind(io, win, status, now) {
  let full = null
  if (win.fullAcceptance) {
    try { full = loadFullAcceptance(win.fullAcceptance) }
    catch (error) { throw new WindowStop(`The named full acceptance is unusable (${error.message}); fix fullAcceptance or remove it to run the full suites`) }
  }
  const git = args => must(io.run('git', args), `git ${args[0]}`)
  let boundary = null
  if (full) {
    const missing = [full.formalBuild, win.formalBuild].filter(sha => io.run('git', ['cat-file', '-e', `${sha}^{commit}`], { quiet: true }).status !== 0)
    if (missing.length) git(['fetch', '--no-tags', 'origin', ...missing])
    boundary = boundaryDiff(git, full.formalBuild, win.formalBuild)
  }
  return rebindDecision({ request: win.rebind ?? 'auto', full, status, boundary, acknowledged: win.acknowledgeBoundaryDiff ?? null, now })
}

function makeSteps({ io, win, env, getCtx, reload, setOps, state, setRebind, now = Date.now }) {
  const X = win.exchangeDirectory
  const tools = () => hostTools(io, getCtx())
  const local = name => join(X, name)
  const policy = win.policy
  const steps = {
    async 'policy-host'() {
      if (!policy) return {}
      const ctx = getCtx(), t = tools(), directory = ctx.target.policyDirectory
      const head = must(io.run('git', ['rev-parse', 'HEAD']), 'git rev-parse').trim()
      if (head !== policy.to) throw new WindowStop(`Run the policy window from an owner checkout at ${policy.to.slice(0, 12)}, not ${head.slice(0, 12)}`)
      if (must(io.run('git', ['status', '--porcelain', '--untracked-files=no']), 'git status').trim()) throw new WindowStop('The owner checkout has tracked local edits')
      const changed = must(io.run('git', ['diff', '--name-only', policy.from, policy.to]), 'git diff').trim().split('\n').filter(Boolean)
      if (!/^[A-Za-z0-9._/-]+$/.test(directory)) throw new Error('Unexpected host owner-tools path')
      const moved = t.script(`set -e
T='${directory}'
[ -z "$(git -C "$T" status --porcelain --untracked-files=no)" ] || { echo 'host owner-tools has tracked edits' >&2; exit 3; }
current=$(git -C "$T" rev-parse HEAD)
if [ "$current" != '${policy.to}' ]; then
  [ "$current" = '${policy.from}' ] || { echo "host owner-tools is at $current, not the window policy.from" >&2; exit 4; }
  git -C "$T" fetch -q origin main
  git -C "$T" checkout -q --detach '${policy.to}'
fi
git -C "$T" rev-parse HEAD`, 'host owner-tools checkout')
      if (moved !== policy.to) throw new WindowStop(`Host owner-tools reports ${moved.slice(0, 12)} after checkout`)
      // `maintain` refuses language packs that differ from the policy pin; the packs are ignored build output.
      if (changed.includes('i18n.ref')) t.script(`set -e\ncd '${directory}'\npnpm run build:i18n >&2\necho built`, 'host language packs')
      if ((changed.includes('package.json') || changed.includes('pnpm-lock.yaml')) && !policy.dependenciesInstalled) {
        throw new WindowStop('Host owner-tools dependencies changed with the policy', [`ssh ${ctx.config.ssh} "cd ${directory} && pnpm install --frozen-lockfile"`, 'then set policy.dependenciesInstalled true in the window config and --resume'])
      }
      // The gateway is recreated by `maintain` when its mounted files change; the supervised storage guard is not.
      const guard = importClosure(root, 'scripts/prerelease/storage-guard-cli.ts')
      if (changed.some(file => guard.includes(file) || file === 'scripts/typescript-runtime.mjs') && !policy.guardRestarted) {
        throw new WindowStop('The storage guard code changed with the policy', [`ssh ${ctx.config.ssh} "sudo systemctl restart open-agricola-prerelease-storage-guard.service"`, 'then set policy.guardRestarted true in the window config and --resume'])
      }
      return {}
    },
    async 'policy-maintain'() {
      if (!policy) return {}
      const t = tools(), close = local('policy-close.json')
      t.authority('close', win.generation, randomUUID(), ['--output', close])
      t.toHost([close], X)
      const result = t.deploy('maintain', ['--authority-receipt', close])
      if (result.mode !== 'maintenance') throw new WindowStop('maintain did not leave pre in maintenance')
      return { close, maintain: writeAndReturn(local('policy-maintain.json'), result) }
    },
    async 'policy-import'() {
      if (!policy) return {}
      const operation = state().ops.policyImport ?? randomUUID()
      setOps({ policyImport: operation })
      // Retrying keeps the operation id, so an interrupted transfer resumes from its journal.
      const result = tools().deploy('import-image', ['--purpose', 'trusted-policy', '--sha', policy.to, '--build-run', String(policy.image.run),
        '--build-attempt', String(policy.image.attempt), '--artifact-id', String(policy.image.artifact), '--auth-file', policy.authFile, '--operation-id', operation], 30 * 60_000)
      return { import: writeAndReturn(local('policy-import.json'), result) }
    },
    async preconditions() {
      const ctx = getCtx(), live = await liveFormalBuild(io, ctx.origins)
      if (live.pages !== win.formalBuild || live.policy !== win.formalBuild || !live.healthy) throw new WindowStop(`Formal API, Pages and health must all be on ${win.formalBuild} before reverifying pre`)
      if (ctx.config.formalBuild !== win.formalBuild) {
        const raw = privateJson(env.configPath, 'Acceptance config'); writePrivateJson(env.configPath, { ...raw, formalBuild: win.formalBuild }); reload()
      }
      const t = tools()
      const head = must(io.run('git', ['rev-parse', 'HEAD']), 'git rev-parse').trim()
      if (must(io.run('git', ['status', '--porcelain', '--untracked-files=no']), 'git status').trim()) throw new WindowStop('The owner checkout has tracked local edits')
      const hostHead = t.ssh(`git -C '${getCtx().target.policyDirectory}' rev-parse HEAD`, undefined, 'host owner-tools HEAD').trim()
      if (head !== hostHead) throw new WindowStop(`Owner checkout ${head.slice(0, 12)} differs from host owner-tools ${hostHead.slice(0, 12)}; run from a checkout at the host policy SHA`)
      const status = t.deploy('status')
      if (status.installed?.buildId !== getCtx().config.candidate || status.generation !== win.generation) throw new WindowStop('The installed pre candidate or generation differs from the window config')
      storageCycle(t, getCtx())
      mkdirSync(X, { recursive: true, mode: 0o700 }); chmodSync(X, 0o700); privateDirectory(X, 'Exchange directory')
      t.ssh(`mkdir -p -m 700 '${X}' && chmod 700 '${X}'`, undefined, 'host exchange directory')
      // The path is fixed by the first decision; a resume that would decide differently stops instead of mixing paths.
      const rebind = decideRebind(io, win, status, now())
      // A boundary change is the owner's call: stop before fixing a path so they can acknowledge it or choose full.
      if (rebind.path === 'full' && win.rebind !== 'full' && rebind.boundary?.files.length && !rebind.boundary.acknowledged && rebind.reasons.length === 1) {
        throw new WindowStop(`Identity-boundary files changed since the last full acceptance (${rebind.boundary.files.join(', ')}). Review the diff, then set acknowledgeBoundaryDiff to ${rebind.boundary.diffSha256} for the fast path or rebind to "full", and rerun with --resume true`,
          [`git diff ${rebind.boundary.from} ${rebind.boundary.to} -- ${IDENTITY_BOUNDARY_PATHS.map(path => `'${path}'`).join(' ')}`])
      }
      const earlier = state().rebind
      if (earlier && earlier.path !== rebind.path) throw new WindowStop(`This window started on the ${earlier.path} path but would now take the ${rebind.path} path (${rebind.reasons.join('; ') || 'nothing forces full'}); start a new window`)
      if (!earlier) setRebind(rebind)
      if (rebind.path === 'full' && !getCtx().config.teamAccounts) throw new WindowStop('The acceptance config must name a teamAccounts file for D/E')
      return { status: writeAndReturn(local('pre-status.json'), status), rebind: writeAndReturn(local('rebind.json'), earlier ?? rebind) }
    },
    async reverify() {
      const t = tools(), ops = reverifyOps(state()); setOps({ reverify: ops.reverify })
      t.authority('close', win.generation, ops.close, ['--output', local('close.json')])
      const closed = Date.now()
      t.toHost([local('close.json')], X)
      assertWithin('close → reverify', Date.now() - closed, LIMITS.closeToReverifyMs)
      const result = t.deploy('reverify', ['--operation-id', ops.reverify, '--authority-receipt', local('close.json')])
      if (result.mode !== 'maintenance' || result.operation?.id !== ops.reverify || result.operation?.kind !== 'reverify') throw new WindowStop('Reverify did not leave pre in its own acceptance maintenance')
      return { close: local('close.json'), reverify: writeAndReturn(local('reverify.json'), result) }
    },
    async accounts({ decision }) {
      const t = tools(), ctx = getCtx(), requestPath = join(win.windowDirectory, 'accounts-request.json')
      // A and B of every engine need Beta for this window; the fast path creates no disposable accounts.
      const grantEngines = async () => {
        const rows = {}
        for (const [engine, accounts] of Object.entries(getCtx().engineAccounts)) {
          rows[engine] = await setBeta({ origins: getCtx().origins, ownerCookieFile: getCtx().config.ownerCookie, fetchImpl: io.fetch }, 'grant', accounts, ['A', 'B'])
          if (!rows[engine].beta.A || !rows[engine].beta.B) throw new WindowStop(`Beta was not granted to ${engine} A and B`)
        }
        return rows
      }
      if (state().rebind?.path === 'fast') return { beta: writeAndReturn(join(win.windowDirectory, 'beta-granted.json'), { engines: await grantEngines() }) }
      let request, created = null
      if (decision.action === 'check-accounts') {
        request = privateJson(requestPath, 'Saved account request')
        const rows = t.formalHelper('check', { accounts: request.accounts.map(({ label, username }) => ({ label, username })) })
        if (rows.every(row => row.exists && row.id)) created = rows.map(row => ({ label: row.label, id: row.id, username: request.accounts.find(a => a.label === row.label).username }))
        else if (rows.some(row => row.exists)) throw new WindowStop('Only some disposable accounts exist; resolve them by hand before continuing')
      } else {
        request = accountRequest(randomUUID()); writePrivateJson(requestPath, request)
      }
      if (!created) created = t.formalHelper('create', request, { EXPECTED_FORMAL_BUILD: win.formalBuild }).accounts
      writePrivateJson(ctx.config.teamAccounts, teamAccounts(request, created)); reload()
      const beta = await setBeta({ origins: getCtx().origins, ownerCookieFile: getCtx().config.ownerCookie, fetchImpl: io.fetch }, 'grant', [...getCtx().accounts, ...getCtx().team], ['A', 'B', 'D', 'E'])
      if (!['A', 'B', 'D', 'E'].every(label => beta.beta[label])) throw new WindowStop('Beta was not granted to every acceptance account')
      return { beta: writeAndReturn(join(win.windowDirectory, 'beta-granted.json'), { ...beta, engines: await grantEngines() }) }
    },
    'chain-initial': async () => (await auditChain(io, tools(), win, 'initial')).files,
    deletion: async () => runSuite(tools(), env, SUITE_RUNS.find(entry => entry.step === 'deletion')),
    'chain-deletion': async () => (await auditChain(io, tools(), win, 'deletion')).files,
    async 'deletion-rows'() {
      const t = tools(), ctx = getCtx()
      const ids = ctx.team.map(account => { if (!/^[A-Za-z0-9_-]+$/.test(account.id)) throw new Error('Unexpected account id format'); return { label: account.label, id: account.id } })
      const formal = t.formalHelper('formal-rows', { accounts: ids })
      const sql = 'BEGIN READ ONLY; ' + ids.map(({ label, id }) => `SELECT '${label}', (SELECT count(*) FROM prerelease_retained_identity_refs WHERE user_id='${id}'), `
        + `(SELECT count(*) FROM room_players WHERE user_id='${id}'), (SELECT count(*) FROM users WHERE id='${id}')`).join(' UNION ALL ') + '; COMMIT;'
      const out = t.script(`G='${ctx.config.guardConfig}'
PG=$(python3 -c "import json;print(json.load(open('$G'))['postgresContainer'])"); AD=$(python3 -c "import json;print(json.load(open('$G'))['postgresAdmin'])")
docker exec "$PG" psql -X -qAt -F, -U "$AD" -d '${ctx.target.database.name}' -c "${sql}" < /dev/null`, 'pre deletion rows')
      const rows = {}
      for (const line of out.split('\n').filter(Boolean)) {
        const [label, refs, players, users] = line.split(',')
        rows[label] = { formal: formal[label], pre: { retained_identity_refs: Number(refs), room_players: Number(players), users: Number(users) } }
      }
      // Keep the snapshot for inspection, but only a zero snapshot completes the step.
      const path = writeAndReturn(local('deletion-rows.json'), rows)
      assertNoResidualRows(rows)
      return { rows: path }
    },
    async 'owner-notes'() {
      const ctx = getCtx(), owner = win.ownerNotes ? privateJson(win.ownerNotes, 'Owner notes') : {}, rebind = state().rebind ?? null, fast = rebind?.path === 'fast'
      const receipts = fast ? null : Object.fromEntries(['close', 'associations', 'identity-verified', 'audit', 'activate'].map(name => {
        const path = local(`deletion-${name}.json`); return [name, { path, sha256: hashFile(path) }]
      }))
      const notes = ownerNotes({ candidate: ctx.config.candidate, formalFrom: win.formalFrom, formalTo: win.formalBuild, rows: fast ? null : JSON.parse(readFileSync(local('deletion-rows.json'), 'utf8')),
        receipts, diagnostics: runDiagnostics(env.runDirectory), rebind }, owner)
      return { notes: writeAndReturn(local('owner-notes.json'), notes) }
    },
    async bundle() {
      const output = local('evidence'); mkdirSync(output, { recursive: true, mode: 0o700 }); chmodSync(output, 0o700)
      const carry = state().rebind?.path === 'fast' ? ['--carry', win.fullAcceptance] : []
      must(tools().cli(['bundle', '--config', env.configPath, '--runs', env.runDirectory, '--output', output, '--extra', local('owner-notes.json'), ...carry]), 'bundle')
      return { index: join(output, 'index.json') }
    },
    async 'formal-browser'() {
      return { proof: writeAndReturn(local('formal-browser.json'), tools().deploy('verify-formal-browser')) }
    },
    async 'copy-evidence'() {
      const t = tools(), files = ['owner-notes.json', 'formal-browser.json', ...readdirSync(local('evidence')).map(name => `evidence/${name}`)].sort()
      t.toHost([local('evidence'), local('owner-notes.json'), local('formal-browser.json')], X)
      const localSums = files.map(name => `${hashFile(local(name))}  ${name}`).join('\n')
      const hostSums = t.ssh(`cd '${X}' && sha256sum ${files.map(name => `'${name}'`).join(' ')}`, undefined, 'host evidence hashes').trim()
      if (hostSums !== localSums) throw new WindowStop('Evidence on the host differs from the owner copy')
      return {}
    },
    async 'final-open'() {
      const t = tools(), ctx = getCtx(), accepted = local('acceptance.json'), reverifyOperationId = state().ops.reverify
      // A lost `open` response must not replay the chain: closing an open target would leave pre closed.
      const { live, binding } = liveOpen(t, ctx, win, reverifyOperationId, accepted)
      if (binding === 'ours') return { acceptance: accepted, open: writeAndReturn(local('open.json'), live) }
      if (binding === 'other') throw new WindowStop(OPEN_ELSEWHERE)
      if (live.mode !== 'maintenance' || live.operation?.id !== reverifyOperationId || live.operation?.stage !== 'acceptance') throw new WindowStop("Pre is not in this window's acceptance maintenance")
      // All slow work precedes the chain. `open` rechecks the storage cycle and a 30 min acceptance age; the chain's
      // apply-identities keeps the installed build, generation and operation, so the record stays valid through it.
      const index = privateJson(local('evidence/index.json'), 'Evidence index'), formalBrowser = privateJson(local('formal-browser.json'), 'Formal browser proof')
      if (!Object.values(index).every(entry => entry.passed)) throw new WindowStop('Every evidence item must pass before writing acceptance')
      writePrivateJson(accepted, acceptanceRecord({ targetId: ctx.target.targetId, status: live, healthyCycle: storageCycle(t, ctx), index, formalBrowser }))
      t.toHost([accepted], X)
      // GitHub receipt verification for `open` also runs now, so activate → open holds only a local check and SSH.
      const verified = join(win.windowDirectory, 'verified-open.json')
      if (!verifiedOpenFresh(verified)) {
        rmSync(verified, { force: true })
        must(io.run('./deploy-prerelease.sh', ['verify-open', '--config', ctx.config.targetConfig, '--sha', ctx.config.candidate, '--output', verified], { timeoutMs: 5 * 60_000 }), 'verify-open')
      }
      const chain = await auditChain(io, t, win, 'final')
      assertWithin('activate → open', Date.now() - chain.activatedAt, LIMITS.activateToOpenMs)
      const opened = t.deploy('open', ['--sha', ctx.config.candidate, '--authority-receipt', chain.files.activate, '--audit', chain.files.audit,
        '--verification', chain.files['identity-verified'], '--acceptance', accepted, '--verified-receipt', verified])
      if (opened.mode !== 'open') throw new WindowStop('Open did not report an open target')
      return { ...chain.files, acceptance: accepted, open: writeAndReturn(local('open.json'), opened) }
    },
    readback: async () => runSuite(tools(), env, SUITE_RUNS.find(entry => entry.step === 'readback')),
    async cleanup() {
      const ctx = getCtx(), origins = ctx.origins, beta = {}, sessions = {}
      for (const [engine, accounts] of Object.entries(ctx.engineAccounts)) {
        beta[engine] = await setBeta({ origins, ownerCookieFile: ctx.config.ownerCookie, fetchImpl: io.fetch }, 'revoke', accounts, ['A', 'B'])
        if (beta[engine].beta.A || beta[engine].beta.B) throw new WindowStop(`Beta was not revoked from ${engine} A and B`)
        sessions[engine] = await logoutAll({ origins, fetchImpl: io.fetch, budget: loginBudget(env.runDirectory) }, accounts)
      }
      return { cleanup: writeAndReturn(join(win.windowDirectory, 'cleanup.json'), { beta, sessions }) }
    },
    async archive() {
      const receipts = join(win.windowDirectory, 'receipts'); cpSync(X, receipts, { recursive: true, preserveTimestamps: true })
      return {}
    },
  }
  for (const entry of SUITE_STEPS) steps[entry.step] = async () => runSuite(tools(), env, entry)
  return steps
}

function writeAndReturn(path, value) { writePrivateJson(path, value); return path }

/** Runs (or with resume: continues) one window. Returns the final state; throws WindowStop with next commands on a stop. */
export async function runWindow({ configPath, windowPath, resume = false, confirmStep = null, io = processIo(), now = Date.now }) {
  const win = parseWindowConfig(privateJson(windowPath, 'Window config'))
  for (const key of ['run', 'previousRun', 'windowDirectory']) privateDirectory(win[key], `Window ${key}`)
  if (confirmStep && !['accounts', 'deletion'].includes(confirmStep)) throw new Error('--confirm-step applies only to accounts or deletion')
  const statePath = join(win.windowDirectory, 'state.json'), logs = join(win.windowDirectory, 'logs')
  mkdirSync(logs, { recursive: true, mode: 0o700 })
  let state = existsSync(statePath) ? privateJson(statePath, 'Window state') : null
  if (state && !resume) throw new WindowStop('This window already started; inspect state.json and rerun with --resume true')
  if (!state && resume) throw new WindowStop('Nothing to resume: this window has no state.json')
  if (state && state.windowId !== win.windowId) throw new WindowStop('state.json belongs to another window')
  state ??= newState(win.windowId, now())
  const save = () => writePrivateJson(statePath, state)
  let ctx = loadAcceptanceConfig(configPath), room = null
  // An `open` that committed after its response was lost is reconciled before anything is invalidated or rerun:
  // proofs and evidence can only be redone in maintenance, so refreshing them first would fail forever.
  const finalOpen = state.steps['final-open']
  if (resume && finalOpen && finalOpen.status !== 'done') {
    const accepted = join(win.exchangeDirectory, 'acceptance.json')
    const { live, binding } = liveOpen(hostTools(io, ctx), ctx, win, state.ops.reverify, accepted)
    if (binding === 'other') throw new WindowStop(OPEN_ELSEWHERE)
    if (binding === 'ours') {
      const open = writeAndReturn(join(win.exchangeDirectory, 'open.json'), live)
      state = markThrough(state, 'final-open', now(), 'pre was already open under this window\'s acceptance')
      state = { ...state, steps: { ...state.steps, 'final-open': { ...state.steps['final-open'], outputs: { open: { path: open, sha256: hashFile(open) } } } } }; save()
    }
  }
  // Preconditions are rechecked on every resume: formal or pre may have changed since the last attempt.
  state = resetSteps(state, [...(nextStep(state) ? ['preconditions'] : []), ...staleSteps(state, now())]); save()
  const env = { configPath: resolve(configPath), runDirectory: resolve(win.run), room: () => (room ??= previousTeamRoom(win.previousRun)) }
  const steps = makeSteps({ io, win, env, getCtx: () => ctx, reload: () => { ctx = loadAcceptanceConfig(configPath) }, state: () => state, now,
    setOps: ops => { state = { ...state, ops: { ...state.ops, ...ops } }; save() }, setRebind: rebind => { state = { ...state, rebind }; save() } })
  for (const step of WINDOW_STEPS) {
    const entry = state.steps[step]
    if (entry?.status === 'done') continue
    const fast = state.rebind?.path === 'fast'
    if (fast && FAST_SKIPPED_STEPS.includes(step)) { state = markStep(state, step, 'done', now(), { note: 'skipped: fast rebind carries this evidence from the last full acceptance' }); save(); continue }
    const suite = SUITE_RUNS.find(candidate => candidate.step === step)
    const decision = resumeDecision(step, entry, { gaps: entry && suite ? suiteGaps(collectResults([env.runDirectory]), suite.suite) : null, confirmed: confirmStep === step, fast })
    if (decision.action === 'stop') {
      const gaps = suite ? suiteGaps(collectResults([env.runDirectory]), suite.suite) : []
      throw new WindowStop(decision.reason, suite && step !== 'deletion' ? rerunCommands({ ...env, room: suite.room ? env.room() : null }, step, gaps) : [])
    }
    if (decision.action === 'complete') { state = markStep(state, step, 'done', now(), { note: decision.reason }); save(); continue }
    io.setLog?.(join(logs, `${step}.log`))
    state = markStep(state, step, 'started', now()); save()
    try {
      const outputs = await steps[step]({ decision })
      const hashed = Object.fromEntries(Object.entries(outputs ?? {}).filter(([, path]) => typeof path === 'string' && existsSync(path) && statSync(path).isFile())
        .map(([label, path]) => [label, { path, sha256: hashFile(path) }]))
      state = markStep(state, step, 'done', now(), { outputs: hashed }); save()
    } catch (error) {
      state = markStep(state, step, 'failed', now(), { error: String(error?.message ?? error).slice(0, 600) }); save()
      throw error
    }
  }
  return state
}
