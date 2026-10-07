/** Local owner-only browser acceptance. No provider request is made by Node. */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'
import { ATTEMPT_ALLOWANCE, GENERATION_CONTEXT_BYTES } from '../client/services/llm/generation/attempt'
import { GENERATION_MODEL_SETTINGS } from '../client/services/llm/generation/protocol'
import { GENERATION_PROMPT_VERSION } from '../client/services/llm/generation/prompt'
import { REFERENCE_LIMITS, REFERENCE_TOOL_VERSION } from '../client/services/llm/generation/references'
import { BudgetFile } from '../tests/llm-card-gen/acceptance/budget-file'
import { PRICE_BASIS, TOTAL_BUDGET_NANO_USD } from '../tests/llm-card-gen/acceptance/budget'
import type { Arm, BrowserTaskResult, ReservationRequest, Settlement } from '../tests/llm-card-gen/acceptance/browser'
import type { AcceptanceInput } from '../tests/llm-card-gen/acceptance/inputs'
import type { BehaviorEvidence } from '../tests/llm-card-gen/acceptance/behavior'

const { values } = parseArgs({ options: {
  live: { type: 'boolean', default: false }, 'dry-run': { type: 'boolean', default: false },
  model: { type: 'string' }, 'base-url': { type: 'string', default: 'http://127.0.0.1:5913' },
  'runtime-env': { type: 'string', default: 'output/tmp/llm-runtime/local.env' },
} })
if (values.live === values['dry-run']) throw new Error('Choose exactly one of --dry-run or --live. Live requires an explicitly approved --model.')
if (values.live && !['deepseek-flash', 'deepseek-v4-flash'].includes(values.model ?? '')) throw new Error('Specify the approved DeepSeek request model with --model; no silent model substitution is allowed.')
const live = values.live!
const model = values.model ?? 'deepseek-flash'
const endpoint = 'https://api.deepseek.com/v1/chat/completions'
const baseUrl = new URL(values['base-url']!)
if (!['127.0.0.1', 'localhost'].includes(baseUrl.hostname) || baseUrl.protocol !== 'http:') throw new Error('Acceptance requires the dedicated local runtime, not a production site.')
const root = process.cwd()
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const commonGit = git('rev-parse', '--path-format=absolute', '--git-common-dir')
const originalCheckout = dirname(commonGit)
if (live && git('status', '--porcelain')) throw new Error('Commit the frozen implementation and assertions before starting a paid batch.')
// This dedicated file contains database/runtime settings, never provider keys.
const runtimeEnv = readFileSync(resolve(root, values['runtime-env']!), 'utf8')
if (/^\s*(?:export\s+)?\w*(?:TOKEN|APIKEY|API_KEY)\s*=/m.test(runtimeEnv)) throw new Error('The dedicated runtime env must not contain provider or GitHub tokens.')
process.loadEnvFile(resolve(root, values['runtime-env']!))
if (!process.env.DATABASE_SCHEMA?.startsWith('test_')) throw new Error('Acceptance requires a test_ database schema.')
function privateProviderKey(): string {
  for (const name of ['MY_TEST_DEEPSEEK_APIKEY', 'DEEPSEEK_API_KEY']) if (process.env[name]) return process.env[name]!
  // Read just this provider's value, without sourcing .env into the runtime.
  for (const path of [join(root, '.env'), join(originalCheckout, '.env')]) {
    if (!existsSync(path)) continue
    const match = readFileSync(path, 'utf8').match(/^\s*(?:export\s+)?(?:MY_TEST_DEEPSEEK_APIKEY|DEEPSEEK_API_KEY)\s*=\s*(.+?)\s*$/m)
    if (match) return match[1].replace(/^(['"])(.*)\1$/, '$2')
  }
  throw new Error('The owner DeepSeek key is unavailable; no paid request was issued.')
}
const apiKey = live ? privateProviderKey() : 'synthetic-acceptance-browser-credential'
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const { acceptanceInputs, assertCapabilityGap } = await import('../tests/llm-card-gen/acceptance/inputs')
const { evaluateBehavior } = await import('../tests/llm-card-gen/acceptance/behavior')
const { resetCards } = await import('../tests/llm-card-gen/session-helpers')
const { acceptanceSeed, GAP_SEED } = await import('../tests/llm-card-gen/acceptance/seeds')
const { getWorkshopSandboxContract } = await import('../server/workshop-sandbox-contract')
const { createLocalUserForTests, createSession } = await import('../server/auth')
const { getDb } = await import('../server/db')
const controlManifest = JSON.parse(readFileSync('tests/llm-card-gen/control/manifest.json', 'utf8')) as { sourceCommit: string; sha256: string }
const control = { ...controlManifest, text: readFileSync('tests/llm-card-gen/control/full-prompt.txt', 'utf8') }
if (sha256(control.text) !== control.sha256) throw new Error('The frozen control prompt does not match its recorded hash.')
const batch = `${live ? 'live' : 'synthetic'}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
const directory = join(root, 'output/tmp/llm-acceptance', batch)
mkdirSync(directory, { recursive: true })
const save = (name: string, data: unknown) => {
  const json = JSON.stringify(data, null, 2) + '\n'
  if (json.includes(apiKey)) throw new Error('Refusing to save credential-bearing acceptance evidence')
  writeFileSync(join(directory, name), json, { mode: 0o600 })
}
// Every paid probe/batch/worktree shares this exact ledger. There is no CLI
// budget override or reset. Synthetic runs have their own labelled ledger.
const budget = new BudgetFile(live ? join(commonGit, 'llm-acceptance-usd5.json') : join(directory, 'synthetic-budget.json'))
const releaseBudget = () => budget.close()
process.once('exit', releaseBudget)
const freeze = () => Object.fromEntries(git('ls-files', '--cached', '--others', '--exclude-standard').split('\n')
  .filter(path => /^(client\/|shared\/|server\/|tests\/llm-card-gen\/|scripts\/|package\.json$|pnpm-lock\.yaml$)/.test(path) && existsSync(path))
  .map(path => [path, sha256(readFileSync(path))]))
const frozenFiles = freeze()
const frozenDigest = sha256(JSON.stringify(frozenFiles))
const sandboxContractId = getWorkshopSandboxContract().id
type Task = { id: string; scenario: string; repetition: number; arm: Arm }
const tasks: Task[] = []
for (let repetition = 1; repetition <= 3; repetition++) for (const input of acceptanceInputs) for (const arm of ['tools', 'control'] as const) tasks.push({ id: `${arm}-${input.id}-${repetition}`, scenario: input.id, repetition, arm })
save('manifest.json', {
  format: 1, batch, synthetic: !live, startedAt: new Date().toISOString(), implementationCommit: git('rev-parse', 'HEAD'),
  dirty: Boolean(git('status', '--porcelain')), frozenDigest, files: frozenFiles,
  provider: 'deepseek', endpoint, requestedModel: model, documentedService: PRICE_BASIS.documentedService,
  priceBasis: PRICE_BASIS, totalEffortBudgetNanoUsd: TOTAL_BUDGET_NANO_USD,
  settings: { ...GENERATION_MODEL_SETTINGS, thinking: { type: 'enabled' } },
  promptVersion: GENERATION_PROMPT_VERSION, toolVersion: REFERENCE_TOOL_VERSION, sandboxContractId,
  allowance: ATTEMPT_ALLOWANCE, contextBytes: GENERATION_CONTEXT_BYTES, referenceLimits: REFERENCE_LIMITS,
  control: controlManifest, tasks, inputs: acceptanceInputs,
  method: 'Three repetitions in declared scenario order, tools then control; no task reruns or Session-driven repairs. Old prompt plus shared repair is the control. Synthetic results cannot admit a model.',
})

type TaskEvidence = { task: Task; startedAt: string; finishedAt: string; result: BrowserTaskResult; first: BehaviorEvidence; final: BehaviorEvidence }
const completed: TaskEvidence[] = []
let probe: TaskEvidence | undefined
let fatal: string | undefined
let activeTask = ''
let interrupted = false
const browser = await chromium.launch({ headless: true })
const stop = () => { interrupted = true; void browser.close() }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)

try {
  const context = await browser.newContext()
  const page = await context.newPage()
  const destinations = new Map<string, { requests: number; credential: boolean }>()
  // Inspect and block an accidental credential escape before a request leaves
  // the browser. No request bodies, headers, HAR or traces are written to disk.
  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const credential = JSON.stringify(request.headers()).includes(apiKey) || (request.postData() ?? '').includes(apiKey)
    if (credential && request.url() !== endpoint) {
      fatal = 'A model credential was blocked from leaving for a non-provider destination.'
      await route.abort(); return
    }
    if (url.hostname.endsWith('github.com') || url.hostname === 'raw.githubusercontent.com') {
      if (request.headers().authorization) { fatal = 'GitHub reference requests must be anonymous.'; await route.abort(); return }
    }
    if (credential || url.hostname.includes('github') || url.pathname.startsWith('/api/workshop/')) {
      const key = `${request.method()} ${url.origin}${url.hostname === '127.0.0.1' || url.hostname === 'localhost' ? url.pathname : ''}`
      const prior = destinations.get(key)
      destinations.set(key, { requests: (prior?.requests ?? 0) + 1, credential: credential || prior?.credential || false })
    }
    await route.fallback()
  })
  await page.exposeFunction('acceptanceReserve', (request: ReservationRequest) => {
    if (fatal || request.task !== activeTask || interrupted) throw new Error(fatal ?? 'This task is no longer active')
    try { return budget.reserve(request.inputBytes, request.maxOutputTokens, `${batch}/${request.task}`, request.sequence) } catch (error) {
      fatal = error instanceof Error ? error.message : 'Budget reservation failed'
      throw new Error(fatal, { cause: error })
    }
  })
  await page.exposeFunction('acceptanceSettle', (settlement: Settlement) => {
    try { budget.settle(settlement.id, settlement.usage, settlement.notPosted) } catch (error) {
      fatal = error instanceof Error ? error.message : 'Budget settlement failed'
      throw new Error(fatal, { cause: error })
    }
  })
  const user = await createLocalUserForTests(`llm_${Date.now().toString(36)}`, 'owner-local-acceptance-only')
  const cookie = await createSession(user.id)
  if (!cookie) throw new Error('Could not create the isolated acceptance session')
  await context.addCookies([{ name: 'oa_session', value: cookie, url: baseUrl.href }])
  const referenceBody = 'Sandbox reference: gainLeaf(CARD_ID, { wood: 1 }); use collect on forest.\n'
  const referenceCommit = 'e'.repeat(40)
  const referencePath = 'docs/CUSTOM_CARD_SANDBOX.md'
  if (!live) {
    const blob = createHash('sha1').update(`blob ${Buffer.byteLength(referenceBody)}\0`).update(referenceBody).digest('hex')
    await page.route('https://api.github.com/**', route => route.fulfill({ json: route.request().url().includes('/git/ref/') ? { object: { sha: referenceCommit } }
      : { truncated: false, tree: [{ path: referencePath, type: 'blob', sha: blob, size: Buffer.byteLength(referenceBody) }] } }))
    await page.route('https://raw.githubusercontent.com/**', route => route.fulfill({ body: referenceBody, contentType: 'text/plain' }))
  }
  await page.goto(baseUrl.href)
  if (live) {
    const quota = await page.evaluate(async () => {
      const response = await fetch('https://api.github.com/rate_limit', { credentials: 'omit', cache: 'no-store', redirect: 'error' })
      if (!response.ok) throw new Error('Anonymous GitHub quota could not be verified')
      const data = await response.json()
      return { remaining: data.resources.core.remaining as number, reset: data.resources.core.reset as number }
    })
    save('github-preflight.json', quota)
    if (quota.remaining < 56) throw new Error(`Anonymous GitHub quota is ${quota.remaining}; at least 56 requests are required before starting the paid batch. Reset: ${new Date(quota.reset * 1000).toISOString()}`)
  }
  const assess = (input: AcceptanceInput, result: BrowserTaskResult, first: boolean): BehaviorEvidence => {
    if (input.expected === 'capability-gap') {
      try { assertCapabilityGap(result.snapshot.result?.kind, result.snapshot.result?.message ?? '', Boolean(result.snapshot.candidate)); return { ok: true, checks: ['Precise capability gap; requirements preserved; no adoptable substitute'] } } catch (error) { return { ok: false, checks: [], reason: String(error) } }
    }
    const source = first ? result.sources[0] : result.sources.at(-1)
    if (!source?.validation?.valid || (!first && result.snapshot.result?.kind !== 'candidate')) return { ok: false, checks: [], reason: source?.validation?.errors.join('; ') || result.snapshot.reason || result.snapshot.result?.message || 'No validated complete source' }
    try { return evaluateBehavior(input, source.source) } finally { resetCards() }
  }
  const run = async (task: Task, input: AcceptanceInput): Promise<TaskEvidence> => {
    if (sha256(JSON.stringify(freeze())) !== frozenDigest) throw new Error('Implementation or assertions changed; this batch is incomplete. Start a new complete batch after validation.')
    activeTask = task.id
    let responses = 0
    let sourceResponses = 0
    if (!live) await page.route(endpoint, async route => {
      responses++
      const tools = task.arm === 'tools' && responses === 1
      let content = input.expected === 'capability-gap' ? GAP_SEED : `\`\`\`typescript\n${acceptanceSeed(input.id)}\n\`\`\``
      // Exercise exactly two production static repairs in the synthetic M1
      // tasks. This mutation is never applied to paid model output.
      if (!tools && input.id.startsWith('M1-') && ++sourceResponses <= 2) content = content.replace('\n```', '\neval("synthetic-invalid-source")\n```')
      const delta = tools ? { role: 'assistant', reasoning_content: 'synthetic-private-reasoning', tool_calls: [{ index: 0, id: 'read-sandbox', type: 'function', function: { name: 'read_reference', arguments: JSON.stringify({ path: referencePath, startLine: 1, lineCount: 20 }) }, extra_content: { google: { thought_signature: 'synthetic-signature' } } }] }
        : { role: 'assistant', content }
      await route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ id: `synthetic-${responses}`, model, choices: [{ index: 0, delta, finish_reason: tools ? 'tool_calls' : 'stop' }] })}\n\ndata: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 50, prompt_cache_hit_tokens: 20, completion_tokens_details: { reasoning_tokens: 10 } } })}\n\ndata: [DONE]\n\n` })
    })
    const startedAt = new Date().toISOString()
    const result: BrowserTaskResult = await page.evaluate(async args => {
      const moduleUrl = '/tests/llm-card-gen/acceptance/browser.ts'
      const { runBrowserTask } = await import(/* @vite-ignore */ moduleUrl)
      return runBrowserTask(args)
    }, { task: task.id, input, arm: task.arm, config: { provider: 'deepseek' as const, model, apiKey }, control, sandboxContractId })
    if (!live) await page.unroute(endpoint)
    const evidence = { task, startedAt, finishedAt: new Date().toISOString(), result, first: assess(input, result, true), final: assess(input, result, false) }
    save(`${task.id}.json`, evidence)
    save('destinations.json', Object.fromEntries(destinations))
    console.log(`${task.id}: ${evidence.final.ok ? 'PASS' : 'FAIL'}; first=${evidence.first.ok}; POSTs=${result.snapshot.modelRequests}; repairs=${result.snapshot.repairs}; ${result.snapshot.reason ?? evidence.final.reason ?? ''}`)
    return evidence
  }
  const probeInput = structuredClone(acceptanceInputs[1])
  probeInput.intent.message += '\nBefore producing source, call read_reference for docs/CUSTOM_CARD_SANDBOX.md lines 1–80, then use the tool response to complete the source.'
  probe = await run({ id: 'probe', scenario: probeInput.id, repetition: 0, arm: 'tools' }, probeInput)
  if (!probe.final.ok || !probe.result.protocol.preserved || probe.result.protocol.toolGroupsChecked < 1 || !probe.result.snapshot.result?.provenance?.references.length) throw new Error('The real browser tool roundtrip probe did not pass; the complete batch was not started.')
  for (const task of tasks) {
    if (fatal || interrupted) throw new Error(fatal ?? 'Interrupted by owner')
    const input = acceptanceInputs.find(item => item.id === task.scenario)!
    const evidence = await run(task, input)
    completed.push(evidence)
    // Preserve failed quality samples and continue the declared matrix. A lost
    // transport/checkpoint is an incomplete batch, not an automatic POST retry.
    if (evidence.result.snapshot.status !== 'completed') throw new Error(evidence.result.snapshot.reason ?? 'The task paused; this batch is incomplete')
  }
} catch (error) {
  fatal ??= interrupted ? 'Interrupted by owner' : error instanceof Error ? error.message : 'Acceptance stopped'
  console.error(fatal)
} finally {
  await browser.close()
  await getDb().close()
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  const arms = Object.fromEntries((['tools', 'control'] as const).map(arm => {
    const rows = completed.filter(row => row.task.arm === arm)
    const usage = rows.flatMap(row => row.result.requests).reduce((total, request) => ({
      knownInputTokens: total.knownInputTokens + (request.usage.inputTokens ?? 0), knownOutputTokens: total.knownOutputTokens + (request.usage.outputTokens ?? 0),
      unknownRequests: total.unknownRequests + Number(request.usage.inputTokens === null || request.usage.outputTokens === null),
    }), { knownInputTokens: 0, knownOutputTokens: 0, unknownRequests: 0 })
    const elapsed = rows.map(row => row.result.snapshot.activeMs).sort((a, b) => a - b)
    const reservations = budget.ledger.state.reservations.filter(row => row.task.startsWith(`${batch}/${arm}-`))
    return [arm, { completed: rows.length, planned: 51, firstPassed: rows.filter(row => row.first.ok).length, finalPassed: rows.filter(row => row.final.ok).length,
      sourcePassed: rows.filter(row => row.final.ok && !row.task.scenario.startsWith('M15-')).length, gapPassed: rows.filter(row => row.final.ok && row.task.scenario.startsWith('M15-')).length,
      usage, modelRequests: rows.reduce((sum, row) => sum + row.result.snapshot.modelRequests, 0),
      medianMs: elapsed.length ? elapsed[Math.floor(elapsed.length / 2)] : null, p95Ms: elapsed.length ? elapsed[Math.min(elapsed.length - 1, Math.ceil(elapsed.length * 0.95) - 1)] : null,
      estimatedNanoUsd: reservations.reduce((sum, row) => sum + (row.settledNanoUsd ?? 0), 0), heldNanoUsd: reservations.reduce((sum, row) => sum + (row.settledNanoUsd === undefined ? row.reservedNanoUsd : 0), 0),
    }]
  }))
  const toolRows = completed.filter(row => row.task.arm === 'tools')
  const admitted = live && !fatal && completed.length === 102 && probe?.final.ok === true && toolRows.length === 51 && toolRows.every(row => row.final.ok && row.result.protocol.preserved)
  const report = { batch, synthetic: !live, admitted, finishedAt: new Date().toISOString(), fatal, complete: completed.length === 102,
    planned: 102, completed: completed.length, arms, probePassed: probe?.final.ok ?? false,
    totalEffortCommittedNanoUsd: budget.ledger.committedNanoUsd(), totalEffortRemainingNanoUsd: TOTAL_BUDGET_NANO_USD - budget.ledger.committedNanoUsd(),
    failures: completed.filter(row => !row.final.ok).map(row => ({ task: row.task.id, reason: row.final.reason })),
    unrun: tasks.filter(task => !completed.some(row => row.task.id === task.id)).map(task => task.id),
    note: 'Costs use published peak rates and are estimates, not invoices. Unknown calls keep their full reservations. Passing synthetic output never admits a model; admission registry updates require the actual complete report.',
  }
  save('report.json', report)
  save('budget-snapshot.json', budget.ledger.state)
  budget.close()
  process.removeListener('exit', releaseBudget)
  console.log(JSON.stringify({ batch, admitted, complete: report.complete, completed: completed.length, directory, arms }))
  if (fatal || completed.some(row => !row.final.ok) || completed.length !== 102) process.exitCode = 1
  // GameSession's process-owned executor worker stays alive for reuse. This
  // one-shot owner CLI has finished all writes and closed its browser/DB.
  process.stdout.write('', () => process.exit(process.exitCode ?? 0))
}
