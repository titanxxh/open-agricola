import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { assertPlanCurrent, createRepositoryPlan, formatPlanSummary } from '../ci/verification-plan'

const directories: string[] = []
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })))
const write = (cwd: string, file: string, content: string) => {
  mkdirSync(dirname(join(cwd, file)), { recursive: true })
  writeFileSync(join(cwd, file), content)
}
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
const commit = (cwd: string, title: string) => {
  git(cwd, 'add', '--', '.', ':(exclude)docs/superpowers/**')
  git(cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '-qm', title)
  return git(cwd, 'rev-parse', 'HEAD')
}
const repository = () => {
  const cwd = mkdtempSync(join(tmpdir(), 'verification-plan-'))
  directories.push(cwd)
  git(cwd, 'init', '-q', '--template=', '-b', 'main')
  git(cwd, 'config', 'user.email', 'test@example.com')
  git(cwd, 'config', 'user.name', 'Verification Plan Test')
  for (const root of ['shared', 'server', 'client', 'scripts', 'tests', 'e2e-tests', 'replay-viewer']) write(cwd, `${root}/.keep`, '')
  for (const file of [
    'shared/domain/example.ts', 'shared/domain/__tests__/example.test.ts',
    'client/components/Example.tsx', 'client/components/__tests__/Example.test.tsx',
    'server/__tests__/example.test.ts', 'scripts/__tests__/docs-budget.test.ts',
    'tests/example.test.ts', 'e2e-tests/example.spec.ts', 'replay-viewer/src/example.ts',
  ]) write(cwd, file, '// valid source\n')
  write(cwd, 'scripts/__tests__/docs-budget.test.ts', "import { readFileSync } from 'node:fs'\nreadFileSync('README.md')\n")
  write(cwd, 'README.md', Array.from({ length: 12 }, (_, index) => `Line ${index}`).join('\n') + '\n')
  write(cwd, '.gitignore', 'output/\n')
  const base = commit(cwd, 'baseline')
  git(cwd, 'checkout', '-qb', 'feature')
  return { cwd, base }
}

describe('repository verification scope', () => {
  it('uses the whole branch diff and retains additions, deletions, renames, and their test owners', () => {
    const { cwd, base } = repository()
    write(cwd, 'README.md', 'Earlier commit documentation\n')
    commit(cwd, 'first change')
    git(cwd, 'mv', 'client/components/Example.tsx', 'shared/domain/Moved.tsx')
    rmSync(join(cwd, 'server/__tests__/example.test.ts'))
    write(cwd, 'client/components/__tests__/Added.test.tsx', '// new test\n')
    const head = commit(cwd, 'second change')

    const plan = createRepositoryPlan({ cwd, base: 'main', fullTaskIds: ['quality', 'fast'] })

    expect(plan.identity).toMatchObject({ baseSha: base, mergeBaseSha: base, headSha: head, testedSha: head })
    expect(plan.changes).toEqual([
      { status: 'M', path: 'README.md' },
      { status: 'A', path: 'client/components/__tests__/Added.test.tsx' },
      { status: 'D', path: 'server/__tests__/example.test.ts' },
      { status: 'R', previousPath: 'client/components/Example.tsx', path: 'shared/domain/Moved.tsx' },
    ])
    expect(plan.inventory.vitest).toContainEqual({ file: 'client/components/__tests__/Added.test.tsx', project: 'fast-client' })
    expect(plan.inventory.vitest).not.toContainEqual({ file: 'server/__tests__/example.test.ts', project: 'fast-server' })
    expect(plan.inventory.browser).toEqual(['e2e-tests/example.spec.ts'])
  })

  it.each([
    { name: 'missing discovery root', mutate: (cwd: string) => rmSync(join(cwd, 'shared'), { recursive: true }), error: /Missing test discovery root: shared/ },
    { name: 'unclassified new test', mutate: (cwd: string) => write(cwd, 'unowned/new.test.ts', '// new test\n'), error: /exactly one project.*unowned\/new\.test\.ts/ },
  ])('fails scope computation on $name', ({ mutate, error }) => {
    const { cwd } = repository()
    mutate(cwd)
    expect(() => createRepositoryPlan({ cwd, base: 'main', fullTaskIds: ['quality', 'fast'] })).toThrow(error)
  })

  it('warns for an unparsable source file without selecting the complete catalog', () => {
    const { cwd } = repository()
    write(cwd, 'client/components/Example.tsx', 'export const =')
    const plan = createRepositoryPlan({ cwd, base: 'main', fullTaskIds: ['quality', 'fast', 'build'] })
    expect(plan.mode).toBe('scoped')
    expect(plan.wideningReasons.join('\n')).toContain('client/components/Example.tsx')
    expect(plan.checks.flatMap(check => check.kind === 'catalog' ? [check.taskId] : [])).toEqual(['quality', 'build'])
  })

  it('binds an existing plan to its source contents, refs, and actual checked-out commit', () => {
    const { cwd } = repository()
    write(cwd, 'README.md', 'Updated guide\n')
    commit(cwd, 'documentation')
    const plan = createRepositoryPlan({ cwd, base: 'main', fullTaskIds: ['quality', 'fast'] })
    expect(() => assertPlanCurrent(cwd, plan)).not.toThrow()

    write(cwd, 'client/components/Example.tsx', 'export const changed = true\n')
    expect(() => assertPlanCurrent(cwd, plan)).toThrow('Source contents changed')
    git(cwd, 'restore', '--', 'client/components/Example.tsx')
    git(cwd, 'branch', '-f', 'main', 'HEAD')
    expect(() => assertPlanCurrent(cwd, plan)).toThrow('Base reference changed')
    git(cwd, 'branch', '-f', 'main', plan.identity.baseSha)
    git(cwd, '-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'another commit')
    expect(() => assertPlanCurrent(cwd, plan)).toThrow('Checked-out commit changed')
  })

  it('includes tested-commit changes beyond a documentation-only requested head', () => {
    const { cwd } = repository()
    write(cwd, 'README.md', 'Updated guide\n')
    const requestedHead = commit(cwd, 'documentation')
    write(cwd, 'shared/domain/example.ts', 'export const changedRule = true\n')
    const tested = commit(cwd, 'actual tested rule change')

    const plan = createRepositoryPlan({ cwd, base: 'main', head: requestedHead, fullTaskIds: ['quality', 'fast'] })

    expect(plan.identity).toMatchObject({ headSha: requestedHead, testedSha: tested })
    expect(plan.changes).toContainEqual({ status: 'M', path: 'shared/domain/example.ts' })
    expect(plan.mode).toBe('scoped')
    expect(plan.checks.flatMap(check => check.kind === 'catalog' ? [check.taskId] : [])).toEqual(['quality'])
  })

  it('names the triggering paths in the full-catalog plan summary', () => {
    const { cwd } = repository()
    write(cwd, 'package.json', '{ "name": "fixture" }\n')
    write(cwd, '.github/workflows/ci.yml', 'name: CI\n')
    write(cwd, 'shared/domain/example.ts', 'export const also = true\n')
    commit(cwd, 'trigger the complete catalog')

    const plan = createRepositoryPlan({ cwd, base: 'main', fullTaskIds: ['quality', 'fast', 'build'] })
    const summary = formatPlanSummary(plan)

    expect(plan.mode).toBe('full')
    expect(plan.expansionReasons).toEqual([
      'The complete catalog is selected by .github/workflows/ci.yml',
      'The complete catalog is selected by package.json',
    ])
    expect(summary).toContain('The complete catalog is selected by .github/workflows/ci.yml')
    expect(summary).toContain('The complete catalog is selected by package.json')
    expect(summary).not.toContain('The complete catalog is selected.')
    expect(summary).not.toContain('shared/domain/example.ts')
  })

  it('runs the same planner through the CLI, writes a human summary, and replaces stale output on failure', () => {
    const { cwd } = repository()
    write(cwd, 'README.md', 'Updated guide\n')
    commit(cwd, 'documentation')
    const summary = join(cwd, 'output/summary.md')
    const cliArgs = [fileURLToPath(import.meta.resolve('tsx/cli')), resolve(import.meta.dirname, '../verification-plan.ts'), '--base', 'main', '--json', '--summary', summary]
    const success = spawnSync(process.execPath, cliArgs, { cwd, encoding: 'utf8', timeout: 15_000 })
    expect(success.status, success.stderr).toBe(0)
    const planned: unknown = JSON.parse(success.stdout)
    expect(planned).toMatchObject({ status: 'planned', mode: 'scoped', checks: [{ kind: 'vitest', project: 'fast-scripts', files: ['scripts/__tests__/docs-budget.test.ts'] }] })
    expect(readFileSync(summary, 'utf8')).toContain('scripts/__tests__/docs-budget.test.ts')
    expect(readFileSync(summary, 'utf8')).toContain('This plan is not verification evidence.')

    rmSync(join(cwd, 'shared'), { recursive: true })
    const failed = spawnSync(process.execPath, cliArgs, { cwd, encoding: 'utf8', timeout: 15_000 })
    expect(failed.status).toBe(1)
    const artifact: unknown = JSON.parse(readFileSync(join(cwd, 'output/verification/plan.json'), 'utf8'))
    expect(artifact).toMatchObject({ status: 'failed' })
    expect(artifact).not.toHaveProperty('checks')
    expect(readFileSync(summary, 'utf8')).toContain('Scope planning failed')
  }, 30_000)
})
