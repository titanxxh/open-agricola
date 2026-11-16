// Owner-only live prerelease acceptance CLI. Run from the trusted owner checkout:
//   node --import tsx scripts/prerelease/live-acceptance/cli.mjs <run|bundle|acceptance> --config <private.json> ...
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { chromium, firefox, webkit } from 'playwright'
import { assertNoAccountValues, loadAcceptanceConfig, privateDirectory, privateJson } from './context.mjs'
import { createKit } from './browser.mjs'
import * as suites from './suites.mjs'
import { acceptanceRecord, bundleEvidence, collectResults } from './evidence.mjs'

const root = resolve(import.meta.dirname, '../../..')
const engines = { chromium, firefox, webkit }
const writePrivate = (path, value) => { writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); chmodSync(path, 0o600) }
const deploy = (ctx, action, extra = []) => JSON.parse(execFileSync('./deploy-prerelease.sh', [action, '--config', ctx.config.targetConfig, '--ssh', ctx.config.ssh, '--expected-current', ctx.config.candidate, ...extra],
  { cwd: root, encoding: 'utf8', timeout: 10 * 60_000, stdio: ['ignore', 'pipe', 'pipe'] }))
const ssh = (ctx, script, input = '') => execFileSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20', ctx.config.ssh, 'bash', '-s'], { input: script + '\n' + input, encoding: 'utf8', timeout: 120_000 }).trim()

function parseArgs(argv) {
  const [command, ...rest] = argv, options = {}
  for (let index = 0; index < rest.length; index += 2) {
    if (!rest[index]?.startsWith('--') || rest[index + 1] === undefined) throw new Error(`Invalid argument near ${rest[index] ?? '(end)'}`)
    options[rest[index].slice(2)] = rest[index + 1]
  }
  if (!options.config) throw new Error('--config <private acceptance config> is required')
  return { command, options }
}

/** Fresh status, private ingress token (maintenance only), healthy cycle and live app instance for one run. */
function prepare(ctx, runDirectory) {
  const status = deploy(ctx, 'status')
  if (status.installed?.buildId !== ctx.config.candidate) throw new Error('The installed candidate differs from the acceptance config')
  let verificationTokenFile = null
  if (status.mode === 'maintenance') {
    const access = deploy(ctx, 'verify-access')
    verificationTokenFile = join(runDirectory, 'verification.token')
    execFileSync('scp', ['-q', `${ctx.config.ssh}:${access.tokenFile}`, verificationTokenFile], { timeout: 60_000 }); chmodSync(verificationTokenFile, 0o600)
  }
  const control = `${ctx.target.directory}/control`
  const healthyCycle = ssh(ctx, `python3 -c "import json;print(json.load(open('${control}/storage-guard.json'))['healthyCycle'])"`)
  // The SQL travels in this script; docker exec reads /dev/null so it cannot swallow the rest of stdin.
  const instanceId = ssh(ctx, `G='${ctx.config.guardConfig}'
PG=$(python3 -c "import json;print(json.load(open('$G'))['postgresContainer'])"); AD=$(python3 -c "import json;print(json.load(open('$G'))['postgresAdmin'])")
docker exec "$PG" psql -X -qAt -U "$AD" -d '${ctx.target.database.name}' -c "BEGIN READ ONLY; SELECT instance_id FROM app_instances WHERE status='ready' AND lease_until > (extract(epoch from now())*1000)::bigint; COMMIT;" < /dev/null`)
  if (!/^[a-f0-9-]{36}$/.test(healthyCycle) || !/^[a-f0-9-]{36}$/.test(instanceId)) throw new Error('Expected one healthy cycle and exactly one ready pre instance')
  const bindings = { format: 1, mode: status.mode, candidateSha: ctx.config.candidate, producerSha: ctx.producer, generation: status.generation, operationId: status.operation?.id ?? null,
    healthyCycle, fingerprint: status.fingerprint, instanceId, verificationTokenFile }
  writePrivate(join(runDirectory, 'bindings.json'), bindings); writePrivate(join(runDirectory, 'status.json'), status)
  return { status, bindings }
}

async function runSuite(ctx, options) {
  const suite = options.suite, stamp = new Date().toISOString().replace(/[:.]/g, '-')
  // Reject an unknown case before minting tokens or touching the target.
  const requested = suites.parseCaseSelection(suite, options.case)
  const runDirectory = options.run ? privateDirectory(options.run, 'Run directory') : join(ctx.outputRoot, `run-${stamp}`)
  mkdirSync(runDirectory, { recursive: true, mode: 0o700 })
  const { status, bindings } = prepare(ctx, runDirectory)
  const accounts = [...ctx.accounts, ...ctx.team]
  const kit = createKit({ origins: ctx.origins, formalBuild: ctx.config.formalBuild, bindings, accounts, ownerCookie: ctx.config.ownerCookie })
  const list = value => value.split(',').map(v => v.trim()).filter(Boolean)
  const plan = {
    handoff: { cases: [suites.handoffCase] },
    boundary: { cases: [suites.visitorCase, suites.ordinaryCase, suites.betaBoundaryCase, suites.revocationCase] },
    multihand: { cases: [(k, b, a) => suites.multihandCase(k, b, a, options.guest ?? 'B', runDirectory)] },
    team: { cases: [(k, b, a) => suites.teamGameCase(k, b, a, list(options.players ?? 'A,B,C,D'), runDirectory)] },
    sandbox: { cases: [(k, b, a) => suites.sandboxCase(k, b, a, runDirectory)] },
    viewer: { cases: [(k, b, a) => suites.viewerCase(k, b, a, options.room, runDirectory)] },
    continuity: { cases: [(k, b, a) => suites.continuityCase(k, b, a, options.room)] },
    deletion: { cases: [(k, b, a) => suites.deletionCase(k, b, a, list(options.labels ?? ''))] },
    readback: { cases: [suites.readbackCase] },
  }[suite]
  if (!plan) throw new Error(`Unknown suite ${suite}`)
  plan.engines = suites.SUITE_ENGINES[suite]
  if (['viewer', 'continuity'].includes(suite) && !/^[a-f0-9-]{36}$/.test(options.room ?? '')) throw new Error('--room <archived room id> is required')
  if (suite === 'readback' ? status.mode !== 'open' : status.mode !== 'maintenance') throw new Error(`Suite ${suite} needs the target in ${suite === 'readback' ? 'open' : 'maintenance'} mode`)
  const summary = []
  const selectedEngines = options.engine ? list(options.engine) : plan.engines
  for (const engineName of selectedEngines) if (!engines[engineName]) throw new Error(`Unknown engine ${engineName}`)
  if (!selectedEngines.some(engineName => suites.selectCases(suite, engineName, requested).length)) throw new Error(`No selected ${suite} case runs on ${selectedEngines.join(', ')}`)
  for (const engineName of selectedEngines) {
    const engine = engines[engineName], selected = suites.selectCases(suite, engineName, requested)
    if (!selected.length) continue
    // `cases` names what this run executed; a later single-case rerun replaces only those cases in the bundle.
    const report = { format: 1, suite, engine: engineName, candidate: bindings.candidateSha, generation: bindings.generation, operationId: bindings.operationId,
      healthyCycle: bindings.healthyCycle, mode: bindings.mode, startedAt: new Date().toISOString(), cases: selected.map(({ label }) => label), results: [] }
    // The kit spans every engine of the run; each report keeps only what happened in its own engine.
    const hungFrom = kit.hung.length, retriesFrom = kit.retries.length
    if (bindings.mode === 'maintenance') await kit.publicIsClosed()
    // A fresh browser per case: WebKit keeps stale engine state after the blocked-frame embedding probes.
    for (const { label, index } of selected) {
      const run = suite === 'viewer' ? plan.cases[0] : plan.cases[index]
      // Firefox renders the JSON probe page in its JSON viewer; a plain text document keeps evaluations stable.
      const browser = await engine.launch({ headless: true, ...(engineName === 'firefox' ? { firefoxUserPrefs: { 'devtools.jsonview.enabled': false } } : {}) }); report.version = browser.version()
      kit.partial = null
      try { report.results.push(await run(kit, browser, accounts)) }
      catch (error) { report.results.push({ ...(kit.partial ?? {}), case: label, passed: false, error: String(error.message).slice(0, 400) }) }
      finally { await browser.close().catch(() => {}) }
    }
    if (bindings.mode === 'maintenance') report.publicStill503 = await kit.publicStillClosed(report)
    report.boundedEvaluations = kit.hung.slice(hungFrom); report.networkRetries = kit.retries.slice(retriesFrom)
    report.passed = report.results.length === selected.length && report.results.every(v => v.passed) && (bindings.mode !== 'maintenance' || report.publicStill503)
    report.completedAt = new Date().toISOString()
    const text = JSON.stringify(report, null, 2) + '\n'; assertNoAccountValues(accounts, text, `${suite} result`)
    writePrivate(join(runDirectory, `result-${suite}-${engineName}-${Date.now()}.json`), text)
    summary.push({ engine: engineName, passed: report.passed, cases: report.results.map(v => [v.case, v.passed]) })
  }
  process.stdout.write(JSON.stringify({ suite, run: runDirectory, summary }) + '\n')
  if (!summary.every(v => v.passed)) process.exitCode = 1
}

function capacitySnapshot(ctx) {
  const project = ctx.target.project
  return JSON.parse(ssh(ctx, `python3 - <<'PY'
import json, subprocess
def run(*a):
    return subprocess.run(a, capture_output=True, text=True).stdout.strip()
def box(name):
    s = run('docker', 'inspect', '-f', '{{.State.StartedAt}}|{{.RestartCount}}|{{.HostConfig.Memory}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}', name).split('|')
    return {'memUsage': run('docker', 'stats', '--no-stream', '--format', '{{.MemUsage}}', name), 'startedAt': s[0], 'restarts': int(s[1] or 0), 'memLimitBytes': int(s[2] or 0), 'health': s[3] if len(s) > 3 else None}
mem = {l.split(':')[0]: int(l.split()[1]) // 1024 for l in open('/proc/meminfo') if l.split(':')[0] in ('MemTotal', 'MemAvailable', 'SwapTotal', 'SwapFree')}
unit = dict(line.split('=', 1) for line in run('systemctl', 'show', '${project}-storage-guard.service', '-p', 'MemoryCurrent', '-p', 'MemoryMax', '-p', 'NRestarts', '-p', 'ActiveState').splitlines() if '=' in line)
print(json.dumps({'preApp': box('${project}-app-1'), 'preGateway': box('${project}-gateway-1'), 'formalApp': box('${ctx.target.formal.project}-app-1'), 'storageGuardUnit': unit, 'hostMiB': mem, 'load': open('/proc/loadavg').read().split()[:3]}))
PY`))
}

async function formalChecks(ctx) {
  const checks = {}
  for (const [name, url] of [['pagesBuild', ctx.origins.formalApp + '/frontend-build.json'], ['browserPolicy', ctx.origins.formalApi + '/api/auth/browser-policy'], ['health', ctx.origins.formalApi + '/api/health']]) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) }), body = await response.json().catch(() => ({}))
    checks[name] = { status: response.status, ...Object.fromEntries(Object.entries(body).filter(([key]) => ['gameBuildId', 'buildId', 'version', 'ok', 'releaseChannel', 'deploymentTarget'].includes(key))) }
  }
  return { checkedAt: new Date().toISOString(), checks, passed: checks.pagesBuild.gameBuildId === ctx.config.formalBuild && checks.browserPolicy.buildId === ctx.config.formalBuild && checks.health.ok === true }
}

async function bundle(ctx, options) {
  const output = privateDirectory(options.output, 'Evidence output directory'), accounts = [...ctx.accounts, ...ctx.team]
  const runs = options.runs.split(',').map(path => privateDirectory(path, 'Run directory'))
  const status = privateJson(join(runs.at(-1), 'status.json'), 'Run status'), bindings = privateJson(join(runs.at(-1), 'bindings.json'), 'Run bindings')
  const owner = options.extra ? privateJson(options.extra, 'Owner evidence notes') : {}
  const extra = { ...owner, capacity: { ...owner.capacity, snapshot: capacitySnapshot(ctx) }, 'formal-unaffected': { ...owner['formal-unaffected'], ...(await formalChecks(ctx)) } }
  const common = { candidate: ctx.config.candidate, generation: status.generation, operationId: status.operation?.id ?? null, healthyCycle: bindings.healthyCycle, formalBuild: ctx.config.formalBuild,
    ownerToolsPolicy: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() }
  const index = bundleEvidence({ results: collectResults(runs), output, common, accounts, extra })
  writePrivate(join(output, 'index.json'), index)
  process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(index).map(([item, entry]) => [item, entry.passed]))) + '\n')
  if (!Object.values(index).every(entry => entry.passed)) process.exitCode = 1
}

function acceptance(ctx, options) {
  const index = privateJson(options.index, 'Evidence index'), formalBrowser = privateJson(options['formal-browser'], 'Formal browser proof')
  const status = deploy(ctx, 'status')
  const healthyCycle = ssh(ctx, `python3 -c "import json;print(json.load(open('${ctx.target.directory}/control/storage-guard.json'))['healthyCycle'])"`)
  if (!Object.values(index).every(entry => entry.passed)) throw new Error('Every evidence item must pass before writing acceptance')
  writePrivate(resolve(options.output), acceptanceRecord({ targetId: ctx.target.targetId, status, healthyCycle, index, formalBrowser }))
  process.stdout.write(JSON.stringify({ acceptance: resolve(options.output), items: Object.keys(index).length + 1 }) + '\n')
}

const { command, options } = parseArgs(process.argv.slice(2))
const ctx = loadAcceptanceConfig(options.config)
if (command === 'run') await runSuite(ctx, options)
else if (command === 'bundle') await bundle(ctx, options)
else if (command === 'acceptance') acceptance(ctx, options)
else throw new Error('Use run --suite <name> [--engine <e,...>] [--case <label,...>] | bundle --runs <dirs> --output <dir> | acceptance --index <file> --formal-browser <file> --output <file>')
