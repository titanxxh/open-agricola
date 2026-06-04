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
import { applySafeFix, type SafeFix } from './bga-metadata/apply-safe'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

type BgaCard = ReturnType<typeof parseBgaCard>
type TsCard = ReturnType<typeof parseTsCard>

function pickCanonical(cards: BgaCard[], tsIds: Set<string>): BgaCard {
  if (cards.length === 1) return cards[0]
  // Priority 1: prefer a card whose id matches some TS card id
  const tsMatch = cards.find(c => tsIds.has(c.id))
  if (tsMatch) return tsMatch
  // Priority 2: prefer non-banned
  const nonBanned = cards.filter(c => !c.banned)
  if (nonBanned.length >= 1) return nonBanned[0]
  // Fallback: alphabetic-first id
  return [...cards].sort((a, b) => a.id.localeCompare(b.id))[0]
}

function loadBga(bgaRoot: string, tsIds: Set<string>) {
  // Stage 1: parse all PHP, group by deck+number
  const buckets = new Map<string, BgaCard[]>()
  for (const deck of ['A', 'B', 'C', 'D', 'E']) {
    const dir = path.join(bgaRoot, 'modules/php/Cards', deck)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.php')) continue
      const phpPath = path.join(dir, f)
      try {
        const card = parseBgaCard(phpPath)
        const key = `${card.deck}${card.number}`
        if (!buckets.has(key)) buckets.set(key, [])
        buckets.get(key)!.push(card)
      } catch (e) {
        console.warn(`Skipping unparseable BGA: ${f} (${e})`)
      }
    }
  }
  // Stage 2: pick canonical per bucket, key by deck+number
  const map = new Map<string, BgaCard>()
  for (const [key, cards] of buckets) {
    map.set(key, pickCanonical(cards, tsIds))
  }
  return map
}

function loadTs() {
  // Key by deck+number (e.g. 'A100') to align with loadBga canonical bucket key.
  const map = new Map<string, TsCard>()
  for (const deck of ['A', 'B', 'C', 'D', 'E']) {
    const dir = path.join(REPO_ROOT, 'shared/cards', deck)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue
      const tsPath = path.join(dir, f)
      try {
        const card = parseTsCard(tsPath)
        const key = `${card.deck}${card.number}`
        map.set(key, card)
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
  const ts = loadTs()
  // Build the set of TS card ids to drive canonical-pick when BGA has multiple
  // files for the same deck+number.
  const tsIds = new Set<string>()
  for (const card of ts.values()) tsIds.add(card.id)
  const bga = loadBga(bgaRoot, tsIds)
  const result = diffCards(bga, ts)

  if (applySafe) {
    const literalDevs = result.deviations.filter(d => d.verdict === 'warn')
    const complexCategoryDevs = result.deviations.filter(d => d.verdict === 'error' && d.field === 'category')
    const allFixDevs = [...literalDevs, ...complexCategoryDevs]
    let touched = 0
    for (const dev of allFixDevs) {
      const id = dev.id
      const deck = id[0]
      const tsPath = path.join(REPO_ROOT, 'shared/cards', deck, id + '.ts')
      if (!fs.existsSync(tsPath)) {
        console.warn(`Skip missing TS file: ${tsPath}`)
        continue
      }
      const before = fs.readFileSync(tsPath, 'utf8')
      const fixes: SafeFix[] = []
      if (dev.field === 'vp' && typeof dev.bga === 'number') fixes.push({ field: 'vp', target: dev.bga })
      if (dev.field === 'extraVp' && typeof dev.bga === 'boolean') fixes.push({ field: 'extraVp', target: dev.bga })
      if (dev.field === 'category' && typeof dev.bga === 'string') fixes.push({ field: 'category', target: dev.bga })
      if (!fixes.length) continue
      const after = applySafeFix(before, fixes)
      if (after !== before) {
        fs.writeFileSync(tsPath, after, 'utf8')
        touched++
      }
    }
    console.log(`Auto-fix touched ${touched} files (${literalDevs.length} literal + ${complexCategoryDevs.length} category)`)
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
