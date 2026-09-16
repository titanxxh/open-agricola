import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import { dependencyCycles, readDependencies } from '../check-dependencies'
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

  it('restricts worker permissions to exact files and allows erased contracts', () => {
    expect(importViolation('client/local-sandbox/worker-core.ts', 'shared/session/session-core.ts', '')).toBeNull()
    expect(importViolation('client/local-sandbox/other.ts', 'shared/session/session-core.ts', '')).toBeTruthy()
    expect(importViolation('shared/contract/types.ts', 'shared/parents/index.ts', '', true)).toBeNull()
    expect(importViolation('shared/contract/types.ts', 'shared/parents/index.ts', '')).toBeTruthy()
  })
})
