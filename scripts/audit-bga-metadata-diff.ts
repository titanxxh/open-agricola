#!/usr/bin/env tsx
/**
 * Compare card metadata between BGA (../bga-agricola) and our TS catalog.
 *
 * Usage:
 *   pnpm exec tsx scripts/audit-bga-metadata-diff.ts            # --report (default)
 *   pnpm exec tsx scripts/audit-bga-metadata-diff.ts --apply-safe
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBgaCard } from './bga-metadata/parse-bga'
import { parseTsCard } from './bga-metadata/parse-ts'
import { diffCards } from './bga-metadata/diff'
import { renderReport } from './bga-metadata/report'
import { resolveBgaRoot } from './bga-metadata/resolve-bga-root'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

function loadBga(bgaRoot: string) {
  const map = new Map<string, ReturnType<typeof parseBgaCard>>()
  for (const deck of ['A', 'B', 'C', 'D', 'E']) {
    const dir = path.join(bgaRoot, 'modules/php/Cards', deck)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.php')) continue
      const phpPath = path.join(dir, f)
      try {
        const card = parseBgaCard(phpPath)
        map.set(card.id, card)
      } catch (e) {
        console.warn(`Skipping unparseable BGA: ${f} (${e})`)
      }
    }
  }
  return map
}

function loadTs() {
  const map = new Map<string, ReturnType<typeof parseTsCard>>()
  for (const deck of ['A', 'B', 'C', 'D', 'E']) {
    const dir = path.join(REPO_ROOT, 'shared/cards-display', deck)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue
      const tsPath = path.join(dir, f)
      try {
        const card = parseTsCard(tsPath)
        map.set(card.id, card)
      } catch (e) {
        console.warn(`Skipping unparseable TS: ${f} (${e})`)
      }
    }
  }
  return map
}

function main() {
  const args = process.argv.slice(2)
  const applySafe = args.includes('--apply-safe')

  const bgaRoot = resolveBgaRoot()
  const bga = loadBga(bgaRoot)
  const ts = loadTs()
  const result = diffCards(bga, ts)

  if (applySafe) {
    console.error('--apply-safe not implemented yet (sprint metadata-2)')
    process.exitCode = 2
    return
  }

  const date = new Date().toISOString().slice(0, 10)
  const md = renderReport(result, date)
  const outPath = path.join(REPO_ROOT, 'docs/operations/bga-metadata-diff-report.md')
  fs.writeFileSync(outPath, md, 'utf8')
  console.log(`Wrote ${outPath}`)
  console.log(`⚠ literal: ${result.deviations.filter(d => d.verdict === 'warn').length}, ❌ complex: ${result.deviations.filter(d => d.verdict === 'error').length}, 🔍 single-sided: ${result.bgaOnly.length + result.tsOnly.length + result.bannedButPresent.length}`)
}

main()
