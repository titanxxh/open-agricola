import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import { dependencyCycles, readDependencies, unclassifiedSourceRoots } from '../check-dependencies'
import { importViolation } from '../architecture-policy.mjs'

const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })))
const fixture = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-'))
  roots.push(root)
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), text)
  }
  return root
}

describe('resolved architecture dependencies', () => {
  it.each([
    ['shared/cards/A/Probe.ts', '../../../../../server/index.ts'],
    ['shared/actions/effects/Probe.ts', '../../../server/index.ts'],
    ['shared/domain/Probe.ts', '../../server/index.ts'],
    ['shared/domain/Probe.ts', 'node:fs'],
    ['shared/utils/Probe.ts', '../session/session-core.ts'],
    ['shared/contract/Probe.ts', '../parents/index.ts'],
    ['client/Probe.ts', '../shared/cards/M/M084_BogPony.ts'],
    ['server/Probe.ts', '../client/main.tsx'],
  ])('rejects imports without config overrides: %s -> %s', async (file, target) => {
    const eslint = new ESLint({ cwd: path.resolve(import.meta.dirname, '../..') })
    const relativeTarget = file === 'shared/cards/A/Probe.ts' ? '../../../server/index.ts' : target
    for (const code of [
      `import * as forbidden from '${relativeTarget}'; void forbidden`,
      `void import('${relativeTarget}')`,
      `export * from '${relativeTarget}'`,
    ]) {
      const [result] = await eslint.lintText(code, { filePath: file })
      expect(result.messages.some(message => message.ruleId === 'architecture/imports'), code).toBe(true)
    }
  })

  it('distinguishes erased edges, re-exports and dynamic cycles', () => {
    const root = fixture({
      'a.ts': "import type { B } from './b'; export const a = 1",
      'b.ts': "export { a } from './a'; export type B = number",
    })
    let graph = readDependencies(root, ['.'])
    expect(graph.edges.filter(edge => edge.typeOnly)).toHaveLength(1)
    expect(dependencyCycles(graph.edges)).toEqual([])
    fs.writeFileSync(path.join(root, 'a.ts'), "import { type B } from './b'; export const a = 1")
    expect(dependencyCycles(readDependencies(root, ['.']).edges)).toEqual([['a.ts', 'b.ts']])
    fs.writeFileSync(path.join(root, 'a.ts'), "void import('./b'); export const a = 1")
    graph = readDependencies(root, ['.'])
    expect(dependencyCycles(graph.edges)).toEqual([['a.ts', 'b.ts']])
  })

  it('fails on missing roots, malformed sources and unresolved or unknown imports', () => {
    const root = fixture({ 'a.ts': 'export const a = 1' })
    expect(() => readDependencies(root)).toThrow()
    fs.writeFileSync(path.join(root, 'a.ts'), 'export const =')
    expect(() => readDependencies(root, ['.'])).toThrow()
    fs.writeFileSync(path.join(root, 'a.ts'), "void import('./missing'); void import(target); void import('unresolved-alias/session')")
    expect(readDependencies(root, ['.']).errors).toHaveLength(3)
    fs.writeFileSync(path.join(root, 'a.ts'), 'export const a = 1')
    fs.symlinkSync(path.join(root, 'hidden'), path.join(root, 'linked-source'))
    expect(() => readDependencies(root, ['.'])).toThrow('source symlink')
  })

  it.each(['shared/fixtures/b.ts', 'shared/b.test.ts', 'scripts/b.ts'])('rejects production imports outside the scanned graph: %s', target => {
    const root = fixture({
      'shared/a.ts': "import '../" + target + "'",
      [target]: "import '../shared/a'",
    })
    expect(readDependencies(root, ['shared']).errors).toContain('shared/a.ts: runtime dependency outside scan scope: ' + target)
  })

  it('rejects unknown worker entry points', () => {
    const root = fixture({
      'client/probe.ts': "new Worker(new URL('./other.ts', import.meta.url)); new Worker(location)",
    })
    expect(readDependencies(root, ['client']).errors).toEqual([
      'client/probe.ts: unknown worker entry client/other.ts',
      'client/probe.ts: uncheckable worker entry',
    ])
  })

  it.each(['Worker', 'window.Worker', 'globalThis.SharedWorker', 'WorkerAlias'])('rejects unregistered module URLs through %s', constructor => {
    const root = fixture({ 'client/probe.ts': "new " + constructor + "(new URL('./other.ts', import.meta.url))" })
    expect(readDependencies(root, ['client']).errors).toContain('client/probe.ts: unknown worker entry client/other.ts')
  })

  describe('unclassified source roots', () => {
    const gitFixture = (files: Record<string, string>) => {
      const root = fixture(files)
      execFileSync('git', ['init', '-q'], { cwd: root })
      return root
    }

    it('ignores top-level directories excluded by .gitignore or .git/info/exclude', () => {
      const root = gitFixture({
        '.gitignore': 'tooling/\n',
        '.scratch/a.ts': 'export const a = 1',
        'tooling/b.ts': 'export const b = 1',
        'shared/c.ts': 'export const c = 1',
      })
      fs.appendFileSync(path.join(root, '.git/info/exclude'), '.scratch/\n')
      expect(unclassifiedSourceRoots(root)).toEqual([])
    })

    it('still reports directories that git does not ignore', () => {
      const root = gitFixture({
        '.gitignore': 'tooling/\n',
        'tooling/b.ts': 'export const b = 1',
        'extra/c.ts': 'export const c = 1',
        'tracked/d.ts': 'export const d = 1',
        'empty/readme.md': 'no sources here',
      })
      execFileSync('git', ['add', 'tracked/d.ts'], { cwd: root })
      expect(unclassifiedSourceRoots(root)).toEqual(['extra', 'tracked'])
    })

    it('keeps a tracked directory even when a later ignore rule matches it', () => {
      const root = gitFixture({ 'tracked/d.ts': 'export const d = 1' })
      execFileSync('git', ['add', 'tracked/d.ts'], { cwd: root })
      fs.writeFileSync(path.join(root, '.gitignore'), 'tracked/\n')
      expect(unclassifiedSourceRoots(root)).toEqual(['tracked'])
    })

    it('falls back to the plain directory scan outside a git checkout', () => {
      const root = fixture({ '.scratch/a.ts': 'export const a = 1', 'extra/c.ts': 'export const c = 1' })
      expect(unclassifiedSourceRoots(root)).toEqual(['.scratch', 'extra'])
    })

    it('feeds the same classification into readDependencies', () => {
      const root = gitFixture({
        'shared/a.ts': 'export const a = 1',
        'server/index.ts': 'export const s = 1',
        'client/main.ts': 'export const c = 1',
        'replay-viewer/src/main.ts': 'export const r = 1',
        '.scratch/probe.ts': 'export const p = 1',
        'extra/probe.ts': 'export const e = 1',
      })
      fs.appendFileSync(path.join(root, '.git/info/exclude'), '.scratch/\n')
      const { errors } = readDependencies(root)
      expect(errors).toContain('unclassified source root: extra')
      expect(errors).not.toContain('unclassified source root: .scratch')
    })
  })

  it('restricts worker permissions to exact files and allows erased contracts', () => {
    expect(importViolation('client/local-sandbox/worker-core.ts', 'shared/session/session-core.ts', '')).toBeNull()
    expect(importViolation('client/local-sandbox/other.ts', 'shared/session/session-core.ts', '')).toBeTruthy()
    expect(importViolation('shared/contract/types.ts', 'shared/parents/index.ts', '', true)).toBeNull()
    expect(importViolation('shared/contract/types.ts', 'shared/parents/index.ts', '')).toBeTruthy()
  })
})
