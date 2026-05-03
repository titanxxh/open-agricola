#!/usr/bin/env tsx
/**
 * Generate BGA clienttranslate coverage report. Read-only: produces
 * docs/i18n-bga-coverage-report.md.
 *
 * Usage:
 *   pnpm exec tsx scripts/i18n-bga-coverage.ts
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractClientTranslateFromBgaRoot } from './i18n/bga-clienttranslate'
import { flattenDictionary } from './i18n/flatten-dictionary'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

function resolveBgaRoot(): string {
  if (process.env.BGA_AGRICOLA_PATH) return process.env.BGA_AGRICOLA_PATH
  const candidates = [
    path.resolve(REPO_ROOT, '../bga-agricola'),
    path.resolve(REPO_ROOT, '../../bga-agricola'),
    path.resolve(REPO_ROOT, '../../../bga-agricola'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

const BGA_ROOT = resolveBgaRoot()

export interface GapEntry {
  raw: string
  count: number
  locations: string[]
}

export interface CoverageReport {
  bgaTotal: number
  ourCovered: number
  gap: GapEntry[]
}

export function computeCoverageReport(
  bgaUnique: Map<string, { count: number; locations: string[] }>,
  ourEnValues: Set<string>,
): CoverageReport {
  const gap: GapEntry[] = []
  let covered = 0
  for (const [raw, info] of bgaUnique) {
    if (ourEnValues.has(raw)) covered++
    else gap.push({ raw, count: info.count, locations: info.locations })
  }
  gap.sort((a, b) => b.count - a.count)
  return { bgaTotal: bgaUnique.size, ourCovered: covered, gap }
}

function renderReport(r: CoverageReport, unextractedCount: number): string {
  const lines: string[] = []
  lines.push('# BGA `clienttranslate` Coverage Report')
  lines.push('')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push('')
  lines.push('> **Note**: BGA strings are not 1:1 with our semantically-named i18n keys. Numbers below are reference only, not mandatory backlog.')
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- BGA unique strings (single-line literal extraction): **${r.bgaTotal}**`)
  lines.push(`- Covered by our \`shared/i18n/en.ts\` value set: **${r.ourCovered}**`)
  lines.push(`- Gap (BGA has, we don't): **${r.gap.length}**`)
  lines.push(`- Unextracted variants (multi-line / self::_ / nested): **${unextractedCount}** (not counted in totals above)`)
  lines.push('')
  lines.push('## Top 100 by frequency')
  lines.push('')
  lines.push('| count | string | sample location |')
  lines.push('|---|---|---|')
  for (const g of r.gap.slice(0, 100)) {
    const escaped = g.raw.replace(/\|/g, '\\|')
    lines.push(`| ${g.count} | ${escaped} | ${g.locations[0] ?? ''} |`)
  }
  lines.push('')
  lines.push('## Full gap (collapsed)')
  lines.push('')
  lines.push('<details>')
  lines.push(`<summary>${r.gap.length} entries</summary>`)
  lines.push('')
  for (const g of r.gap) {
    const escaped = g.raw.replace(/\|/g, '\\|')
    lines.push(`- (${g.count}) ${escaped}`)
  }
  lines.push('')
  lines.push('</details>')
  return lines.join('\n') + '\n'
}

async function main() {
  if (!fs.existsSync(BGA_ROOT)) {
    console.error(`bga-agricola/ not found at ${BGA_ROOT}`)
    process.exit(2)
  }
  const bga = extractClientTranslateFromBgaRoot(BGA_ROOT)
  const enUrl = `file://${path.resolve(REPO_ROOT, 'shared/i18n/en.ts')}`
  const enMod = (await import(enUrl)) as Record<string, unknown>
  const enDict = Object.values(enMod).find((v) => typeof v === 'object' && v !== null) as Record<string, unknown>
  const flatEn = flattenDictionary(enDict)
  const enValues = new Set(flatEn.values())

  const report = computeCoverageReport(bga.unique, enValues)
  const md = renderReport(report, bga.unextractedVariants.length)
  const outPath = path.resolve(REPO_ROOT, 'docs/i18n-bga-coverage-report.md')
  fs.writeFileSync(outPath, md, 'utf8')
  console.log(`wrote ${outPath}`)
  console.log(`bgaTotal=${report.bgaTotal} ourCovered=${report.ourCovered} gap=${report.gap.length}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(2)
  })
}
