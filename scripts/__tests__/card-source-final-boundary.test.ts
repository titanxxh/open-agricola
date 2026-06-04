import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const scannedRoots = ['shared', 'server', 'client', 'scripts']
const productionFilePattern = /\.(ts|tsx)$/

const isProductionFile = (filePath: string): boolean => {
  const rel = path.relative(repoRoot, filePath).split(path.sep).join('/')
  return productionFilePattern.test(rel)
    && !rel.includes('/__tests__/')
    && !rel.includes('/fixtures/')
    && !rel.endsWith('.test.ts')
    && !rel.endsWith('.spec.ts')
}

const walk = (dir: string): string[] => {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (isProductionFile(full)) out.push(full)
  }
  return out
}

const productionFiles = () =>
  scannedRoots.flatMap((root) => walk(path.join(repoRoot, root)))

describe('final Card Source boundaries', () => {
  it('removes the legacy display directory', () => {
    expect(fs.existsSync(path.join(repoRoot, 'shared', 'cards-display'))).toBe(false)
  })

  it('keeps production code off legacy display and class catalogs', () => {
    const offenders = productionFiles().flatMap((file) => {
      const source = fs.readFileSync(file, 'utf8')
      const rel = path.relative(repoRoot, file).split(path.sep).join('/')
      const hits = [
        source.includes('cards-display') ? 'cards-display' : null,
        source.includes('auto-catalog') ? 'auto-catalog' : null,
        /\binstanceof\s+(MinorImprovement|Occupation|PlayerActionCard)\b/.test(source) ? 'instanceof-card-class' : null,
        /\bnew\s+(MinorImprovement|Occupation|PlayerActionCard)\b/.test(source) ? 'new-card-class' : null,
      ].filter((hit): hit is string => hit !== null)
      return hits.map((hit) => `${rel}: ${hit}`)
    })

    expect(offenders).toEqual([])
  })
})
