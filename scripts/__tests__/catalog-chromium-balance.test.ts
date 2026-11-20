import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FULL_TASK_IDS, TASK_FIXTURE_IMAGES, browserSpecWeights, chromiumLaneEnvironment, taskCommands, taskFixtureImages } from '../ci/verification-tasks'

const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(cwd => rmSync(cwd, { recursive: true, force: true })))

const root = join(import.meta.dirname, '../..')
const chromiumTasks = ['chromium-1', 'chromium-2', 'chromium-3', 'chromium-4'] as const

function chromiumSuite(cwd: string): string[] {
  const found: string[] = []
  const visit = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) visit(path)
      else if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(name)) found.push(path.slice(cwd.length + 1).split('\\').join('/'))
    }
  }
  visit(join(cwd, 'e2e-tests'))
  return found.sort()
}

function plannedSpecs(cwd: string, id: string): string[] {
  const commands = taskCommands(cwd, id)
  return commands.flatMap(command => command.args.slice(1))
}

describe('complete catalog chromium tasks', () => {
  it('assigns every Chromium spec exactly once with balanced measured time and repeatable membership', () => {
    const suite = chromiumSuite(root)
    const first = chromiumTasks.map(id => plannedSpecs(root, id))
    expect(chromiumTasks.map(id => plannedSpecs(root, id))).toEqual(first)
    expect(first.flat().sort()).toEqual(suite)
    expect(chromiumTasks.every(id => taskCommands(root, id)[0].args[0] === 'verify:parallel')).toBe(true)
    // Longest-first packing keeps the spread below the heaviest single spec file.
    const weights = browserSpecWeights(), values = Object.values(weights).sort((a, b) => a - b)
    const median = values[Math.floor(values.length / 2)]
    const totals = first.map(files => files.reduce((sum, file) => sum + (weights[file] ?? median), 0))
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(Math.max(...values))
    // The table measures the current suite; a stale table would silently unbalance the tasks.
    expect(suite.filter(file => weights[file] === undefined)).toEqual([])
    expect(FULL_TASK_IDS).toEqual([
      'quality', 'fast', 'slow', 'build',
      'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit',
    ])
    expect(taskCommands(root, 'browser-sandbox')).toEqual([{ command: 'pnpm', args: ['run', 'verify:e2e:browser-sandbox'] }])
    expect(taskCommands(root, 'webkit')).toEqual([{ command: 'pnpm', args: ['run', 'verify:e2e:webkit'] }])
  })

  it('discovers and assigns new files without separate scheduling metadata (they weigh the median)', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'chromium-counts-'))
    temporary.push(cwd)
    mkdirSync(join(cwd, 'e2e-tests'), { recursive: true })
    for (const name of ['e', 'c', 'a', 'd', 'b']) writeFileSync(join(cwd, 'e2e-tests', `${name}.spec.ts`), '// spec\n')
    expect(chromiumTasks.map(id => taskCommands(cwd, id))).toEqual([
      [{ command: 'pnpm', args: ['verify:parallel', 'e2e-tests/a.spec.ts', 'e2e-tests/e.spec.ts'] }],
      [{ command: 'pnpm', args: ['verify:parallel', 'e2e-tests/b.spec.ts'] }],
      [{ command: 'pnpm', args: ['verify:parallel', 'e2e-tests/c.spec.ts'] }],
      [{ command: 'pnpm', args: ['verify:parallel', 'e2e-tests/d.spec.ts'] }],
    ])
    writeFileSync(join(cwd, 'e2e-tests/f.spec.ts'), '// new spec\n')
    expect(chromiumTasks.map(id => plannedSpecs(cwd, id))).toEqual([
      ['e2e-tests/a.spec.ts', 'e2e-tests/e.spec.ts'],
      ['e2e-tests/b.spec.ts', 'e2e-tests/f.spec.ts'],
      ['e2e-tests/c.spec.ts'],
      ['e2e-tests/d.spec.ts'],
    ])
  })
})

describe('GitHub chromium task environment', () => {
  it('pulls the dashboard images only for the chromium task that runs the dashboard spec', () => {
    const dashboard = TASK_FIXTURE_IMAGES.filter(({ file }) => file === 'e2e-tests/operations-dashboard.spec.ts').map(({ image }) => image)
    expect(dashboard).toHaveLength(2)
    const pulls = chromiumTasks.map(id => taskFixtureImages(root, id))
    expect(pulls.filter(images => images.length)).toEqual([dashboard])
    expect(chromiumTasks[pulls.findIndex(images => images.length)]).toBe(chromiumTasks.find(id => plannedSpecs(root, id).includes('e2e-tests/operations-dashboard.spec.ts')))
    for (const id of ['fast', 'webkit', 'browser-sandbox']) expect(taskFixtureImages(root, id)).toEqual([])
  })

  it('passes the runner lane count to chromium tasks only, outside the task command', () => {
    expect(chromiumLaneEnvironment('chromium-3', { VERIFY_PARALLEL_LANES: '2' })).toEqual({ VERIFY_PARALLEL_LANES: '2' })
    expect(chromiumLaneEnvironment('chromium-3', {})).toEqual({})
    expect(chromiumLaneEnvironment('webkit', { VERIFY_PARALLEL_LANES: '2' })).toEqual({})
    expect(() => chromiumLaneEnvironment('chromium-9', {})).toThrow()
    for (const file of ['candidate-verification.yml', 'prerelease-candidate-verification.yml']) {
      const workflow = readFileSync(join(root, '.github/workflows', file), 'utf8')
      const execute = workflow.slice(workflow.indexOf('- name: Execute verification task'))
      expect(execute.slice(0, execute.indexOf('run:')), file).toContain("VERIFY_PARALLEL_LANES: '2'")
      const pull = workflow.indexOf('- name: Pull task fixture images')
      expect(pull, file).toBeGreaterThan(workflow.indexOf('- name: Install browsers'))
      expect(pull, file).toBeLessThan(workflow.indexOf('- name: Execute verification task'))
      expect(workflow.slice(pull, workflow.indexOf('- name: Execute verification task')), file)
        .toMatch(/if: startsWith\(matrix\.task, 'chromium-'\)[\s\S]*candidate-verification\.ts pull-fixture-images "\$VERIFICATION_TASK"/)
    }
  })
})
