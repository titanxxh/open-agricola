import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '../../..')

const readSourceFiles = (dir: string): string[] => {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') return []
      return readSourceFiles(fullPath)
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return []
    return [fullPath]
  })
}

describe('engine node convergence surface', () => {
  it('has only the converged runtime node files', () => {
    const nodeDir = path.join(repoRoot, 'shared/engine/nodes')
    const nodeFiles = fs
      .readdirSync(nodeDir)
      .filter((name) => name.endsWith('.ts'))
      .sort()

    expect(nodeFiles).toEqual([
      'action-node.ts',
      'base.ts',
      'index.ts',
      'interaction-helpers.ts',
      'or-node.ts',
      'parallel-node.ts',
      'sequence-node.ts',
      'xor-node.ts',
    ])
  })

  it('has no production interaction-node dependencies', () => {
    const roots = [
      path.join(repoRoot, 'shared/engine'),
      path.join(repoRoot, 'shared/session'),
      path.join(repoRoot, 'shared/contract'),
      path.join(repoRoot, 'server'),
    ]
    const productionSource = roots
      .flatMap(readSourceFiles)
      .map((file) => ({
        file,
        source: fs.readFileSync(file, 'utf8'),
      }))

    const banned = [
      `Interaction${'Node'}`,
      `inject${'Interaction'}(`,
      `peek${'Interaction'}(`,
      `peek${'Interaction'}Host(`,
    ]
    for (const { file, source } of productionSource) {
      for (const token of banned) {
        expect(source, `${file} contains ${token}`).not.toContain(token)
      }
    }
  })
})
