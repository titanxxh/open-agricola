#!/usr/bin/env tsx
/**
 * Read output/tmp/i18n-missing.json, call LLM to translate each key, optionally
 * write back to shared/i18n/{zh,en}.ts. Default is dry-run; pass --apply to
 * write. Use --keys=k1,k2 to filter.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MissingKey } from './i18n-audit'
import { translateBatch, type Translation } from './i18n/llm-translate'
import { writeI18nKeys } from './i18n/write-i18n-keys'
import { flattenDictionary } from './i18n/flatten-dictionary'
import { extractClientTranslateFromBgaRoot } from './i18n/bga-clienttranslate'

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

export function buildStyleSamples(
  missing: MissingKey[],
  flatZh: Map<string, string>,
  flatEn: Map<string, string>,
): Map<string, Array<{ key: string; zh: string; en: string }>> {
  const out = new Map<string, Array<{ key: string; zh: string; en: string }>>()
  for (const m of missing) {
    const parts = m.key.split('.')
    if (parts.length < 2) continue
    const suffix = parts[parts.length - 1]
    const head = parts[0]
    const pattern = `${head}.*.${suffix}`
    if (out.has(pattern)) continue
    const samples: Array<{ key: string; zh: string; en: string }> = []
    for (const [k, zhV] of flatZh) {
      const kp = k.split('.')
      if (kp.length === parts.length && kp[0] === head && kp[kp.length - 1] === suffix) {
        const enV = flatEn.get(k)
        if (enV !== undefined) samples.push({ key: k, zh: zhV, en: enV })
      }
    }
    out.set(pattern, samples.slice(0, 5))
  }
  return out
}

export function buildBgaCandidates(
  missing: MissingKey[],
  bgaUnique: Map<string, { count: number; locations: string[] }>,
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const m of missing) {
    const tokens = m.key
      .toLowerCase()
      .split(/[.\-_]/)
      .filter((t) => t.length >= 3 && !['name', 'desc', 'effect', 'actions', 'cards', 'ui'].includes(t))
    const candidates: Array<{ raw: string; score: number }> = []
    for (const [raw, info] of bgaUnique) {
      const lower = raw.toLowerCase()
      const score = tokens.filter((t) => lower.includes(t)).length + Math.min(info.count, 5) * 0.1
      if (score > 0) candidates.push({ raw, score })
    }
    candidates.sort((a, b) => b.score - a.score)
    out.set(m.key, candidates.slice(0, 3).map((c) => c.raw))
  }
  return out
}

function renderLog(missing: MissingKey[], translations: Map<string, Translation>): string {
  const lines: string[] = ['# i18n fill log', `Generated: ${new Date().toISOString()}`, '']
  for (const m of missing) {
    const t = translations.get(m.key)
    lines.push(`## ${m.key}`)
    lines.push(`- locales missing: ${m.locales.join(', ')}`)
    lines.push(`- referenced at: ${m.referencedAt.slice(0, 3).join(', ')}`)
    if (t) {
      lines.push(`- zh: ${t.zh}`)
      lines.push(`- en: ${t.en}`)
    } else {
      lines.push('- **NO TRANSLATION RETURNED**')
    }
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const keysArg = args.find((a) => a.startsWith('--keys='))
  const filterKeys = keysArg ? new Set(keysArg.slice('--keys='.length).split(',')) : null

  const missingPath = path.resolve(REPO_ROOT, 'output/tmp/i18n-missing.json')
  if (!fs.existsSync(missingPath)) {
    console.error(`${missingPath} not found. Run i18n-audit --json first.`)
    process.exit(2)
  }
  let missing = JSON.parse(fs.readFileSync(missingPath, 'utf8')) as MissingKey[]
  if (filterKeys) missing = missing.filter((m) => filterKeys.has(m.key))
  if (missing.length === 0) {
    console.log('No missing keys to translate.')
    return
  }

  const zhMod = (await import(`file://${path.resolve(REPO_ROOT, 'shared/i18n/zh.ts')}`)) as Record<string, unknown>
  const enMod = (await import(`file://${path.resolve(REPO_ROOT, 'shared/i18n/en.ts')}`)) as Record<string, unknown>
  const zhDict = Object.values(zhMod).find((v) => typeof v === 'object' && v !== null) as Record<string, unknown>
  const enDict = Object.values(enMod).find((v) => typeof v === 'object' && v !== null) as Record<string, unknown>
  const flatZh = flattenDictionary(zhDict)
  const flatEn = flattenDictionary(enDict)
  const styleSamples = buildStyleSamples(missing, flatZh, flatEn)

  let bgaUnique: Map<string, { count: number; locations: string[] }>
  if (fs.existsSync(BGA_ROOT)) {
    bgaUnique = extractClientTranslateFromBgaRoot(BGA_ROOT).unique
  } else {
    console.warn(`bga-agricola/ not found at ${BGA_ROOT}; proceeding without BGA candidates`)
    bgaUnique = new Map()
  }
  const bgaCandidates = buildBgaCandidates(missing, bgaUnique)

  console.log(`Translating ${missing.length} keys via Gemini...`)
  const translations = await translateBatch(missing, styleSamples, bgaCandidates)
  console.log(`Got ${translations.size} translations back.`)

  const logDir = path.resolve(REPO_ROOT, 'output/tmp')
  fs.mkdirSync(logDir, { recursive: true })
  fs.writeFileSync(
    path.join(logDir, 'i18n-fill-log.md'),
    renderLog(missing, translations),
    'utf8',
  )
  console.log('audit log -> output/tmp/i18n-fill-log.md')

  if (!apply) {
    console.log('DRY RUN — pass --apply to write to shared/i18n/{zh,en}.ts')
    return
  }

  const zhAdds = new Map<string, string>()
  const enAdds = new Map<string, string>()
  for (const m of missing) {
    const t = translations.get(m.key)
    if (!t) {
      console.warn(`No translation for ${m.key}`)
      continue
    }
    if (m.locales.includes('zh')) zhAdds.set(m.key, t.zh)
    if (m.locales.includes('en')) enAdds.set(m.key, t.en)
  }
  writeI18nKeys(path.resolve(REPO_ROOT, 'shared/i18n/zh.ts'), 'zh', zhAdds)
  writeI18nKeys(path.resolve(REPO_ROOT, 'shared/i18n/en.ts'), 'en', enAdds)
  console.log(`Wrote ${zhAdds.size} zh keys + ${enAdds.size} en keys.`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e)
    process.exit(2)
  })
}
