import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const temporary: string[] = []
afterAll(() => temporary.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })))
const root = path.resolve(__dirname, '../..')
const helper = path.join(root, 'server/__tests__/_helpers/scenario-evidence.ts')
const fixture = path.join(root, 'server/__tests__/_helpers/session-fixtures.ts')
const sessionImports = `import { createWorkSession } from ${JSON.stringify(fixture)}\nimport { createScenarioEvidence } from ${JSON.stringify(helper)}\n`

type RunOptions = { diagnostic?: boolean; blockOutput?: boolean }
type FileResult = { name: string; status: string }

function run(files: { name: string; text: string }[], { diagnostic = false, blockOutput = false }: RunOptions = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oa-scenario-evidence-'))
  temporary.push(directory)
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
  for (const file of files) fs.writeFileSync(path.join(directory, file.name), `${sessionImports}${file.text}`)
  fs.writeFileSync(path.join(directory, 'vitest.config.mjs'), `export default ${JSON.stringify({ test: { root: directory, include: ['scenario*.test.ts'], pool: 'forks', maxWorkers: 2 } })}`)
  const output = path.join(directory, 'evidence')
  if (blockOutput) fs.writeFileSync(output, 'blocked')
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--config', path.join(directory, 'vitest.config.mjs'), '--reporter=json', `--outputFile=${path.join(directory, 'results.json')}`], {
    cwd: directory, encoding: 'utf8', env: { ...process.env, AGRICOLA_TEST_EVIDENCE_DIR: output, AGRICOLA_TEST_DIAGNOSTIC: diagnostic ? '1' : '0' },
  })
  return { ...result, directory, output }
}

function evidenceFiles(directory: string): string[] {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? evidenceFiles(path.join(directory, entry.name)) : [path.join(directory, entry.name)])
}

/** One scenario: its inner test files, whether they pass, and what the outer test asserts about them. */
type Scenario = { name: string; passes: boolean; sources: string[]; check: (view: ScenarioView) => void }
type ScenarioView = {
  status: number | null
  stdout: string
  stderr: string
  output: string
  /** Evidence files written for this scenario's own inner test files. */
  evidence: string[]
  /** JSON reporter entries for this scenario's own inner test files. */
  results: string
  /** Contents written by the scenario's onTestFailed callback, which runs after the evidence cleanup. */
  afterCleanup: () => unknown
}

/**
 * Runs every scenario that shares the same evidence environment in one nested Vitest process.
 * Each scenario keeps its own test files, so evidence directories, reporter entries and
 * after-cleanup records stay separate per scenario while the nested start-up is paid once.
 */
function scenarioGroup(name: string, options: RunOptions, scenarios: Scenario[]) {
  describe(name, () => {
    let outcome: ReturnType<typeof run> & { reported: FileResult[] }
    const prefix = (index: number) => `scenario-${index}-`
    const cleanup = (index: number) => `after-cleanup-${index}.json`
    beforeAll(() => {
      const files = scenarios.flatMap((scenario, index) => scenario.sources.map((text, source) => ({
        name: `${prefix(index)}${source}.test.ts`, text: text.replaceAll("'after-cleanup.json'", `'${cleanup(index)}'`),
      })))
      const result = run(files, options)
      const reported = (JSON.parse(fs.readFileSync(path.join(result.directory, 'results.json'), 'utf8')) as { testResults: FileResult[] }).testResults
      outcome = { ...result, reported }
    }, 120_000)
    scenarios.forEach((scenario, index) => it(scenario.name, () => {
      const own = outcome.reported.filter(entry => path.basename(entry.name).startsWith(prefix(index)))
      expect(own, `${outcome.stdout}\n${outcome.stderr}`).toHaveLength(scenario.sources.length)
      expect(own.map(entry => entry.status), `${outcome.stdout}\n${outcome.stderr}`).toEqual(scenario.sources.map(() => scenario.passes ? 'passed' : 'failed'))
      expect(outcome.status).toBe(scenarios.every(item => item.passes) ? 0 : 1)
      scenario.check({
        status: outcome.status, stdout: outcome.stdout, stderr: outcome.stderr, output: outcome.output,
        evidence: evidenceFiles(outcome.output).filter(file => path.relative(outcome.output, file).split(path.sep).some(part => part.startsWith(prefix(index)))),
        results: JSON.stringify(own),
        afterCleanup: () => JSON.parse(fs.readFileSync(path.join(outcome.directory, cleanup(index)), 'utf8')),
      })
    }))
  })
}

scenarioGroup('without diagnostics', {}, [
  { name: 'successful Session tests keep full state off disk', passes: true, sources: [`import { describe, it, expect } from 'vitest'
describe('successful scenario', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('observes the real two-player fixture', () => {
    const session = evidence.track(createWorkSession())
    expect(session.getState().state.players).toHaveLength(2)
  })
})`], check: ({ evidence }) => {
    expect(evidence).toEqual([])
  } },
  { name: 'captures a failure before any save while the Session rules are still live', passes: false, sources: [`import fs from 'node:fs'
import { describe, it, expect, onTestFailed } from 'vitest'
describe('failing scenario', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('fails before a checkpoint call', () => {
    const session = evidence.track(createWorkSession())
    session.actionHooks.register({ id: 'veto-forest', actions: ['forest'], phases: ['isDoable'], handler: () => ({ doable: false }) })
    onTestFailed(() => fs.writeFileSync('after-cleanup.json', JSON.stringify({ forest: session.getState().actionAvailability.forest })))
    expect(session.getState().actionAvailability.forest, 'original body failure').toBe(true)
  })
})`], check: ({ evidence, results, afterCleanup }) => {
    expect(evidence).toHaveLength(1)
    const saved: unknown = JSON.parse(fs.readFileSync(evidence[0]!, 'utf8'))
    expect(saved).toMatchObject({ scenario: 'fails before a checkpoint call', sessions: [{ response: { actionAvailability: { forest: false } } }] })
    expect(afterCleanup()).toEqual({ forest: true })
    expect(results).toContain('original body failure')
  } },
  { name: 'a later teardown failure retains its pre-dispose checkpoint', passes: false, sources: [`import { afterEach, describe, it, expect } from 'vitest'
describe('late failure', () => {
  afterEach(() => { throw new Error('original later teardown failure') })
  const evidence = createScenarioEvidence(import.meta.url)
  it('passes its body before teardown fails', () => {
    const session = evidence.track(createWorkSession())
    session.actionHooks.register({ id: 'veto-forest', actions: ['forest'], phases: ['isDoable'], handler: () => ({ doable: false }) })
    expect(session.getState().actionAvailability.forest).toBe(false)
  })
})`], check: ({ evidence, results }) => {
    expect(evidence).toHaveLength(1)
    const saved: unknown = JSON.parse(fs.readFileSync(evidence[0]!, 'utf8'))
    expect(saved).toMatchObject({ sessions: [{ response: { actionAvailability: { forest: false } } }] })
    expect(results).toContain('original later teardown failure')
  } },
  { name: 'keeps the checkpoint until a later onTestFinished failure is known', passes: false, sources: [`import { describe, it, expect, onTestFinished } from 'vitest'
describe('finished hook failure', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('passes before its final callback fails', () => {
    const session = evidence.track(createWorkSession())
    session.actionHooks.register({ id: 'veto-forest', actions: ['forest'], phases: ['isDoable'], handler: () => ({ doable: false }) })
    onTestFinished(() => { throw new Error('original finished callback failure') })
    expect(session.getState().actionAvailability.forest).toBe(false)
  })
})`], check: ({ evidence, results }) => {
    expect(evidence).toHaveLength(1)
    const saved: unknown = JSON.parse(fs.readFileSync(evidence[0]!, 'utf8'))
    expect(saved).toMatchObject({ sessions: [{ response: { actionAvailability: { forest: false } } }] })
    expect(results).toContain('original finished callback failure')
  } },
])

const parallelSource = `import { describe, it, expect } from 'vitest'
describe('parallel scenarios', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('相同场景 / shared label', () => {
    const session = evidence.track(createWorkSession())
    expect(session.getState().state.players).toHaveLength(2)
  })
})`

scenarioGroup('with diagnostics', { diagnostic: true }, [
  { name: 'diagnostic checkpoints freeze state at the record call', passes: true, sources: [`import { describe, it, expect } from 'vitest'
describe('diagnostic scenario', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('records before grain is taken', () => {
    const session = evidence.track(createWorkSession({ configure(state) { state.players[0].resources.grain = 0 } }))
    evidence.record('before grain', session.getState())
    const response = session.takeAction(0, 'grain-seeds')
    expect(response.ok).toBe(true)
    expect(response.state.players[0].resources.grain).toBe(1)
  })
})`], check: ({ evidence }) => {
    expect(evidence).toHaveLength(1)
    const saved: unknown = JSON.parse(fs.readFileSync(evidence[0]!, 'utf8'))
    expect(saved).toMatchObject({ records: [{ label: 'before grain', value: { state: { players: [{ resources: { grain: 0 } }, {}] } } }], sessions: [{ response: { state: { players: [{ resources: { grain: 1 } }, {}] } } }] })
  } },
  { name: 'parallel files with identical scenario names retain separate diagnostic evidence', passes: true, sources: [parallelSource, parallelSource], check: ({ evidence }) => {
    expect(evidence).toHaveLength(2)
    expect(new Set(evidence).size).toBe(2)
    for (const file of evidence) {
      const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
      expect(saved).toMatchObject({ scenario: '相同场景 / shared label', sessions: [{ response: { ok: true } }] })
    }
  } },
  { name: 'counts omitted oversized records and keeps the retained checkpoint bounded', passes: true, sources: [`import { describe, it, expect } from 'vitest'
describe('bounded evidence', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('reports an oversized record', () => {
    const session = evidence.track(createWorkSession())
    evidence.record('oversized input', 'x'.repeat(2 * 1024 * 1024))
    expect(session.getState().ok).toBe(true)
  })
})`], check: ({ evidence }) => {
    expect(evidence).toHaveLength(1)
    const file = evidence[0]!
    const saved: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(saved).toMatchObject({ records: [], omittedRecords: 1, sessions: [{ response: { ok: true } }] })
    expect(fs.statSync(file).size).toBeLessThan(4 * 1024 * 1024)
  } },
])

scenarioGroup('with an unwritable evidence directory', { blockOutput: true }, [
  { name: 'an evidence write failure preserves the original failure and still disposes sessions', passes: false, sources: [`import fs from 'node:fs'
import { describe, it, expect, onTestFailed } from 'vitest'
describe('unwritable evidence', () => {
  const evidence = createScenarioEvidence(import.meta.url)
  it('keeps the body failure', () => {
    const session = evidence.track(createWorkSession())
    session.actionHooks.register({ id: 'veto-forest', actions: ['forest'], phases: ['isDoable'], handler: () => ({ doable: false }) })
    onTestFailed(() => fs.writeFileSync('after-cleanup.json', JSON.stringify({ forest: session.getState().actionAvailability.forest })))
    expect(session.getState().actionAvailability.forest, 'original unwritable body failure').toBe(true)
  })
})`], check: ({ output, stderr, results, afterCleanup }) => {
    expect(fs.readFileSync(output, 'utf8')).toBe('blocked')
    expect(stderr).toContain('scenario-evidence-error')
    expect(results).toContain('original unwritable body failure')
    expect(afterCleanup()).toEqual({ forest: true })
  } },
])
