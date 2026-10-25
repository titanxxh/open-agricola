#!/usr/bin/env tsx
/**
 * i18n audit: scan static i18n key references in source code, diff against
 * the pinned external language packages, report missing keys.
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
  'replay-viewer/src/**/*.ts',
  'replay-viewer/src/**/*.tsx',
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
  locales: string[]
  referencedAt: string[]
}

export interface AuditResult {
  missing: MissingKey[]
  dynamic: DynamicRef[]
}

export function computeAuditResult(
  refs: StaticRef[],
  dictionaries: ReadonlyMap<string, ReadonlyMap<string, string>>,
): AuditResult {
  const grouped = new Map<string, string[]>()
  for (const r of refs) {
    const arr = grouped.get(r.key) ?? []
    arr.push(`${r.file}:${r.line}`)
    grouped.set(r.key, arr)
  }
  const missing: MissingKey[] = []
  for (const [key, refList] of grouped) {
    const locales = [...dictionaries].filter(([, messages]) => !messages.has(key)).map(([locale]) => locale)
    if (locales.length > 0) {
      missing.push({ key, locales: locales.sort(), referencedAt: refList })
    }
  }
  missing.sort((a, b) => a.key.localeCompare(b.key))
  return { missing, dynamic: [] }
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
  const manifest = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, 'public/i18n/manifest.json'), 'utf8')) as import('../shared/i18n').LanguageManifest
  const dictionaries = new Map(manifest.languages.map(language => {
    const pack = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, 'public/i18n', language.file), 'utf8')) as import('../shared/i18n').LanguagePack
    return [language.id, new Map(Object.entries(pack.messages))] as const
  }))
  const result = computeAuditResult(refs.static, dictionaries)
  result.dynamic = refs.dynamic

  console.log(`i18n audit: ${refs.static.length} static refs, ${refs.dynamic.length} dynamic refs`)
  console.log([...dictionaries].map(([locale, messages]) => `${locale}: ${messages.size} keys`).join('; '))
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
