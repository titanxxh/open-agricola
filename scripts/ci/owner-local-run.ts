// Owner-local complete candidate verification (#1779, ADR 0046): runs the ten canonical tasks of one fixed candidate
// on the owner machine, inside the same isolation model as GitHub (a disposable candidate UID with its own rootless
// Docker, NoNewPrivileges units, no owner credentials, HOME, release state or rootful Docker socket), and records the
// owner-local receipt that `pnpm release ... --local-verification` publishes.
//   pnpm exec tsx scripts/ci/owner-local-run.ts --channel stable|prerelease --sha <candidate> --output <new private dir> [--jobs <n>] [--cpu-budget <cores>] [--browser-jobs <n>] [--lanes <1-8>] [--retries <0-3>] [--test-workers <n>] [--profile]
// Run it from the trusted protected-main checkout; its HEAD is the producer. Candidate code never runs as the owner.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, constants, existsSync, mkdirSync, openSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createServer } from 'node:net'
import { availableParallelism, homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { candidateCommand, collectCandidateDiagnostics, verifyCandidateSources, type CandidateExecution } from './candidate-isolation.ts'
import { assertCandidateCheckout } from './candidate-verification.ts'
import { canonicalOwnerLocalCommands, rebindOwnerLocalReceipt, rebindPrereleaseOwnerLocalReceipt } from './owner-local-verification.ts'
import { FULL_TASK_IDS, fullSha, verificationConfiguration, verificationTask, type FullTaskId, type VerificationCommand } from './verification-tasks.ts'
import { github, ownerMachine, RELEASE_REPOSITORY } from '../release/candidate.ts'

export type LocalChannel = 'stable' | 'prerelease'
export type CommandRecord = VerificationCommand & { exitCode: number; logSha256: string }
export type TaskRecord = { id: FullTaskId; startedAt: string; completedAt: string; commands: CommandRecord[] }
export type PhaseRecord = { phase: string; exitCode: number; logSha256: string }

const UID = 61000
export const OWNER_LOCAL_NODE = '/opt/oa-owner-local/node/bin/node'
const NODE = OWNER_LOCAL_NODE
// Scheduling is a CPU budget, measured on a 20-core owner machine: with every task at once the run queue reached 3x the
// cores and 5 s test timeouts failed. The Vitest suites use every core, so each runs alone; a browser lane averages
// about two cores (58 CPU minutes over ~30 lane minutes); the remaining tasks fit beside the browser lanes.
export const TASK_ORDER: FullTaskId[] = ['fast', 'slow', 'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'webkit', 'browser-sandbox', 'quality', 'build']
export type TaskCost = number | 'exclusive'
export function taskCost(task: FullTaskId, lanes: number): TaskCost {
  if (task === 'fast' || task === 'slow') return 'exclusive'
  if (task.startsWith('chromium-')) return 2 * lanes
  return task === 'build' ? 3 : 2
}
// A private /tmp hides the owner's own temporary files; TMPDIR keeps tmpdir() paths visible to the rootless daemon.
// The owner's home is also hidden from candidate commands; `assertPrivateHome` covers the candidate's daemon too.
export const candidateProperties = (ownerHome: string) => ['PrivateTmp=yes', `InaccessiblePaths=${ownerHome}`]
export const CANDIDATE_TMPDIR = '/home/oa-candidate/tmp'
const CANDIDATE_PUBLIC_ASSETS = '/home/oa-candidate/public-assets'
const COMMAND_TIMEOUT_MS = 60 * 60_000
export const NETWORK_ATTEMPTS = 3
export const PREPARATION_RETRY_DELAY_MS = 5_000
// Candidates migrate test schemas concurrently and serve E2E assets locally (#1779), so `fast` keeps Vitest's own
// worker count and the CPU budget alone limits the browser tasks. For a candidate from before those changes use
// `--browser-jobs 2 --test-workers 10`.
export const DEFAULT_TEST_WORKERS = 0
export const DEFAULT_BROWSER_JOBS = 6
// Two lanes per chromium task let all four chromium tasks, webkit and the sandbox share a 20-core budget at once.
export const DEFAULT_LANES = 2
const policyRoot = resolve(import.meta.dirname, '../..')

/** The digest-pinned image the trusted isolation smoke runs; the smoke is copied alone into /run and keeps its literal. */
export function isolationSmokeImage(root = policyRoot): string {
  const match = /^const image = '([a-z0-9./-]+:[\w.-]+@sha256:[0-9a-f]{64})'$/m.exec(readFileSync(join(root, 'scripts/ci/candidate-isolation-smoke.ts'), 'utf8'))
  if (!match) throw new Error('The isolation smoke names no digest-pinned image')
  return match[1]
}
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
const fileSha256 = (path: string) => sha256(readFileSync(path))
const iso = (time: number) => new Date(time).toISOString()

// Every browser task gets its own slice of the 20000–32767 test port range, so lanes of concurrent tasks never race
// for the same port between allocation and bind.
export const BROWSER_PORT_SLICES: Partial<Record<FullTaskId, string>> = Object.fromEntries(
  (['chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'webkit', 'browser-sandbox'] as const).map((task, index) => [task, `${20000 + 2000 * index}-${21999 + 2000 * index}`]))

/** Environment a browser task needs to share the machine with the other browser tasks of the same run. */
export function browserEnvironment(task: FullTaskId, lanes: number): Record<string, string> {
  const range = BROWSER_PORT_SLICES[task]
  if (!range) return {}
  return { TEST_PORT_RANGE: range, ...(task.startsWith('chromium-') ? { VERIFY_PARALLEL_LANES: String(lanes) } : {}) }
}

/** The environment GitHub tasks receive besides the isolation defaults; only the pre production build is pre. */
export function taskEnvironment(channel: LocalChannel, sha: string, task: FullTaskId, command: VerificationCommand): Record<string, string> {
  const hosted = channel === 'prerelease' && task === 'build' && command.command === 'pnpm' && command.args.join(' ') === 'run build:hosted-frontend'
  return { GAME_BUILD_ID: sha, VERIFICATION_CHANNEL: channel, RELEASE_CHANNEL: hosted ? 'prerelease' : 'stable' }
}

/** Runs `work` for every item with at most `jobs` at once, in the given order. */
export async function pool<T, R>(items: readonly T[], jobs: number, work: (item: T) => Promise<R>): Promise<R[]> {
  if (!Number.isSafeInteger(jobs) || jobs < 1) throw new Error('jobs must be a positive integer')
  const results: R[] = new Array(items.length)
  let next = 0
  const lane = async () => { while (next < items.length) { const index = next++; results[index] = await work(items[index]) } }
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, lane))
  return results
}

/**
 * Runs `work` for every item in order within a CPU budget: an exclusive item waits until nothing runs and holds the
 * machine alone; others start as soon as their cost fits, smaller later items filling the remaining budget. An item
 * costlier than the whole budget still runs, alone.
 */
export async function budgetPool<T>(items: readonly T[], budget: number, cost: (item: T) => TaskCost, work: (item: T) => Promise<void>, maxJobs = Infinity): Promise<void> {
  if (!Number.isSafeInteger(budget) || budget < 1) throw new Error('A CPU budget must be a positive integer')
  if (maxJobs !== Infinity && (!Number.isSafeInteger(maxJobs) || maxJobs < 1)) throw new Error('A job limit must be a positive integer')
  const pending = [...items]
  let used = 0, running = 0, exclusive = false
  await new Promise<void>((done, reject) => {
    const pump = () => {
      if (!pending.length && !running) { done(); return }
      for (let index = 0; index < pending.length && running < maxJobs && !exclusive;) {
        const item = pending[index], price = cost(item)
        if (price === 'exclusive' && running) break
        if (price !== 'exclusive' && running && used + price > budget) { index++; continue }
        pending.splice(index, 1); running++
        if (price === 'exclusive') exclusive = true; else used += price
        work(item).then(() => {
          running--
          if (price === 'exclusive') exclusive = false; else used -= price
          pump()
        }, reject)
      }
    }
    pump()
  })
}

/** Limits how many of the wrapped calls run at once; waiting calls start in arrival order. */
export function semaphore(limit: number): <R>(work: () => Promise<R>) => Promise<R> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('A concurrency limit must be a positive integer')
  let active = 0
  const waiting: (() => void)[] = []
  return async work => {
    if (active >= limit) await new Promise<void>(start => waiting.push(start))
    active++
    try { return await work() } finally { active--; waiting.shift()?.() }
  }
}

export type Runner = {
  /** Runs one command as the candidate in its task copy, logging to `<privateDirectory>/<phase>.log`. */
  candidate(execution: CandidateExecution, command: string, args: string[], phase: string, environment: Record<string, string>, properties: string[], timeline?: boolean): Promise<number>
  /** Runs the root isolation script through sudo; output goes to `log`. */
  isolation(args: string[], log: string): void
  verifySources(source: string, work: string, sha: string): void
  collectDiagnostics(work: string, destination: string): void
}

const exclusiveLog = (path: string) => openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)

export const nativeRunner: Runner = {
  candidate(execution, command, args, phase, environment, properties, timeline = false) {
    const argv = candidateCommand(execution, command, args, phase, environment, properties)
    const fd = exclusiveLog(join(execution.privateDirectory, `${phase}.log`))
    // Profiling keeps the arrival time of every output chunk: the dot reporter prints one character per finished test.
    const timelineFd = timeline ? exclusiveLog(join(execution.privateDirectory, `${phase}.timeline`)) : null
    return new Promise((done, reject) => {
      const child = spawn('/usr/bin/sudo', argv, { stdio: ['ignore', 'pipe', 'pipe'] })
      // Every log line starts with the seconds since the command began, so phases can be measured afterwards.
      const started = Date.now()
      let lineStart = true
      const record = (chunk: Buffer) => {
        if (timelineFd !== null) writeSync(timelineFd, JSON.stringify([Date.now() - started, chunk.toString('utf8')]) + '\n')
        const stamp = `[+${((Date.now() - started) / 1000).toFixed(1).padStart(6)}s] `
        let text = chunk.toString('utf8')
        if (lineStart) text = stamp + text
        lineStart = text.endsWith('\n')
        writeSync(fd, (lineStart ? text.slice(0, -1) : text).replaceAll('\n', `\n${stamp}`) + (lineStart ? '\n' : ''))
      }
      child.stdout.on('data', record); child.stderr.on('data', record)
      // A unit outliving the GitHub job budget is stopped as a whole, like a cancelled runner.
      const timer = setTimeout(() => spawnSync('/usr/bin/sudo', ['-n', '/usr/bin/systemctl', 'stop', `oa-candidate-${phase}.service`]), COMMAND_TIMEOUT_MS)
      const finish = () => { clearTimeout(timer); closeSync(fd); if (timelineFd !== null) closeSync(timelineFd) }
      child.once('error', error => { finish(); reject(error) })
      child.once('close', code => { finish(); done(code ?? 1) })
    })
  },
  isolation(args, log) {
    const fd = exclusiveLog(log)
    try {
      const result = spawnSync('/usr/bin/sudo', ['-n', '/usr/bin/bash', join(policyRoot, 'scripts/ci/owner-local-isolation.sh'), ...args], { stdio: ['ignore', fd, fd] })
      if (result.error) throw result.error
      if (result.status !== 0) throw new Error(`Owner-local isolation ${args[0]} failed; see ${log}`)
    } finally { closeSync(fd) }
  },
  verifySources: verifyCandidateSources,
  collectDiagnostics: collectCandidateDiagnostics,
}

export type Inputs = {
  channel: LocalChannel; sha: string; producerSha: string; output: string; jobs: number
  repository: string; repositoryId: number; tree: string; configuration: string; producerConfiguration: string
  commands: Record<FullTaskId, VerificationCommand[]>; ownerUid: number; node: { path: string; version: string; sha256: string }
  dockerVersion: string; policyFiles: Record<string, string>
  /** Loopback ports for the shared test services; the owner's own local services may already hold the defaults. */
  servicePorts: { postgres: number; objects: number }
  /** Extra attempts for a failed task, run alone after every wave, as GitHub reruns a failed task's job. */
  retries: number
  /** Optional `VITEST_MAX_WORKERS`; unset keeps Vitest's one worker per CPU but one, which passes when `fast` runs alone. */
  testWorkers: number | null
  /** Owner-private clean checkout of the public asset repository at the candidate's `public-assets.ref`. */
  publicAssets: string
  /** Records per-chunk output timelines for timing analysis; a profiling run never writes a receipt. */
  profile: boolean
  /** The owner's home directory, hidden from candidate commands. */
  ownerHome: string
  /** `VERIFY_PARALLEL_LANES` for each chromium task: independent app instances and browsers inside one task. */
  lanes: number
  /** Cores the scheduler may fill at once; see `taskCost`. */
  cpuBudget: number
  /** Browser tasks running at once. */
  browserJobs: number
}

/**
 * The isolated run itself. Source copies are verified against the trusted checkout after every candidate process
 * is gone, and a receipt is written only when every canonical command succeeded and every copy is unchanged.
 */
const pause = (ms: number) => new Promise<void>(done => setTimeout(done, ms))

export async function runIsolated(inputs: Inputs, runner: Runner, now = Date.now, sleep = pause): Promise<{ receipt: string; evidence: string } | { failed: string[] }> {
  const { channel, sha, output } = inputs
  const logs = join(output, 'logs'), source = join(output, 'source')
  const tasks = TASK_ORDER
  const startedAt = now()
  const execution = (task: string): CandidateExecution => ({ uid: UID, gid: UID, home: '/home/oa-candidate', work: `/home/oa-candidate/work/${task}`,
    socket: `/run/user/${UID}/docker.sock`, node: inputs.node.path, privateDirectory: logs })
  const preparation: PhaseRecord[] = []
  const failed: string[] = []
  // The pinned asset checkout validates build metadata offline and lets the E2E dev server serve card art locally,
  // so concurrent browser tasks never hit the public asset host from one owner IP (it rate-limits with HTTP 429).
  const services = { LOCAL_POSTGRES_PORT: String(inputs.servicePorts.postgres), LOCAL_S3_PORT: String(inputs.servicePorts.objects), TMPDIR: CANDIDATE_TMPDIR,
    PUBLIC_ASSET_VALIDATION_DIR: CANDIDATE_PUBLIC_ASSETS, E2E_PUBLIC_ASSET_DIR: CANDIDATE_PUBLIC_ASSETS,
    ...(inputs.testWorkers ? { VITEST_MAX_WORKERS: String(inputs.testWorkers) } : {}) }
  const properties = candidateProperties(inputs.ownerHome)
  // Preparation that downloads (packages, browsers, service images from Docker Hub) gets fresh attempts after a
  // transient network failure; every attempt keeps its own log in the evidence.
  const prepare = async (task: string, command: string, args: string[], phase: string, attempts = 1) => {
    for (let attempt = 0; ; attempt++) {
      const name = attempt ? `${phase}-a${attempt}` : phase
      const exitCode = await runner.candidate(execution(task), command, args, name, services, properties)
      preparation.push({ phase: name, exitCode, logSha256: fileSha256(join(logs, `${name}.log`)) })
      if (exitCode === 0) return
      if (attempt + 1 >= attempts) throw new Error(`Candidate ${phase} failed (exit ${exitCode})`)
      await sleep(PREPARATION_RETRY_DELAY_MS)
    }
  }
  const pnpm = join(dirname(inputs.node.path), 'pnpm')
  const records: TaskRecord[] = [], attempts: (TaskRecord & { attempt: number; passed: boolean })[] = []
  const runTask = async (task: FullTaskId, attempt: number) => {
    const taskStart = now(), commands: CommandRecord[] = []
    let failure: string | null = null
    for (const [index, command] of inputs.commands[task].entries()) {
      const phase = attempt ? `task-${task}-r${attempt}-${index}` : `task-${task}-${index}`
      const executable = command.command === 'pnpm' ? pnpm : command.command === 'node' ? inputs.node.path : command.command
      const exitCode = await runner.candidate(execution(task), executable, command.args, phase, { ...services, ...browserEnvironment(task, inputs.lanes), ...taskEnvironment(channel, sha, task, command) }, properties, inputs.profile)
      commands.push({ ...command, exitCode, logSha256: fileSha256(join(logs, `${phase}.log`)) })
      if (exitCode !== 0) { failure = `${task}: ${command.command} ${command.args.join(' ')} exited ${exitCode}`; break }
    }
    const record = { id: task, startedAt: iso(taskStart), completedAt: iso(now()), commands }
    attempts.push({ ...record, attempt, passed: failure === null })
    return { record, failure }
  }
  // An interrupted owner still tears the candidate down; a started identity is never left running.
  const interrupted = (signal: NodeJS.Signals) => {
    for (const step of [['stop', output, String(inputs.ownerUid), ...tasks], ['cleanup', output, String(inputs.ownerUid)]]) {
      try { runner.isolation(step, join(output, `isolation-${step[0]}-${signal.toLowerCase()}.log`)) } catch { /* reported in its log */ }
    }
    process.exit(130)
  }
  process.once('SIGINT', interrupted); process.once('SIGTERM', interrupted)
  let teardown: { stop: string; cleanup: string } | undefined
  try {
    // A partly failed start may already have created the identity, so teardown always follows it.
    runner.isolation(['start', policyRoot, output, String(inputs.ownerUid), inputs.publicAssets, ...tasks], join(output, 'isolation-start.log'))
    // The smoke's first container would pull its image, and the smoke itself cannot rerun (it leaves a named container
    // for the teardown proof). Pulling the pinned image first gives a registry or network stall the download retries;
    // the trusted Docker CLI runs it, no candidate code.
    await prepare(tasks[0], 'docker', ['pull', '--quiet', isolationSmokeImage()], 'smoke-image', NETWORK_ATTEMPTS)
    await prepare(tasks[0], inputs.node.path, ['/run/oa-ci-isolation/smoke.mts'], 'smoke')
    await prepare(tasks[0], pnpm, ['install', '--frozen-lockfile'], `install-${tasks[0]}`, NETWORK_ATTEMPTS)
    // The first install fills the candidate's pnpm store; the other copies then link from it.
    await pool(tasks.slice(1), 3, task => prepare(task, pnpm, ['install', '--frozen-lockfile'], `install-${task}`, NETWORK_ATTEMPTS))
    await prepare(tasks[0], pnpm, ['exec', 'playwright', 'install', 'chromium', 'webkit', 'firefox'], 'browsers', NETWORK_ATTEMPTS)
    // One start of the shared test services before tasks run concurrently, so no two tasks race to create them.
    await prepare(tasks[0], inputs.node.path, ['scripts/local-services.mjs', '--test'], 'services', NETWORK_ATTEMPTS)
    const failures = new Map<FullTaskId, string>()
    const browsers = semaphore(inputs.browserJobs)
    await budgetPool(tasks, inputs.cpuBudget, task => taskCost(task, inputs.lanes), async task => {
      const { record, failure } = await (verificationTask(task).browser ? browsers(() => runTask(task, 0)) : runTask(task, 0))
      if (failure) failures.set(task, failure); else records.push(record)
    }, inputs.jobs)
    for (let attempt = 1; attempt <= inputs.retries && failures.size; attempt++) {
      for (const task of TASK_ORDER.filter(task => failures.has(task))) {
        const { record, failure } = await runTask(task, attempt)
        if (failure) failures.set(task, failure); else { failures.delete(task); records.push(record) }
      }
    }
    failed.push(...failures.values())
  } catch (error) {
    failed.push(error instanceof Error ? error.message : String(error))
  } finally {
    process.off('SIGINT', interrupted); process.off('SIGTERM', interrupted)
    const stop = join(output, 'isolation-stop.log'), cleanup = join(output, 'isolation-cleanup.log')
    try {
      runner.isolation(['stop', output, String(inputs.ownerUid), ...tasks], stop)
    } catch (error) { failed.push(error instanceof Error ? error.message : String(error)) }
    try {
      for (const task of tasks) {
        try { runner.verifySources(source, execution(task).work, sha) } catch (error) { failed.push(`${task} source: ${error instanceof Error ? error.message : String(error)}`) }
        try { mkdirSync(join(output, 'diagnostics', task), { recursive: true, mode: 0o700 }); runner.collectDiagnostics(execution(task).work, join(output, 'diagnostics', task)) } catch { /* diagnostics are best effort */ }
      }
    } finally {
      runner.isolation(['cleanup', output, String(inputs.ownerUid)], cleanup)
    }
    teardown = { stop: existsSync(stop) ? fileSha256(stop) : '', cleanup: fileSha256(cleanup) }
  }
  const completedAt = now()
  if (failed.length || records.length !== tasks.length) return { failed: failed.length ? failed : ['Not every task ran'] }
  if (inputs.profile) return { failed: ['Profiling run: every task passed; profiling runs write no receipt'] }
  const ordered = FULL_TASK_IDS.map(id => records.find(record => record.id === id)!)
  const evidence = { format: 1, kind: 'owner-local-uid-rootless-v1', channel, repository: inputs.repository,
    candidate: { sha, tree: inputs.tree, configuration: inputs.configuration },
    producer: { sha: inputs.producerSha, configuration: inputs.producerConfiguration, files: inputs.policyFiles },
    sandbox: { identity: 'oa-candidate', uid: UID, rootlessDocker: inputs.dockerVersion, noNewPrivileges: true, supplementaryGroups: [],
      limits: { MemoryMax: '64G', TasksMax: 16384, CPUWeight: 50 }, unitProperties: properties, tmpdir: CANDIDATE_TMPDIR, cpuBudget: inputs.cpuBudget, taskCosts: Object.fromEntries(TASK_ORDER.map(task => [task, taskCost(task, inputs.lanes)])), testWorkers: inputs.testWorkers, browserJobs: inputs.browserJobs, lanes: inputs.lanes, browserPortSlices: BROWSER_PORT_SLICES,
      publicAssets: { version: git(['rev-parse', 'HEAD'], inputs.publicAssets), validationDirectory: CANDIDATE_PUBLIC_ASSETS },
      servicePorts: inputs.servicePorts, isolationStartSha256: fileSha256(join(output, 'isolation-start.log')) },
    prerequisites: { node: inputs.node, packageManager: 'corepack', preparation },
    tasks: ordered, attempts, sourceIntegrity: { verifiedAfterTeardown: [...FULL_TASK_IDS] },
    teardown: { stopSha256: teardown!.stop, cleanupSha256: teardown!.cleanup },
    startedAt: iso(startedAt), completedAt: iso(completedAt) }
  const evidenceText = JSON.stringify(evidence, null, 1) + '\n'
  const evidencePath = join(output, 'execution-evidence.json')
  writeFileSync(evidencePath, evidenceText, { flag: 'wx', mode: 0o600 })
  const common = { repository: inputs.repository, repositoryId: inputs.repositoryId, testedSha: sha, candidateSha: sha, tree: inputs.tree,
    configuration: inputs.configuration, producerConfiguration: inputs.producerConfiguration, startedAt: iso(startedAt), completedAt: iso(completedAt),
    environment: { node: inputs.node.version, platform: process.platform, arch: process.arch, nodeExecutable: inputs.node.path }, tasks: ordered }
  const receipt = channel === 'stable' ? { format: 1, kind: 'owner-local-verification', ...common }
    : { format: 2, kind: 'owner-local-prerelease-verification', ...common, channel: 'prerelease', producerSha: inputs.producerSha,
      execution: { kind: 'docker-isolated', evidenceSha256: sha256(evidenceText) } }
  const receiptPath = join(output, channel === 'stable' ? 'verification.json' : 'pre-verification.json')
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 1) + '\n', { flag: 'wx', mode: 0o600 })
  return { receipt: receiptPath, evidence: evidencePath }
}

function option(args: string[], name: string, fallback?: string): string {
  const index = args.indexOf(name)
  const value = index >= 0 ? args[index + 1] : fallback
  if (value === undefined || value.startsWith('--')) throw new Error(`Missing ${name}`)
  return value
}
/**
 * The candidate UID and its rootless daemon run on the owner's machine; the owner's home must not be readable or
 * traversable by other users, as GitHub runner setup makes the runner home private.
 */
export function assertPrivateHome(home: string, stat = statSync): void {
  const info = stat(home)
  if (!info.isDirectory() || (info.mode & 0o007) !== 0) throw new Error(`The owner home ${home} must not be accessible to other users; run chmod o-rwx ${home}`)
}

/** Paths a candidate tree must not contain: the recorder mounts shared test data there as root. */
export function assertNoReservedCandidatePaths(entries: string): void {
  if (entries.trim()) throw new Error('The candidate tree contains data/, which the recorder reserves for shared test services')
}

/** A loopback port free right now; the kernel's ephemeral range stays clear of the 20000–32767 test ports. */
function freePort(): Promise<number> {
  return new Promise((done, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => typeof address === 'object' && address ? done(address.port) : reject(new Error('No free port'))) })
  })
}
/**
 * A clean public asset checkout at `version`, cached per SHA under the owner's state directory and fetched shallowly
 * from the public repository; the SHA alone identifies its content.
 */
export function trustedPublicAssets(version: string): string {
  fullSha(version)
  const directory = join(process.env.HOME ?? '', '.local/state/open-agricola/owner-local-verification/public-assets', version)
  if (!existsSync(join(directory, '.git'))) {
    rmSync(directory, { recursive: true, force: true })
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    git(['init', '--quiet', directory], dirname(directory))
    git(['fetch', '--quiet', '--no-tags', '--depth', '1', 'https://github.com/titanxxh/open-agricola-assets.git', version], directory)
    git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], directory)
  }
  if (git(['rev-parse', 'HEAD'], directory) !== version || git(['status', '--porcelain', '--untracked-files=all'], directory)) throw new Error(`Public asset cache ${directory} is not a clean checkout of ${version}; remove it and retry`)
  return directory
}
const git = (args: string[], cwd = policyRoot) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

export const OWNER_LOCAL_LOCK = '/tmp/oa-owner-local-verification.lock'
/**
 * One candidate identity exists per machine, so owner-local runs (the recorder, the validator image build) never
 * overlap. Returns the release; the lock also goes when the process exits.
 */
export function acquireOwnerLocalLock(lock = OWNER_LOCAL_LOCK): () => void {
  try { writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 }) }
  catch { throw new Error(`Another owner-local verification holds ${lock}; remove it only after confirming no run is active`) }
  const release = () => { try { if (readFileSync(lock, 'utf8') === String(process.pid)) rmSync(lock) } catch { /* already gone */ } }
  process.once('exit', release)
  return release
}

/** The trusted shallow source checkout of `sha` under `output`, like the GitHub candidate checkout; copies come from it as root. */
export function checkoutTrustedSource(output: string, sha: string): string {
  const source = join(output, 'source')
  git(['init', '--quiet', source], output)
  git(['fetch', '--quiet', '--no-tags', '--depth', '1', `file://${policyRoot}`, sha], source)
  git(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], source)
  git(['remote', 'add', 'origin', `https://github.com/${RELEASE_REPOSITORY}.git`], source)
  assertCandidateCheckout(source, sha)
  return source
}

export async function main(args: string[]): Promise<number> {
  ownerMachine()
  const ownerUid = process.getuid?.() ?? 0
  if (ownerUid === 0 || ownerUid === UID) throw new Error('Run owner-local verification as the owner, not as root or the candidate')
  const channel = option(args, '--channel')
  if (channel !== 'stable' && channel !== 'prerelease') throw new Error('--channel must be stable or prerelease')
  const sha = fullSha(option(args, '--sha')), output = resolve(option(args, '--output')), jobs = Number(option(args, '--jobs', '10')), retries = Number(option(args, '--retries', '1'))
  if (!Number.isSafeInteger(retries) || retries < 0 || retries > 3) throw new Error('--retries must be 0–3')
  if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 64) throw new Error('--jobs must be 1–64')
  const testWorkers = Number(option(args, '--test-workers', String(DEFAULT_TEST_WORKERS)))
  if (!Number.isSafeInteger(testWorkers) || testWorkers < 0 || testWorkers > 64) throw new Error('--test-workers must be 0–64 (0 keeps the Vitest default)')
  const browserJobs = Number(option(args, '--browser-jobs', String(DEFAULT_BROWSER_JOBS)))
  if (!Number.isSafeInteger(browserJobs) || browserJobs < 1 || browserJobs > 16) throw new Error('--browser-jobs must be 1–16')
  const lanes = Number(option(args, '--lanes', String(DEFAULT_LANES)))
  if (!Number.isSafeInteger(lanes) || lanes < 1 || lanes > 8) throw new Error('--lanes must be 1–8')
  const cpuBudget = Number(option(args, '--cpu-budget', String(availableParallelism())))
  if (!Number.isSafeInteger(cpuBudget) || cpuBudget < 1 || cpuBudget > 512) throw new Error('--cpu-budget must be 1–512')
  if (git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('The trusted policy checkout has tracked edits')
  const producerSha = git(['rev-parse', 'HEAD'])
  if (spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: policyRoot }).status !== 0) git(['fetch', '--no-tags', '--quiet', 'origin', sha])
  assertPrivateHome(homedir())
  assertNoReservedCandidatePaths(git(['ls-tree', '--name-only', sha, '--', 'data']))
  if (existsSync(output) || realpathSync(dirname(output)) !== dirname(output)) throw new Error('Choose a new private output directory for each run, under a path without symlinks')
  acquireOwnerLocalLock()
  for (const directory of [output, join(output, 'logs'), join(output, 'diagnostics')]) mkdirSync(directory, { mode: 0o700 })
  checkoutTrustedSource(output, sha)
  const publicAssets = trustedPublicAssets(git(['show', `${sha}:public-assets.ref`]))
  const metadata = github(RELEASE_REPOSITORY, '') as { id?: unknown }
  if (typeof metadata.id !== 'number') throw new Error('Unreadable native repository identity')
  const node = { path: NODE, version: execFileSync(NODE, ['--version'], { encoding: 'utf8' }).trim(), sha256: fileSha256(NODE) }
  const policyFiles = Object.fromEntries(['scripts/ci/owner-local-run.ts', 'scripts/ci/owner-local-isolation.sh', 'scripts/ci/candidate-isolation.ts',
    'scripts/ci/candidate-isolation-smoke.ts', 'scripts/ci/candidate-user-environment.sh'].map(file => [file, fileSha256(join(policyRoot, file))]))
  const inputs: Inputs = { channel, sha, producerSha, output, jobs, repository: RELEASE_REPOSITORY, repositoryId: metadata.id,
    tree: git(['rev-parse', `${sha}^{tree}`]), configuration: verificationConfiguration(policyRoot, sha),
    producerConfiguration: verificationConfiguration(policyRoot, producerSha), commands: canonicalOwnerLocalCommands(policyRoot, sha, channel),
    ownerUid, node, dockerVersion: execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], { encoding: 'utf8' }).trim(), policyFiles,
    servicePorts: { postgres: await freePort(), objects: await freePort() }, retries, testWorkers: testWorkers || null, publicAssets, profile: args.includes('--profile'), browserJobs,
    ownerHome: homedir(), lanes, cpuBudget }
  const result = await runIsolated(inputs, nativeRunner)
  if ('failed' in result) { console.error(`Owner-local verification failed:\n- ${result.failed.join('\n- ')}\nLogs: ${join(output, 'logs')}`); return 1 }
  // The publisher applies the same checks; failing here keeps an unusable receipt from being published.
  const selection = { repository: RELEASE_REPOSITORY, repositoryId: metadata.id, candidateSha: sha, producerSha }
  const written: unknown = JSON.parse(readFileSync(result.receipt, 'utf8'))
  if (channel === 'stable') rebindOwnerLocalReceipt(policyRoot, written, selection); else rebindPrereleaseOwnerLocalReceipt(policyRoot, written, selection)
  console.log(JSON.stringify({ channel, sha, producerSha, receipt: result.receipt, evidence: result.evidence }))
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main(process.argv.slice(2)) }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
}
