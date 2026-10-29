#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { allocateTestPort } from './test-ports.ts'
import { caseKey, readBrowserRunRequest, readBrowserRunResult, requirementsArgument } from './verification-requirements.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trimEnd()
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const active = new Map()
let interrupted = null

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interrupted ??= signal
  for (const pid of active.keys()) {
    try { process.kill(-pid, signal) } catch (error) { if (error.code !== 'ESRCH') throw error }
  }
})

function options(input) {
  let shards = 4
  const args = []
  for (let index = 0; index < input.length; index++) {
    const argument = input[index]
    if (argument === '--shards') shards = Number(input[++index])
    else if (argument.startsWith('--shards=')) shards = Number(argument.slice(9))
    else if (argument === '--shard' || argument.startsWith('--shard=')) throw new Error('The runner owns --shard; use --shards=N')
    else if (argument !== '--') args.push(argument)
  }
  if (!Number.isInteger(shards) || shards < 1 || shards > 8) throw new Error('--shards must be an integer from 1 to 8')
  if (['focus', 'prepush', 'status'].includes(args[0])) throw new Error('verify:parallel only accepts browser verification arguments')
  return { shards, args }
}

async function waitForGroup(pid) {
  // pnpm can exit before a signalled verify.sh finishes its EXIT cleanup.
  for (;;) {
    const processes = execFileSync('ps', ['-eo', 'pgid=,stat='], { encoding: 'utf8' })
    if (!processes.split('\n').some(line => {
      const [group, state] = line.trim().split(/\s+/)
      return Number(group) === pid && !state?.startsWith('Z')
    })) return
    await delay(200)
  }
}

async function command(command, args, cwd, env, logPath, label, captureStdout = false) {
  if (interrupted) throw new Error(`Interrupted by ${interrupted}`)
  const log = createWriteStream(logPath, { flags: 'a' })
  console.log(`[parallel:${label}] ${command} ${args.join(' ')}`)
  const child = spawn(command, args, { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  if (child.pid) active.set(child.pid, child)
  let pending = '', stdout = ''
  const output = bytes => {
    log.write(bytes)
    pending += bytes.toString()
    const lines = pending.split(/\r?\n/)
    pending = lines.pop() ?? ''
    for (const line of lines) if (/\[verify\]|[✓✘]|Running \d+ tests?|\d+ (?:passed|failed|skipped)|ERR_PNPM/.test(line)) {
      console.log(`[parallel:${label}] ${line}`)
    }
  }
  child.stdout.on('data', bytes => { if (captureStdout) stdout += bytes.toString(); output(bytes) })
  child.stderr.on('data', output)
  const result = await new Promise(resolve => {
    child.once('error', error => resolve({ exitCode: 1, error: error.message }))
    child.once('close', (exitCode, signal) => resolve({ exitCode: exitCode ?? 1, signal }))
  })
  if (child.pid) {
    await waitForGroup(child.pid)
    active.delete(child.pid)
  }
  await new Promise(resolve => log.end(resolve))
  return { ...result, stdout }
}

function listedCases(report) {
  if (report.errors?.length) throw new Error('Playwright could not list the requested cases')
  const browsers = new Map(report.config.filteredProjects.map(project => [project.name, project.use.browserName ?? 'chromium']))
  const cases = new Map()
  const visit = (suite, titles) => {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) {
      const identity = { file: relative(root, resolve(report.config.rootDir, spec.file)).split(sep).join('/'),
        titlePath: [...titles, spec.title], project: test.projectName, browser: browsers.get(test.projectName) }
      if (!identity.browser) throw new Error('Unknown project in Playwright listing')
      cases.set(caseKey(identity), identity)
    }
    for (const child of suite.suites ?? []) visit(child, child.title ? [...titles, child.title] : titles)
  }
  for (const suite of report.suites) visit(suite, [])
  if (!cases.size) throw new Error('No browser cases were selected')
  return cases
}

function evidence(lane, expectedHead, destination) {
  const verification = join(lane.worktree, 'output/verification')
  if (existsSync(verification)) cpSync(verification, join(destination, 'verification'), { recursive: true })
  const screenshots = join(lane.worktree, 'output/playwright')
  if (existsSync(screenshots)) cpSync(screenshots, join(destination, 'playwright'), { recursive: true })
  const record = json(join(verification, 'e2e.json'))
  Object.assign(lane, { head: record.head, fingerprint: record.fingerprint, verificationStatus: record.status })
  const runs = readdirSync(join(verification, 'e2e-runs')).filter(name => /^\d{12}$/.test(name))
  if (runs.length !== 1) throw new Error('Expected exactly one browser run in the fresh worktree')
  const directory = join(verification, 'e2e-runs', runs[0])
  const request = readBrowserRunRequest(join(directory, 'request.json'))
  Object.assign(lane, { runId: request.runId, requirements: request.requirements })
  const selection = json(join(directory, 'selection.json'))
  const results = readBrowserRunResult(join(directory, 'results.json'))
  const completion = json(join(directory, 'completion.json'))
  if (record.head !== expectedHead || request.head !== expectedHead || git('-C', lane.worktree, 'rev-parse', 'HEAD') !== expectedHead
    || record.fingerprint !== request.fingerprint || results.fingerprint !== request.fingerprint || selection.fingerprint !== request.fingerprint
    || request.runId !== selection.runId || request.runId !== results.runId || request.runId !== completion.runId
    || results.requirementsSha256 !== (request.requirements?.sha256 ?? null)) throw new Error('Child evidence bindings differ')
  if (!Array.isArray(selection.cases)) throw new Error('Missing child selection')
  const selected = new Set(selection.cases.map(caseKey))
  if (selected.size !== selection.cases.length || selected.size !== results.cases.length
    || results.cases.some(entry => !selected.has(caseKey(entry.identity)))) throw new Error('Child selection and result identities differ')
  Object.assign(lane, { head: record.head, fingerprint: request.fingerprint, runId: request.runId,
    requirements: request.requirements, verificationStatus: record.status, resultStatus: results.status,
    counts: { selected: selected.size, passed: 0, failed: 0, skipped: 0, 'not-run': 0 } })
  for (const entry of results.cases) lane.counts[entry.status]++
  if (record.status !== 'passed' || completion.status !== 'passed' || results.status !== 'passed'
    || lane.counts.failed || lane.counts['not-run']) lane.status = 'failed'
  return { selection: selection.cases, results: results.cases }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: pnpm verify:parallel [--shards=N] [Playwright files/options]\nRuns committed HEAD in 1–8 independent worktrees, one browser worker each.\nLogs and child evidence: output/verification/parallel-runs/<run>.\nFailures retain every owned worktree. This does not create a root E2E verification record.')
    return
  }
  const { shards, args } = options(process.argv.slice(2))
  if (process.platform === 'win32') throw new Error('Parallel verification requires POSIX process groups')
  if (git('status', '--porcelain', '--untracked-files=all')) throw new Error('Commit all source changes before parallel verification; each shard checks out committed HEAD')
  const head = git('rev-parse', 'HEAD')
  const runId = `${new Date().toISOString().replace(/\D/g, '')}-${randomBytes(3).toString('hex')}`
  const output = join(root, 'output/verification/parallel-runs', runId)
  const worktreeRoot = join(dirname(git('rev-parse', '--path-format=absolute', '--git-common-dir')), '.worktree')
  mkdirSync(output, { recursive: true })
  const summary = { schemaVersion: 1, kind: 'parallel-e2e', runId, head, shards, startedAt: new Date().toISOString(), args,
    status: 'running', lanes: [], errors: [] }
  const summaryPath = join(output, 'summary.json')
  const update = () => save(summaryPath, summary)
  update()
  const env = { ...process.env }
  for (const key of ['BACKEND_PORT', 'FRONTEND_PORT', 'APP_BASE_PORT', 'FRONTEND_URL', 'BACKEND_URL', 'SHARED_DATA_DIR',
    'LOCAL_ENV_FILE', 'OWNED_PROCESSES_FILE', 'REPLAY_VIEWER_ROOT', 'OPEN_AGRICOLA_VERIFICATION_RUN']) delete env[key]
  try {
    const bootstrap = await command('pnpm', ['run', 'build:cards-manifest'], root, env, join(output, 'bootstrap.log'), 'bootstrap')
    if (bootstrap.exitCode !== 0) throw new Error('Browser source bootstrap failed; see bootstrap.log')
    const listArgs = requirementsArgument(args).args
    if (listArgs[0] === 'e2e') listArgs.shift()
    const listing = await command('pnpm', ['exec', 'playwright', 'test', ...listArgs, '--list', '--reporter=json'], root, env, join(output, 'list.log'), 'selection', true)
    if (listing.exitCode !== 0) throw new Error('Playwright listing failed; see list.log')
    const report = JSON.parse(listing.stdout)
    save(join(output, 'list.json'), report)
    const expected = listedCases(report)
    summary.expectedCases = expected.size
    save(join(output, 'expected-selection.json'), { kind: 'parallel-expected-selection', head, runId, cases: [...expected.values()] })
    update()
    const preparation = await command(process.execPath, ['scripts/local-services.mjs', '--test'], root, env, join(output, 'dependencies.log'), 'dependencies')
    if (preparation.exitCode !== 0) throw new Error('Shared test dependency preparation failed; see dependencies.log')
    const taken = new Set()
    for (let index = 1; index <= shards; index++) {
      if (interrupted) throw new Error(`Interrupted by ${interrupted}`)
      const backend = await allocateTestPort({ taken }); taken.add(backend)
      const frontend = await allocateTestPort({ taken }); taken.add(frontend)
      const application = await allocateTestPort({ taken, span: 2 }); taken.add(application); taken.add(application + 1)
      const worktree = join(worktreeRoot, `verify-${runId}-${index}`)
      git('worktree', 'add', '--detach', worktree, head)
      summary.lanes.push({ index, worktree, head: git('-C', worktree, 'rev-parse', 'HEAD'), status: 'created', ports: { backend, frontend, application } })
      update()
    }
    await Promise.all(summary.lanes.map(async lane => {
      const destination = join(output, `shard-${lane.index}`)
      mkdirSync(destination)
      lane.status = 'installing'; update()
      try {
        const installation = await command('pnpm', ['install', '--offline', '--frozen-lockfile'], lane.worktree, env, join(destination, 'install.log'), lane.index)
        if (installation.exitCode !== 0) throw new Error('Offline frozen installation failed')
        lane.status = 'running'; update()
        const result = await command('pnpm', ['verify', ...args, `--shard=${lane.index}/${shards}`, '--workers=1'], lane.worktree,
          { ...env, E2E_DEPENDENCIES_READY: '1', BACKEND_PORT: String(lane.ports.backend), FRONTEND_PORT: String(lane.ports.frontend), APP_BASE_PORT: String(lane.ports.application) },
          join(destination, 'verify.log'), lane.index)
        lane.exitCode = result.exitCode
        lane.status = result.exitCode === 0 ? 'passed' : 'failed'
      } catch (error) { lane.status = 'failed'; lane.error = error.message }
      try {
        const combined = evidence(lane, head, destination)
        save(join(destination, 'selection.json'), combined.selection)
        save(join(destination, 'results.json'), combined.results)
      } catch (error) { lane.status = 'failed'; lane.evidenceError = error.message }
      console.log(`[parallel:${lane.index}] ${lane.status} ${JSON.stringify(lane.counts ?? {})}`)
      update()
    }))
    const selected = new Map(), results = []
    for (const lane of summary.lanes) {
      const destination = join(output, `shard-${lane.index}`)
      if (!existsSync(join(destination, 'selection.json'))) continue
      for (const identity of json(join(destination, 'selection.json'))) {
        const key = caseKey(identity)
        if (selected.has(key)) summary.errors.push(`Duplicate case in shards ${selected.get(key).shard} and ${lane.index}: ${key}`)
        else selected.set(key, { shard: lane.index, identity })
      }
      for (const entry of json(join(destination, 'results.json'))) results.push({ shard: lane.index, ...entry })
    }
    if (new Set(summary.lanes.map(lane => lane.fingerprint)).size !== 1) summary.errors.push('Child source fingerprints differ or are missing')
    for (const key of expected.keys()) if (!selected.has(key)) summary.errors.push(`Missing requested case: ${key}`)
    for (const key of selected.keys()) if (!expected.has(key)) summary.errors.push(`Unexpected selected case: ${key}`)
    summary.counts = { selected: selected.size, passed: 0, failed: 0, skipped: 0, 'not-run': 0 }
    for (const entry of results) summary.counts[entry.status]++
    save(join(output, 'selection.json'), { kind: 'parallel-selection', head, runId, cases: [...selected.values()] })
    save(join(output, 'results.json'), { kind: 'parallel-results', head, runId, cases: results })
    summary.status = !interrupted && summary.errors.length === 0 && summary.lanes.every(lane => lane.status === 'passed') ? 'passed' : 'failed'
    if (summary.status === 'passed') {
      for (const lane of summary.lanes) {
        if (git('-C', lane.worktree, 'status', '--porcelain', '--untracked-files=all')) throw new Error(`Owned worktree has source changes; retained: ${lane.worktree}`)
        git('worktree', 'remove', lane.worktree)
        lane.removed = true
      }
    }
  } catch (error) { summary.status = 'failed'; summary.errors.push(error.message) }
  finally {
    summary.interrupted = interrupted
    summary.completedAt = new Date().toISOString()
    update()
    console.log(`[parallel] ${summary.status}: ${summaryPath}`)
    console.log(`[parallel] ${JSON.stringify(summary.counts ?? {})}`)
    if (summary.status !== 'passed') console.log('[parallel] Owned worktrees and all available child evidence retained.')
  }
  process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : summary.status === 'passed' ? 0 : 1
}

await main().catch(error => { console.error(`[parallel] ${error.message}`); process.exitCode = 1 })
