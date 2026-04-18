/**
 * Audit minor improvement / occupation `vp` declarations against BGA.
 *
 * Usage:
 *   npx tsx scripts/audit-card-vp.ts                 # markdown table + summary
 *   npx tsx scripts/audit-card-vp.ts --strict        # exit 1 if any diff
 *
 * 工作原理：
 *   - BGA 端：解析 bga-agricola/modules/php/Cards/{A..E}/*.php 中
 *       $this->vp = N;          (整数)
 *       $this->vp = '\d+';      (字符串)
 *     形式的赋值。提取 BGA class 名（与文件名同）作为 cardId。
 *   - 我方：解析 shared/cards/{A..E}/*.ts 中 `new MinorImprovement({...})` /
 *     `new Occupation({...})` 构造对象，从对象字面量首层提取 `id:` 与 `vp:`。
 *     未声明 `vp:` 视为 0。
 *
 *     备注：原计划是 `import { minorImprovementCards, occupationCards } from
 *     '../shared/cards/catalog'`，但 catalog 与 shared/game/minor-improvements
 *     之间存在 ESM 循环（D95_SiteManager → game/minor-improvements → catalog），
 *     在 tsx 单脚本执行下命中 TDZ；Vite 因模块图合并而无感知。改为源码解析后
 *     该脚本完全独立，不触发 catalog side-effects。
 *
 *   - join：BGA cardId == 我方 cardId（两侧都是 'D60_LargePottery' 形态）。
 *   - 输出：markdown 表 (cardId | bga_vp | our_vp | diff) + summary 行。
 *   - 跳过：BGA 有但我方没注册的卡（计入 'missing-ours' 计数）；以及
 *     CUSTOM_ / Workshop_ 前缀卡。
 *
 * 不写 GitHub / 不 push，纯本地工具。
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REPO_ROOT = path.resolve(__dirname, '..')
const OUR_CARDS_ROOT = path.resolve(REPO_ROOT, 'shared/cards')

function resolveBgaRoot(): string {
  // Walk upward from this script looking for `bga-agricola/modules/php/Cards`.
  // This handles both the main checkout (../../bga-agricola) and worktree
  // checkouts under `.worktrees/<branch>/` (../../../../bga-agricola).
  const explicit = process.env.BGA_AGRICOLA_ROOT
  if (explicit) {
    const cards = path.join(explicit, 'modules/php/Cards')
    if (fs.existsSync(cards)) return cards
  }
  let dir = REPO_ROOT
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'bga-agricola/modules/php/Cards')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(
    'Could not locate bga-agricola/modules/php/Cards. Set BGA_AGRICOLA_ROOT env var.',
  )
}

const BGA_CARDS_ROOT = resolveBgaRoot()

type Side = 'minor' | 'occupation'

const BGA_VP_REGEX = /\$this->vp\s*=\s*['"]?(-?\d+)['"]?\s*;/

function parseBgaCard(filePath: string): { id: string; vp: number; side: Side } | null {
  const src = fs.readFileSync(filePath, 'utf8')
  const classMatch = src.match(
    /class\s+([A-Z]\d+_\w+)\s+extends\s+(?:\\?[A-Za-z_][A-Za-z0-9_]*\\)*(MinorImprovement|Occupation)\b/,
  )
  if (!classMatch) return null
  const id = classMatch[1]
  const side: Side = classMatch[2] === 'MinorImprovement' ? 'minor' : 'occupation'
  const vpMatch = src.match(BGA_VP_REGEX)
  const vp = vpMatch ? parseInt(vpMatch[1], 10) : 0
  return { id, vp, side }
}

function collectBga(): Map<string, { vp: number; side: Side }> {
  const out = new Map<string, { vp: number; side: Side }>()
  for (const deck of ['A', 'B', 'C', 'D', 'E']) {
    const dir = path.join(BGA_CARDS_ROOT, deck)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.php')) continue
      const parsed = parseBgaCard(path.join(dir, f))
      if (parsed) out.set(parsed.id, { vp: parsed.vp, side: parsed.side })
    }
  }
  return out
}

// Assumption: no `})` token inside the ctor body. Safe today because all
// callbacks live in registerCardEffect({...}) blocks that appear before
// `new MinorImprovement({...})` / `new Occupation({...})` in each file.
// If a future card embeds an arrow `})` inside the ctor, this regex will
// truncate the body silently and miss `vp:`. Add brace-balanced parsing then.
const OUR_CTOR_REGEX = /new\s+(MinorImprovement|Occupation)\s*\(\s*\{([\s\S]*?)\}\s*\)/g
// `id:` may be a string literal or a CARD_ID identifier referring to a top-level
// `const CARD_ID = '...'`. We capture both forms.
const ID_LITERAL_REGEX = /\bid\s*:\s*['"]([A-Z]\d+_\w+)['"]/
const ID_VAR_REGEX = /\bid\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\b/
const VP_REGEX = /\bvp\s*:\s*(-?\d+)\b/

function parseOurCard(filePath: string): { id: string; vp: number; side: Side } | null {
  const src = fs.readFileSync(filePath, 'utf8')
  // Reset regex state for each file (g-flag stickiness)
  OUR_CTOR_REGEX.lastIndex = 0
  const m = OUR_CTOR_REGEX.exec(src)
  if (!m) return null
  const ctorName = m[1]
  const body = m[2]
  const side: Side = ctorName === 'MinorImprovement' ? 'minor' : 'occupation'

  let id: string | null = null
  const litMatch = body.match(ID_LITERAL_REGEX)
  if (litMatch) {
    id = litMatch[1]
  } else {
    const varMatch = body.match(ID_VAR_REGEX)
    if (varMatch) {
      const varName = varMatch[1]
      const constRegex = new RegExp(`const\\s+${varName}\\s*=\\s*['"]([A-Z]\\d+_\\w+)['"]`)
      const constMatch = src.match(constRegex)
      if (constMatch) id = constMatch[1]
    }
  }
  if (!id) return null

  const vpMatch = body.match(VP_REGEX)
  const vp = vpMatch ? parseInt(vpMatch[1], 10) : 0
  return { id, vp, side }
}

function collectOurs(): { minor: Map<string, number>; occupation: Map<string, number> } {
  const minor = new Map<string, number>()
  const occupation = new Map<string, number>()
  for (const deck of ['A', 'B', 'C', 'D', 'E']) {
    const dir = path.join(OUR_CARDS_ROOT, deck)
    if (!fs.existsSync(dir)) continue
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue
      const filePath = path.join(dir, f)
      const parsed = parseOurCard(filePath)
      if (!parsed) continue
      if (parsed.id.startsWith('CUSTOM_') || parsed.id.startsWith('Workshop_')) continue
      ;(parsed.side === 'minor' ? minor : occupation).set(parsed.id, parsed.vp)
    }
  }
  return { minor, occupation }
}

type Row = {
  id: string
  side: Side
  bga: number
  ours: number
  diff: number
  status: 'match' | 'diff' | 'missing-bga' | 'missing-ours'
}

function audit(): { rows: Row[]; counts: Record<string, number> } {
  const bga = collectBga()
  const { minor: ourMinor, occupation: ourOcc } = collectOurs()
  const rows: Row[] = []
  const seenBga = new Set<string>()

  for (const [id, ourVp] of ourMinor) {
    const side: Side = 'minor'
    if (!bga.has(id)) {
      rows.push({ id, side, bga: 0, ours: ourVp, diff: ourVp, status: 'missing-bga' })
    } else {
      seenBga.add(id)
      const b = bga.get(id)!.vp
      const status = b === ourVp ? 'match' : 'diff'
      rows.push({ id, side, bga: b, ours: ourVp, diff: ourVp - b, status })
    }
  }
  for (const [id, ourVp] of ourOcc) {
    const side: Side = 'occupation'
    if (!bga.has(id)) {
      rows.push({ id, side, bga: 0, ours: ourVp, diff: ourVp, status: 'missing-bga' })
    } else {
      seenBga.add(id)
      const b = bga.get(id)!.vp
      const status = b === ourVp ? 'match' : 'diff'
      rows.push({ id, side, bga: b, ours: ourVp, diff: ourVp - b, status })
    }
  }
  for (const [id, info] of bga) {
    if (seenBga.has(id)) continue
    rows.push({ id, side: info.side, bga: info.vp, ours: 0, diff: -info.vp, status: 'missing-ours' })
  }

  const counts: Record<string, number> = { match: 0, diff: 0, 'missing-bga': 0, 'missing-ours': 0 }
  for (const r of rows) counts[r.status]++

  return { rows, counts }
}

function fmt(rows: Row[], counts: Record<string, number>): void {
  rows.sort((a, b) => {
    if (a.status !== b.status) return a.status.localeCompare(b.status)
    return a.id.localeCompare(b.id)
  })
  console.log('| cardId | side | bga_vp | our_vp | diff | status |')
  console.log('|---|---|---:|---:|---:|---|')
  for (const r of rows) {
    if (r.status === 'match') continue
    console.log(`| ${r.id} | ${r.side} | ${r.bga} | ${r.ours} | ${r.diff > 0 ? '+' : ''}${r.diff} | ${r.status} |`)
  }
  console.log('')
  console.log(
    `Summary: match=${counts.match}  diff=${counts.diff}  missing-bga=${counts['missing-bga']}  missing-ours=${counts['missing-ours']}`,
  )
}

const strict = process.argv.includes('--strict')
const { rows, counts } = audit()
fmt(rows, counts)
// Strict-mode gate (Phase 2.3): only fail on numeric `vp` mismatches between
// BGA and our side for cards both sides implement. `missing-bga` (our-only
// cards) and `missing-ours` (BGA-only cards we haven't implemented yet) are
// scope decisions for separate PRs and are surfaced in the Summary line for
// human review rather than blocking this audit.
if (strict && counts.diff > 0) process.exit(1)
