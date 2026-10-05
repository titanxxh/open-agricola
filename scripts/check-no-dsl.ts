#!/usr/bin/env tsx
/**
 * CI guard: ensure DSL path is completely removed.
 *
 * PR-1: warn-only (DSL still present, don't fail the build).
 * PR-2: flipped to strict — any DSL keyword fails CI.
 *
 * Usage:
 *   pnpm run check:no-dsl [--strict]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkSourceFiles } from './source-files'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DSL_KEYWORDS = [
  'effect_dsl',
  'effectDsl',
  'dslToCardEffect',
  'custom-dsl-runner',
  'CardDslEffects',
  'DslStep',
  'DslEffect',
  'DslCondition',
]

const DSL_EXCEPTIONS = new Map([
  ['scripts/check-no-dsl.ts', 'The guard defines forbidden tokens'],
  ['scripts/__tests__/check-no-dsl.test.ts', 'Regression tests exercise forbidden tokens'],
  ['scripts/__tests__/fixtures/dsl-samples/dirty.ts', 'Intentional failing fixture'],
])

const SCAN_DIRS = ['shared', 'server', 'client', 'replay-viewer', 'scripts', 'tests', 'e2e-tests']

export type DslHit = { file: string; line: number; keyword: string; text: string }

export function scanDslFiles(repoRoot: string): string[] {
  return SCAN_DIRS.flatMap(dir => walkSourceFiles(path.join(repoRoot, dir), /\.[cm]?[jt]sx?$|\.json$/))
    .filter(file => !DSL_EXCEPTIONS.has(path.relative(repoRoot, file)))
}

export function findDslHits(files: string[]): DslHit[] {
  const hits: DslHit[] = []
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      for (const kw of DSL_KEYWORDS) {
        if (line.includes(kw)) {
          hits.push({ file, line: idx + 1, keyword: kw, text: line.trim() })
        }
      }
    })
  }
  return hits
}

if (process.argv[1] && process.argv[1].endsWith('check-no-dsl.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const strict = process.argv.includes('--strict')
  for (const [file, reason] of DSL_EXCEPTIONS) {
    if (!reason || findDslHits([path.join(repoRoot, file)]).length === 0) throw new Error('stale DSL exception: ' + file)
  }
  const allFiles = scanDslFiles(repoRoot)
  const hits = findDslHits(allFiles)
  if (hits.length === 0) {
    console.log('[check-no-dsl] ✓ no DSL keywords found')
    process.exit(0)
  }
  const byKeyword: Record<string, number> = {}
  for (const h of hits) byKeyword[h.keyword] = (byKeyword[h.keyword] ?? 0) + 1
  console.warn(`[check-no-dsl] ${hits.length} hits across ${new Set(hits.map((h) => h.file)).size} files:`)
  for (const [kw, n] of Object.entries(byKeyword)) console.warn(`  ${kw}: ${n}`)
  if (strict) {
    console.error('[check-no-dsl] strict mode: failing build')
    for (const h of hits.slice(0, 20)) {
      console.error(`  ${path.relative(repoRoot, h.file)}:${h.line}  [${h.keyword}]  ${h.text}`)
    }
    process.exit(1)
  } else {
    console.warn('[check-no-dsl] warn mode (PR-1): DSL deletion scheduled for PR-2, not failing build')
    process.exit(0)
  }
}
