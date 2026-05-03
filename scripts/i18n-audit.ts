#!/usr/bin/env tsx
/**
 * i18n audit: scan static i18n key references in source code, diff against
 * shared/i18n/{zh,en}.ts, report missing keys.
 *
 * Usage:
 *   pnpm exec tsx scripts/i18n-audit.ts            # default: print report + exit non-zero on missing
 *   pnpm exec tsx scripts/i18n-audit.ts --json     # write output/tmp/i18n-{missing,dynamic-keys}.json
 *   pnpm exec tsx scripts/i18n-audit.ts --no-fail  # always exit 0 (for diagnostic)
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { glob } from 'glob'
import { extractReferencesFromFiles, type StaticRef, type DynamicRef } from './i18n/extract-references'
import { flattenDictionary } from './i18n/flatten-dictionary'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

const SCAN_GLOBS = [
  'shared/**/*.ts',
  'shared/**/*.tsx',
  'server/**/*.ts',
  'src/**/*.ts',
  'src/**/*.tsx',
  'client/**/*.ts',
  'client/**/*.tsx',
]

const EXCLUDE_PATTERNS = [
  /\/__tests__\//,
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /\/e2e-tests\//,
  /\/tests\//,
  /\/node_modules\//,
]

export interface MissingKey {
  key: string
  locales: ('zh' | 'en')[]
  referencedAt: string[]
}

export interface AuditResult {
  missing: MissingKey[]
  dynamic: DynamicRef[]
}

export function computeAuditResult(
  refs: StaticRef[],
  flatZh: Map<string, string>,
  flatEn: Map<string, string>,
): AuditResult {
  const grouped = new Map<string, string[]>()
  for (const r of refs) {
    const arr = grouped.get(r.key) ?? []
    arr.push(`${r.file}:${r.line}`)
    grouped.set(r.key, arr)
  }
  const missing: MissingKey[] = []
  for (const [key, refList] of grouped) {
    const locales: ('zh' | 'en')[] = []
    if (!flatZh.has(key)) locales.push('zh')
    if (!flatEn.has(key)) locales.push('en')
    if (locales.length > 0) {
      missing.push({ key, locales: locales.sort(), referencedAt: refList })
    }
  }
  missing.sort((a, b) => a.key.localeCompare(b.key))
  return { missing, dynamic: [] }
}

async function loadDictionary(file: string): Promise<Record<string, unknown>> {
  const url = `file://${path.resolve(REPO_ROOT, file)}`
  const mod = (await import(url)) as Record<string, unknown>
  return Object.values(mod).find((v) => typeof v === 'object' && v !== null) as Record<string, unknown>
}

async function main() {
  const args = process.argv.slice(2)
  const writeJson = args.includes('--json')
  const noFail = args.includes('--no-fail')

  const files = (
    await Promise.all(
      SCAN_GLOBS.map((g) =>
        glob(g, { cwd: REPO_ROOT, absolute: true, nodir: true }),
      ),
    )
  ).flat().filter((f) => !EXCLUDE_PATTERNS.some((p) => p.test(f)))

  const refs = extractReferencesFromFiles(files)
  const zh = await loadDictionary('shared/i18n/zh.ts')
  const en = await loadDictionary('shared/i18n/en.ts')
  const flatZh = flattenDictionary(zh)
  const flatEn = flattenDictionary(en)

  const result = computeAuditResult(refs.static, flatZh, flatEn)
  result.dynamic = refs.dynamic

  console.log(`i18n audit: ${refs.static.length} static refs, ${refs.dynamic.length} dynamic refs`)
  console.log(`zh dict: ${flatZh.size} keys; en dict: ${flatEn.size} keys`)
  console.log(`missing: ${result.missing.length}`)

  if (writeJson) {
    const outDir = path.resolve(REPO_ROOT, 'output/tmp')
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(
      path.join(outDir, 'i18n-missing.json'),
      JSON.stringify(result.missing, null, 2),
    )
    fs.writeFileSync(
      path.join(outDir, 'i18n-dynamic-keys.json'),
      JSON.stringify(result.dynamic, null, 2),
    )
    console.log(`wrote output/tmp/i18n-{missing,dynamic-keys}.json`)
  } else if (result.missing.length > 0) {
    console.log('\nMissing keys:')
    for (const m of result.missing.slice(0, 50)) {
      console.log(`  ${m.key}  [${m.locales.join(', ')}]  (${m.referencedAt[0]})`)
    }
    if (result.missing.length > 50) console.log(`  ... and ${result.missing.length - 50} more`)
  }

  if (result.missing.length > 0 && !noFail) process.exit(1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(2)
  })
}
