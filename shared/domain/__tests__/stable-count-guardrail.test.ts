import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = process.cwd()
const scannedRoots = ['shared/cards', 'shared/domain']
const allowList = new Set(['shared/domain/stables.ts'])
const ignoredParts = new Set(['__tests__', 'node_modules', 'dist', 'coverage'])

const collectSourceFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const rel = relative(repoRoot, full)
    if (rel.split('/').some((part) => ignoredParts.has(part))) continue
    const stat = statSync(full)
    if (stat.isDirectory()) {
      out.push(...collectSourceFiles(full))
      continue
    }
    if (/\.test\.[cm]?tsx?$/.test(entry)) continue
    if (/\.[cm]?tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('stable count semantics guardrail', () => {
  it('does not read player.stableTiles.length directly outside the domain helper', () => {
    const offenders = scannedRoots
      .flatMap((root) => collectSourceFiles(join(repoRoot, root)))
      .map((file) => relative(repoRoot, file))
      .filter((rel) => !allowList.has(rel))
      .filter((rel) => readFileSync(join(repoRoot, rel), 'utf8').includes('stableTiles.length'))

    expect(offenders).toEqual([])
  })
})
