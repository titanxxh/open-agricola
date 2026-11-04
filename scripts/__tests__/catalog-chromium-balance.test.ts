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
  return commands.flatMap(command => command.args.slice(1))
}

describe('complete catalog chromium tasks', () => {
  it('assigns every Chromium spec exactly once with balanced counts and repeatable membership', () => {
    const suite = chromiumSuite(root)
    const first = chromiumTasks.map(id => plannedSpecs(root, id))
    expect(chromiumTasks.map(id => plannedSpecs(root, id))).toEqual(first)
    expect(first.flat().sort()).toEqual(suite)
    const counts = first.map(files => files.length)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
    expect(FULL_TASK_IDS).toEqual([
      'quality', 'fast', 'slow', 'build',
      'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit',
    ])
    expect(taskCommands(root, 'browser-sandbox')).toEqual([{ command: 'pnpm', args: ['run', 'verify:e2e:browser-sandbox'] }])
    expect(taskCommands(root, 'webkit')).toEqual([{ command: 'pnpm', args: ['run', 'verify:e2e:webkit'] }])
  })

  it('discovers and assigns new files without separate scheduling metadata', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'chromium-counts-'))
    temporary.push(cwd)
    mkdirSync(join(cwd, 'e2e-tests'), { recursive: true })
    for (const name of ['e', 'c', 'a', 'd', 'b']) writeFileSync(join(cwd, 'e2e-tests', `${name}.spec.ts`), '// spec\n')
    expect(chromiumTasks.map(id => taskCommands(cwd, id))).toEqual([
      [{ command: 'pnpm', args: ['verify', 'e2e-tests/a.spec.ts', 'e2e-tests/e.spec.ts'] }],
      [{ command: 'pnpm', args: ['verify', 'e2e-tests/b.spec.ts'] }],
      [{ command: 'pnpm', args: ['verify', 'e2e-tests/c.spec.ts'] }],
      [{ command: 'pnpm', args: ['verify', 'e2e-tests/d.spec.ts'] }],
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
