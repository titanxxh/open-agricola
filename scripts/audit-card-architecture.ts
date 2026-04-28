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

export function scanCard(pair: CardPair): CardAuditResult {
  const ourLines = countLines(pair.ourPath)
  const bgaLines = countLines(pair.bgaPath)
  return {
    cardId: pair.cardId,
    ourPath: pair.ourPath,
    bgaPath: pair.bgaPath,
    ourLines,
    bgaLines,
    signals: {
      S1_coreFileMentions: [],
      S4_crossLayerImports: [],
      S5_aggregateMutations: [],
      S6_lineRatio: computeLineRatio(ourLines, bgaLines),
      S7_externalCardIdMentions: [],
      S10_shellLikelihood: 'none',
      S10_evidence: { hookCount: 0, bgaHookCount: 0, bodyLines: 0 },
      S11_descAlignment: 'aligned',
      S12_i18nGapKeys: [],
    },
    verdict: 'pending',
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2))
  console.log(JSON.stringify(args, null, 2))
}
