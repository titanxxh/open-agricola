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

const ALLOW_LIST_PATTERNS = [
  /^CHANGELOG\.md$/,
  /^docs\/superpowers\/specs\/.*\.md$/,
  /^docs\/superpowers\/plans\/.*\.md$/,
  /^scripts\/check-no-dsl\.ts$/,
  /^scripts\/__tests__\/check-no-dsl\.test\.ts$/,
  /^scripts\/__tests__\/fixtures\/dsl-samples\//,
  // PR-2: one-shot migration script (keeps legacy DSL types/column names so it
  // can read old `effect_dsl` rows and convert them to TS code). The script is
  // kept for historical data recovery but no new code should reference DSL.
  /^scripts\/migrate-dsl-to-code\.ts$/,
  /^scripts\/__tests__\/migrate-dsl-to-code\.test\.ts$/,
  // PR-2: db.ts keeps the `effect_dsl` column in migration SQL so existing
  // SQLite files still match the schema. Column is @deprecated and never
  // written to. The workshop-api test recreates the same legacy schema.
  /^server\/db\.ts$/,
  /^server\/__tests__\/workshop-api\.test\.ts$/,
]

const SCAN_DIRS = ['shared', 'server', 'src', 'scripts']
const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__stubs__'])

export type DslHit = { file: string; line: number; keyword: string; text: string }

function walkDir(dir: string, repoRoot: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    const rel = path.relative(repoRoot, full)
    if (ALLOW_LIST_PATTERNS.some((rx) => rx.test(rel))) continue
    if (entry.isDirectory()) {
      walkDir(full, repoRoot, out)
    } else if (SCAN_EXTS.has(path.extname(entry.name))) {
      out.push(full)
    }
  }
  return out
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
  const allFiles: string[] = []
  for (const dir of SCAN_DIRS) {
    const full = path.join(repoRoot, dir)
    if (fs.existsSync(full)) walkDir(full, repoRoot, allFiles)
  }
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
