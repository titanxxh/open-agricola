/**
 * 卡牌实现 vs BGA 架构审查脚本（A 阶段机械信号扫描）。
 * 详见 docs/superpowers/specs/2026-04-28-card-impl-vs-bga-audit-design.md
 *
 * 用法：
 *   pnpm tsx scripts/audit-card-architecture.ts
 *   pnpm tsx scripts/audit-card-architecture.ts --strict   # 任一信号命中即 exit 1
 *
 * env：
 *   BGA_CARDS_DIR  默认 /data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards
 *   OUR_CARDS_DIR  默认 shared/cards
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface ParsedArgs {
  ourCardsDir: string
  bgaCardsDir: string
  outputPath: string
  strict: boolean
}

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): ParsedArgs {
  return {
    ourCardsDir: env.OUR_CARDS_DIR ?? 'shared/cards',
    bgaCardsDir: env.BGA_CARDS_DIR ?? '/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards',
    outputPath: 'output/tmp/audit-card-arch-2026-04-28.jsonl',
    strict: argv.includes('--strict'),
  }
}

export interface CardEntry {
  cardId: string
  filePath: string
  fileName: string
  deck: 'A' | 'B' | 'C' | 'D' | 'E'
}

export interface CardPair {
  cardId: string
  deck: 'A' | 'B' | 'C' | 'D' | 'E'
  ourPath: string
  bgaPath: string
}

export interface DiscoveryResult {
  both: CardPair[]
  oursOnly: CardEntry[]
  bgaOnly: CardEntry[]
}

const CARD_FILE_RE = /^([A-E])(\d+)_(\w+)\.(ts|php)$/

function listDeckCards(deckDir: string, ext: 'ts' | 'php'): CardEntry[] {
  if (!fs.existsSync(deckDir)) return []
  return fs.readdirSync(deckDir)
    .map(fileName => {
      const m = fileName.match(CARD_FILE_RE)
      if (!m || m[4] !== ext) return null
      const deck = m[1] as 'A' | 'B' | 'C' | 'D' | 'E'
      const num = m[2]
      return {
        cardId: `${deck}${num}`,
        filePath: path.join(deckDir, fileName),
        fileName,
        deck,
      }
    })
    .filter((e): e is CardEntry => e !== null)
}

export function discoverCardPairs(ourCardsDir: string, bgaCardsDir: string): DiscoveryResult {
  const decks = ['A', 'B', 'C', 'D', 'E'] as const
  const oursMap = new Map<string, CardEntry>()
  const bgaMap = new Map<string, CardEntry>()

  for (const deck of decks) {
    for (const e of listDeckCards(path.join(ourCardsDir, deck), 'ts')) {
      oursMap.set(e.cardId, e)
    }
    for (const e of listDeckCards(path.join(bgaCardsDir, deck), 'php')) {
      bgaMap.set(e.cardId, e)
    }
  }

  const both: CardPair[] = []
  const oursOnly: CardEntry[] = []
  const bgaOnly: CardEntry[] = []

  for (const [id, ours] of oursMap) {
    const bga = bgaMap.get(id)
    if (bga) {
      both.push({ cardId: id, deck: ours.deck, ourPath: ours.filePath, bgaPath: bga.filePath })
    } else {
      oursOnly.push(ours)
    }
  }
  for (const [id, bga] of bgaMap) {
    if (!oursMap.has(id)) bgaOnly.push(bga)
  }

  both.sort((a, b) => a.cardId.localeCompare(b.cardId))
  return { both, oursOnly, bgaOnly }
}

export interface CodeMention {
  file: string
  line: number
  snippet: string
}

export interface CrossLayerImport {
  from: string
  to: string
  line: number
}

export interface AggregateMutation {
  file: string
  line: number
  field: string
}

export interface I18nGap {
  key: string
  missingZh: boolean
  missingEn: boolean
  bgaHasButOurMissing: boolean
}

export interface CardSignals {
  S1_coreFileMentions: CodeMention[]
  S4_crossLayerImports: CrossLayerImport[]
  S5_aggregateMutations: AggregateMutation[]
  S6_lineRatio: number
  S7_externalCardIdMentions: CodeMention[]
  S10_shellLikelihood: 'none' | 'low' | 'high'
  S10_evidence: { hookCount: number; bgaHookCount: number; bodyLines: number }
  S11_descAlignment: 'aligned' | 'missing-i18n' | 'diff-from-bga'
  S12_i18nGapKeys: I18nGap[]
}

export interface CardAuditResult {
  cardId: string
  ourPath: string
  bgaPath: string
  ourLines: number
  bgaLines: number
  signals: CardSignals
  verdict: 'pending'
}

export function countLines(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf8')
  return content.split('\n').filter(l => l.trim().length > 0).length
}

export function computeLineRatio(ourLines: number, bgaLines: number): number {
  if (bgaLines === 0) return Infinity
  return ourLines / bgaLines
}

export interface ShellResult {
  likelihood: 'none' | 'low' | 'high'
  evidence: { hookCount: number; bgaHookCount: number; bodyLines: number }
}

const HOOK_PATTERNS_OURS = [
  /\bregisterCardListener\s*\(/g,
  /\bonBuy\s*[:=]/g,
  /\bcomputeBonusScore\s*[:=]/g,
  /\bcomputeReplace\s*[:=]/g,
  /\bcomputeArgs\s*[:=]/g,
  /\bcomputeCosts\s*[:=]/g,
  /\bonRoundStart\s*[:=]/g,
  /\bonAllWorkersPlaced\s*[:=]/g,
  /\bcomputeFenceDiscount\s*[:=]/g,
  /\bcomputeLockedFarmTiles\s*[:=]/g,
  /\bhandHooks\s*[:=]/g,
  /\bresolveChoice\s*[:=]/g,
]

const HOOK_PATTERNS_BGA = [
  /function\s+execute\s*\(/g,
  /function\s+\w+Hook\s*\(/g,
  /function\s+computeCost/gi,
  /function\s+onBuy/gi,
  /function\s+onRoundStart/gi,
  /function\s+onHarvest/gi,
  /function\s+isDoable/gi,
  /function\s+canUse/gi,
]

function countMatches(content: string, patterns: RegExp[]): number {
  return patterns.reduce((sum, re) => sum + (content.match(re)?.length ?? 0), 0)
}

export function detectShell(oursContent: string, bgaContent: string): ShellResult {
  const hookCount = countMatches(oursContent, HOOK_PATTERNS_OURS)
  const bgaHookCount = countMatches(bgaContent, HOOK_PATTERNS_BGA)
  const bodyLines = bgaContent.split('\n').filter(l => l.trim().length > 0).length

  let likelihood: ShellResult['likelihood'] = 'none'
  if (hookCount === 0 && bgaHookCount > 0) likelihood = 'high'
  else if (hookCount === 0 && bgaHookCount === 0) likelihood = 'low'
  else likelihood = 'none'

  return { likelihood, evidence: { hookCount, bgaHookCount, bodyLines } }
}

export const CORE_FILES = [
  'server/game-session.ts',
  'shared/actions/effects/pay.ts',
  'shared/actions/effects/improvement.ts',
  'shared/actions/effects/fencing.ts',
  'shared/logic/scoring.ts',
  'shared/engine/engine.ts',
  'shared/engine/action-flow.ts',
  'shared/session/game-core.ts',
]

export function scanCoreFilesForCardId(
  cardId: string,
  repoRoot: string,
  files: string[] = CORE_FILES,
): CodeMention[] {
  const hits: CodeMention[] = []
  const re = new RegExp(`\\b${cardId}(?:_\\w+)?\\b`)

  for (const rel of files) {
    const abs = path.join(repoRoot, rel)
    if (!fs.existsSync(abs)) continue
    const lines = fs.readFileSync(abs, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        hits.push({ file: rel, line: i + 1, snippet: lines[i].trim().slice(0, 200) })
      }
    }
  }
  return hits
}

const AGG_FIELDS = ['fields', 'fences', 'familySize', 'workers']

function buildMutationRegex(field: string): RegExp {
  return new RegExp(
    `\\bplayer\\.${field}\\s*(=[^=]|\\.push\\b|\\.pop\\b|\\.splice\\b|\\.shift\\b|\\.unshift\\b)`,
  )
}

export function scanAggregateMutations(filePath: string): AggregateMutation[] {
  if (!fs.existsSync(filePath)) return []
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  const hits: AggregateMutation[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    for (const field of AGG_FIELDS) {
      const re = buildMutationRegex(field)
      if (re.test(line)) {
        hits.push({ file: filePath, line: i + 1, field: `player.${field}` })
      }
    }
  }
  return hits
}

const FORBIDDEN_IMPORT_RE = /import\s+(?:.+\s+from\s+)?['"]([^'"]+)['"]/

export function scanCrossLayerImports(filePath: string): CrossLayerImport[] {
  if (!fs.existsSync(filePath)) return []
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  const hits: CrossLayerImport[] = []

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(FORBIDDEN_IMPORT_RE)
    if (!m) continue
    const importPath = m[1]
    if (/(?:^|\/)(server|client)\//.test(importPath)) {
      hits.push({ from: filePath, to: importPath, line: i + 1 })
    }
  }
  return hits
}

export function normalizeDesc(s: string): string {
  if (!s) return ''
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\\/g, '\\')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function extractOurDesc(content: string): string {
  const m = content.match(/\bdesc(?:ription)?\s*:\s*['"`]([^'"`]*)['"`]/)
  return m ? m[1] : ''
}

export function extractBgaDesc(content: string): string {
  const m = content.match(/\$this->desc\s*=\s*['"]([^'"]*)['"]/)
  return m ? m[1] : ''
}

export type DescAlignment = 'aligned' | 'missing-i18n' | 'diff-from-bga'

export function compareDesc(ours: string, bga: string): DescAlignment {
  const oN = normalizeDesc(ours)
  const bN = normalizeDesc(bga)
  if (oN === '' && bN !== '') return 'missing-i18n'
  if (oN === bN) return 'aligned'
  return 'diff-from-bga'
}

const I18N_KEY_RE = /['"`](actions\.[A-Z]\d+\.[\w.]+|ui\.interaction\w+|prompt\.\w+)['"`]/g

export function extractI18nKeys(content: string): string[] {
  const keys = new Set<string>()
  let m: RegExpExecArray | null
  I18N_KEY_RE.lastIndex = 0
  while ((m = I18N_KEY_RE.exec(content)) !== null) {
    keys.add(m[1])
  }
  return [...keys]
}

export function scanI18nGaps(
  usedKeys: string[],
  zhContent: string,
  enContent: string,
): I18nGap[] {
  return usedKeys.map(key => {
    const re = new RegExp(`['"\`]${key.replace(/\./g, '\\.')}['"\`]\\s*:`)
    return {
      key,
      missingZh: !re.test(zhContent),
      missingEn: !re.test(enContent),
      bgaHasButOurMissing: false,
    }
  })
}

export interface I18nCache {
  zh: string
  en: string
}

let _i18nCache: I18nCache | null = null
function getI18nCache(repoRoot: string): I18nCache {
  if (_i18nCache) return _i18nCache
  const zhPath = path.join(repoRoot, 'client', 'i18n', 'zh.ts')
  const enPath = path.join(repoRoot, 'client', 'i18n', 'en.ts')
  _i18nCache = {
    zh: fs.existsSync(zhPath) ? fs.readFileSync(zhPath, 'utf8') : '',
    en: fs.existsSync(enPath) ? fs.readFileSync(enPath, 'utf8') : '',
  }
  return _i18nCache
}

function* walkTsFiles(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (/(?:^|[\\/])shared[\\/]cards[\\/][A-E]$/.test(full)) continue
      if (entry.name === '__tests__') continue
      yield* walkTsFiles(full)
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      yield full
    }
  }
}

export function scanExternalCardIdMentions(cardId: string, repoRoot: string): CodeMention[] {
  const hits: CodeMention[] = []
  const re = new RegExp(`['"\`]${cardId}['"\`]|\\b${cardId}_\\w+\\b`)

  for (const file of walkTsFiles(path.join(repoRoot, 'shared'))) {
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        hits.push({
          file: path.relative(repoRoot, file),
          line: i + 1,
          snippet: lines[i].trim().slice(0, 200),
        })
      }
    }
  }
  return hits
}

export function scanCard(pair: CardPair, repoRoot: string = '.'): CardAuditResult {
  const oursContent = fs.readFileSync(pair.ourPath, 'utf8')
  const bgaContent = fs.readFileSync(pair.bgaPath, 'utf8')
  const ourLines = oursContent.split('\n').filter(l => l.trim().length > 0).length
  const bgaLines = bgaContent.split('\n').filter(l => l.trim().length > 0).length
  const shell = detectShell(oursContent, bgaContent)
  const ourDesc = extractOurDesc(oursContent)
  const bgaDesc = extractBgaDesc(bgaContent)
  const i18n = getI18nCache(repoRoot)
  const usedKeys = extractI18nKeys(oursContent)
  const gaps = scanI18nGaps(usedKeys, i18n.zh, i18n.en).filter(g => g.missingZh || g.missingEn)

  return {
    cardId: pair.cardId,
    ourPath: pair.ourPath,
    bgaPath: pair.bgaPath,
    ourLines,
    bgaLines,
    signals: {
      S1_coreFileMentions: scanCoreFilesForCardId(pair.cardId, repoRoot),
      S4_crossLayerImports: scanCrossLayerImports(pair.ourPath),
      S5_aggregateMutations: scanAggregateMutations(pair.ourPath),
      S6_lineRatio: computeLineRatio(ourLines, bgaLines),
      S7_externalCardIdMentions: scanExternalCardIdMentions(pair.cardId, repoRoot),
      S10_shellLikelihood: shell.likelihood,
      S10_evidence: shell.evidence,
      S11_descAlignment: compareDesc(ourDesc, bgaDesc),
      S12_i18nGapKeys: gaps,
    },
    verdict: 'pending',
  }
}

export function writeJsonl(outputPath: string, results: CardAuditResult[]): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  const content = results.map(r => JSON.stringify(r)).join('\n') + '\n'
  fs.writeFileSync(outputPath, content)
}

export interface AuditSummary {
  totalCards: number
  oursOnly: number
  bgaOnly: number
  bothScanned: number
  signalCounts: Record<string, number>
}

export function runAudit(args: ParsedArgs, repoRoot: string = '.'): AuditSummary {
  const discovery = discoverCardPairs(args.ourCardsDir, args.bgaCardsDir)
  const results: CardAuditResult[] = []
  for (const pair of discovery.both) {
    results.push(scanCard(pair, repoRoot))
  }
  writeJsonl(args.outputPath, results)

  const sigCounts: Record<string, number> = {
    S1: 0, S4: 0, S5: 0, S6_over_2: 0, S6_15_to_2: 0,
    S7: 0, S10_high: 0, S11_diff: 0, S11_missing: 0, S12: 0,
  }
  for (const r of results) {
    if (r.signals.S1_coreFileMentions.length > 0) sigCounts.S1++
    if (r.signals.S4_crossLayerImports.length > 0) sigCounts.S4++
    if (r.signals.S5_aggregateMutations.length > 0) sigCounts.S5++
    if (r.signals.S6_lineRatio > 2) sigCounts.S6_over_2++
    else if (r.signals.S6_lineRatio > 1.5) sigCounts.S6_15_to_2++
    if (r.signals.S7_externalCardIdMentions.length > 0) sigCounts.S7++
    if (r.signals.S10_shellLikelihood === 'high') sigCounts.S10_high++
    if (r.signals.S11_descAlignment === 'diff-from-bga') sigCounts.S11_diff++
    if (r.signals.S11_descAlignment === 'missing-i18n') sigCounts.S11_missing++
    if (r.signals.S12_i18nGapKeys.length > 0) sigCounts.S12++
  }

  return {
    totalCards: results.length,
    oursOnly: discovery.oursOnly.length,
    bgaOnly: discovery.bgaOnly.length,
    bothScanned: discovery.both.length,
    signalCounts: sigCounts,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  const summary = runAudit(args)
  console.log(JSON.stringify(summary, null, 2))
  if (args.strict) {
    const total = Object.values(summary.signalCounts).reduce((a, b) => a + b, 0)
    if (total > 0) process.exit(1)
  }
}
