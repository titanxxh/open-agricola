import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAffectedVerification } from '../verify'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(cwd => rmSync(cwd, { recursive: true, force: true })))

const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const commit = (cwd: string, title: string) => {
  git(cwd, 'add', '.')
  git(cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', title)
}
const write = (cwd: string, file: string, content: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true })
  writeFileSync(join(cwd, file), content)
}

function unrelatedRepository(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'verify-affected-'))
  directories.push(cwd)
  git(cwd, 'init', '-q', '--template=', '-b', 'main')
  git(cwd, 'config', 'user.email', 'test@example.com')
  git(cwd, 'config', 'user.name', 'Verify Affected Test')
  writeFileSync(join(cwd, 'README.md'), 'main\n')
  commit(cwd, 'main')
  git(cwd, 'checkout', '--orphan', 'unrelated')
  writeFileSync(join(cwd, 'other.md'), 'other\n')
  commit(cwd, 'unrelated')
  git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  git(cwd, 'checkout', '-q', 'main')
  return cwd
}

function repository(): string {
  const cwd = mkdtempSync(join(tmpdir(), 'verify-affected-'))
  directories.push(cwd)
  git(cwd, 'init', '-q', '--template=', '-b', 'main')
  git(cwd, 'config', 'user.email', 'test@example.com')
  git(cwd, 'config', 'user.name', 'Verify Affected Test')
  for (const root of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) write(cwd, `${root}/.keep`, '')
  for (const file of [
    'shared/domain/example.ts', 'shared/domain/__tests__/example.test.ts',
    'client/components/Example.tsx', 'client/components/__tests__/Example.test.tsx',
    'server/__tests__/example.test.ts', 'scripts/__tests__/docs-budget.test.ts',
    'tests/example.test.ts', 'e2e-tests/example.spec.ts', 'replay-viewer/src/example.ts',
  ]) write(cwd, file, '// valid source\n')
  write(cwd, 'README.md', 'Baseline\n')
  write(cwd, '.gitignore', '*.log\noutput/\n')
  commit(cwd, 'baseline')
  git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
  return cwd
}

function changeLines(logs: string[]): string[] {
  return logs.filter(line => line.startsWith('[verify] change:')).sort()
}

describe('pnpm verify affected', () => {
  it('fails when the merge-base of HEAD and origin/main cannot be resolved and does not run tests', () => {
    const cwd = unrelatedRepository()
    const calls: string[][] = []
    expect(() => runAffectedVerification(cwd, ['affected'], (command, args) => {
      calls.push([command, ...args])
      return 0
    })).toThrow('Cannot resolve merge-base of HEAD and origin/main')
    expect(calls).toEqual([])
  })

  it('uses commits after the merge-base plus staged, unstaged, and unignored untracked files', () => {
    const cwd = repository()
    write(cwd, 'shared/domain/example.ts', 'export const committed = true\n')
    commit(cwd, 'change the domain')
    write(cwd, 'client/components/Example.tsx', 'export const staged = true\n')
    git(cwd, 'add', '--', 'client/components/Example.tsx')
    write(cwd, 'server/__tests__/example.test.ts', 'export const unstaged = true\n')
    write(cwd, 'notes.ts', 'export const note = 1\n')
    write(cwd, 'debug.log', 'ignored\n')
    const logs: string[] = []
    const spy = vi.spyOn(console, 'log').mockImplementation(line => { logs.push(String(line)) })
    try {
      runAffectedVerification(cwd, ['affected'], () => 0)
    } finally {
      spy.mockRestore()
    }
    expect(changeLines(logs)).toEqual([
      '[verify] change: A notes.ts',
      '[verify] change: M client/components/Example.tsx',
      '[verify] change: M server/__tests__/example.test.ts',
      '[verify] change: M shared/domain/example.ts',
    ])
  })

  it('runs the Vitest files selected for those changes', () => {
    const cwd = repository()
    write(cwd, 'shared/domain/example.ts', 'export const value = 1\n')
    write(cwd, 'shared/domain/__tests__/example.test.ts', "import { value } from '../example'\nexport const used = value\n")
    commit(cwd, 'link the domain test')
    git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    write(cwd, 'shared/domain/example.ts', 'export const value = 2\n')
    const calls: string[][] = []
    runAffectedVerification(cwd, ['affected'], (command, args) => {
      calls.push([command, ...args])
      return 0
    })
    expect(calls).toEqual([
      ['pnpm', 'run', 'build:cards-manifest'],
      ['pnpm', 'exec', 'vitest', 'run', '--project', 'fast-shared', 'shared/domain/__tests__/example.test.ts'],
    ])
  })

  it('prints the browser selection and runs it only when asked', () => {
    const cwd = repository()
    write(cwd, 'e2e-tests/example.spec.ts', '// @covers client/components\nexport const example = 1\n')
    write(cwd, 'e2e-tests/other.spec.ts', '// @covers replay-viewer/src\nexport const other = 1\n')
    write(cwd, 'e2e-tests/third.spec.ts', '// @covers scripts\nexport const third = 1\n')
    commit(cwd, 'declare browser coverage')
    git(cwd, 'update-ref', 'refs/remotes/origin/main', 'HEAD')
    write(cwd, 'client/components/Example.tsx', 'export const panel = true\n')
    const collect = (args: string[]) => {
      const logs: string[] = []
      const calls: string[][] = []
      const spy = vi.spyOn(console, 'log').mockImplementation(line => { logs.push(String(line)) })
      try {
        runAffectedVerification(cwd, args, (command, commandArgs) => {
          calls.push([command, ...commandArgs])
          return 0
        })
      } finally {
        spy.mockRestore()
      }
      return { logs, calls }
    }
    const printed = collect(['affected'])
    expect(printed.logs).toContain('[verify] browser: chromium e2e-tests/example.spec.ts')
    expect(printed.calls).toEqual([])
    const executed = collect(['affected', '--run-browser'])
    expect(executed.logs).toContain('[verify] browser: chromium e2e-tests/example.spec.ts')
    expect(executed.calls).toEqual([
      ['pnpm', 'verify', 'e2e-tests/example.spec.ts', '--browser=chromium'],
    ])
  })

  it('prints a full trigger and does not launch the complete catalog', () => {
    const cwd = repository()
    write(cwd, 'package.json', '{ "name": "fixture" }\n')
    const logs: string[] = []
    const calls: string[][] = []
    const spy = vi.spyOn(console, 'log').mockImplementation(line => { logs.push(String(line)) })
    try {
      runAffectedVerification(cwd, ['affected', '--run-browser'], (command, args) => {
        calls.push([command, ...args])
        return 0
      })
    } finally {
      spy.mockRestore()
    }
    expect(logs).toContain('[verify] full trigger: The complete catalog is selected by package.json')
    expect(logs).not.toContain('[verify] full trigger: The complete catalog is selected.')
    expect(calls).toEqual([])
  })
})
