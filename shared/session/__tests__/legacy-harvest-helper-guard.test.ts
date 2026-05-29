import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = process.cwd()
const productionRoots = ['shared', 'server', 'client']
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
    if (/\.[cm]?tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('legacy harvest helper guard', () => {
  it('does not expose or import the legacy performHarvest path in production code', () => {
    expect(existsSync(join(repoRoot, 'shared/session/round.ts'))).toBe(false)

    const offenders = productionRoots
      .flatMap((root) => collectSourceFiles(join(repoRoot, root)))
      .filter((file) => {
        const text = readFileSync(file, 'utf8')
        return text.includes('performHarvest') || text.includes('session/round')
      })
      .map((file) => relative(repoRoot, file))

    expect(offenders).toEqual([])
  })
})
