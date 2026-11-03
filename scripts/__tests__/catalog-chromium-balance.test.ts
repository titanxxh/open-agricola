import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FULL_TASK_IDS, taskCommands } from '../ci/verification-tasks'

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
  expect(commands).toEqual([{ command: 'pnpm', args: ['verify', ...commands[0].args.slice(1)] }])
  expect(commands[0].args.slice(1).every(file => file.startsWith('e2e-tests/') && /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file))).toBe(true)
  return commands[0].args.slice(1)
}

describe('complete catalog chromium tasks', () => {
  it('assigns every chromium spec to one task and repeats that assignment', () => {
    const suite = chromiumSuite(root)
    const first = chromiumTasks.map(id => plannedSpecs(root, id))
    const second = chromiumTasks.map(id => plannedSpecs(root, id))
    expect(second).toEqual(first)
    const assigned = first.flat()
    expect(assigned.slice().sort()).toEqual(suite)
    expect(new Set(assigned).size).toBe(assigned.length)
    expect(FULL_TASK_IDS).toEqual([
      'quality', 'fast', 'slow', 'build',
      'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit',
    ])
    expect(taskCommands(root, 'browser-sandbox')).toEqual([{ command: 'pnpm', args: ['run', 'verify:e2e:browser-sandbox'] }])
    expect(taskCommands(root, 'webkit')).toEqual([{ command: 'pnpm', args: ['run', 'verify:e2e:webkit'] }])
  })

  it('does not assign the committed chromium suite by spec count', () => {
    const suite = chromiumSuite(root)
    const byCount = [0, 1, 2, 3].map(shard => suite.filter((_, index) => index % 4 === shard))
    expect(chromiumTasks.map(id => plannedSpecs(root, id))).not.toEqual(byCount)
  })

  it('keeps a slow spec out of the count slice that would share its task', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'chromium-balance-'))
    temporary.push(cwd)
    for (const name of ['a', 'b', 'c', 'd', 'e']) {
      mkdirSync(join(cwd, 'e2e-tests'), { recursive: true })
      writeFileSync(join(cwd, 'e2e-tests', `${name}.spec.ts`), '// spec\n')
    }
    mkdirSync(join(cwd, 'scripts/ci'), { recursive: true })
    writeFileSync(join(cwd, 'scripts/ci/verification-durations.json'), JSON.stringify({
      'e2e-tests/a.spec.ts': 1,
      'e2e-tests/b.spec.ts': 1,
      'e2e-tests/c.spec.ts': 1,
      'e2e-tests/d.spec.ts': 1,
      'e2e-tests/e.spec.ts': 100,
    }))
    expect(chromiumTasks.map(id => plannedSpecs(cwd, id))).toEqual([
      ['e2e-tests/e.spec.ts'],
      ['e2e-tests/a.spec.ts', 'e2e-tests/d.spec.ts'],
      ['e2e-tests/b.spec.ts'],
      ['e2e-tests/c.spec.ts'],
    ])
  })

  it('packs an unmeasured spec as the median of the measured specs', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'chromium-median-'))
    temporary.push(cwd)
    mkdirSync(join(cwd, 'e2e-tests'), { recursive: true })
    for (const name of ['p', 'q', 'r', 'u']) writeFileSync(join(cwd, 'e2e-tests', `${name}.spec.ts`), '// spec\n')
    mkdirSync(join(cwd, 'scripts/ci'), { recursive: true })
    writeFileSync(join(cwd, 'scripts/ci/verification-durations.json'), JSON.stringify({
      'e2e-tests/p.spec.ts': 10,
      'e2e-tests/q.spec.ts': 30,
      'e2e-tests/r.spec.ts': 50,
      'e2e-tests/gone.spec.ts': 1000,
    }))
    expect(chromiumTasks.map(id => plannedSpecs(cwd, id))).toEqual([
      ['e2e-tests/r.spec.ts'],
      ['e2e-tests/q.spec.ts'],
      ['e2e-tests/u.spec.ts'],
      ['e2e-tests/p.spec.ts'],
    ])
  })

  it('packs an unmeasured spec as the mean of the two central measurements', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'chromium-even-median-'))
    temporary.push(cwd)
    mkdirSync(join(cwd, 'e2e-tests'), { recursive: true })
    for (const name of ['a', 'b', 'c', 'd', 'u']) writeFileSync(join(cwd, 'e2e-tests', `${name}.spec.ts`), '// spec\n')
    mkdirSync(join(cwd, 'scripts/ci'), { recursive: true })
    writeFileSync(join(cwd, 'scripts/ci/verification-durations.json'), JSON.stringify({
      'e2e-tests/a.spec.ts': 10,
      'e2e-tests/b.spec.ts': 50,
      'e2e-tests/c.spec.ts': 30,
      'e2e-tests/d.spec.ts': 100,
    }))
    expect(chromiumTasks.map(id => plannedSpecs(cwd, id))).toEqual([
      ['e2e-tests/d.spec.ts'],
      ['e2e-tests/b.spec.ts'],
      ['e2e-tests/u.spec.ts'],
      ['e2e-tests/a.spec.ts', 'e2e-tests/c.spec.ts'],
    ])
  })
})
