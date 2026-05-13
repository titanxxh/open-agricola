import * as fs from 'node:fs'
import * as path from 'node:path'

export type BgaCard = {
  id: string
  deck: string
  number: number
  name?: string
  category?: string
  players?: string
  extraVp?: boolean
  vp?: number
  cost?: Record<string, number>
  altCosts?: Record<string, number>[]
  prerequisite?: string
  banned: boolean
}

const RESOURCE_MAP: Record<string, string> = {
  WOOD: 'wood',
  CLAY: 'clay',
  REED: 'reed',
  STONE: 'stone',
  FOOD: 'food',
  GRAIN: 'grain',
  VEGETABLE: 'vegetable',
  SHEEP: 'sheep',
  BOAR: 'boar',
  CATTLE: 'cattle',
}

function parseResourceMap(body: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const pair of body.split(',')) {
    const m = pair.trim().match(/^(\w+)\s*=>\s*(?:"(-?\d+)"|'(-?\d+)'|(-?\d+))$/)
    if (!m) continue
    const key = RESOURCE_MAP[m[1]]
    if (!key) continue
    const amount = Number(m[2] ?? m[3] ?? m[4])
    out[key] = amount
  }
  return out
}

function parseCost(rawValue: string): { cost?: Record<string, number>; altCosts?: Record<string, number>[] } {
  const trimmed = rawValue.trim().replace(/^\[/, '').replace(/\]$/, '').trim()
  const nested = trimmed.match(/\[([^\]]*)\]/g)
  if (nested && nested.length >= 2) {
    return { altCosts: nested.map(b => parseResourceMap(b.slice(1, -1))) }
  }
  return { cost: parseResourceMap(trimmed) }
}

// Match a PHP-style quoted string while honoring `\'` / `\"` escapes:
// the closing quote must match the opening quote type and not be backslash-
// escaped. Returns the inner literal with the matching escape removed.
function matchQuotedLiteral(input: string): { literal: string; raw: string } | null {
  const open = input[0]
  if (open !== "'" && open !== '"') return null
  let i = 1
  while (i < input.length) {
    const ch = input[i]
    if (ch === '\\') { i += 2; continue }
    if (ch === open) {
      const raw = input.slice(0, i + 1)
      const inner = input.slice(1, i)
      // Strip PHP escape backslashes before quote characters (handles both
      // `\'` in single-quoted strings and vestigial `\"` copied into single-
      // quoted strings — BGA source uses both inconsistently).
      const literal = inner.replace(/\\(['"])/g, '$1')
      return { literal, raw }
    }
    i += 1
  }
  return null
}

function unwrapClientTranslate(value: string): string {
  const ct = value.match(/clienttranslate\(\s*/)
  if (ct) {
    const tail = value.slice(ct.index! + ct[0].length)
    const quoted = matchQuotedLiteral(tail)
    if (quoted) return quoted.literal
  }
  const paren = value.match(/^\(\s*/)
  if (paren) {
    const tail = value.slice(paren[0].length)
    const quoted = matchQuotedLiteral(tail)
    if (quoted) return quoted.literal
  }
  const direct = matchQuotedLiteral(value.trim())
  if (direct) return direct.literal
  return value
}

export function parseBgaCard(phpPath: string): BgaCard {
  const src = fs.readFileSync(phpPath, 'utf8')
  const id = path.basename(phpPath, '.php')
  const deck = id[0]
  const number = Number(id.slice(1).split('_')[0])

  const card: BgaCard = { id, deck, number, banned: false }

  const fieldRegex = /\$this->(\w+)\s*=\s*([\s\S]*?);/g
  let m: RegExpExecArray | null
  while ((m = fieldRegex.exec(src))) {
    const key = m[1]
    const val = m[2].trim()
    switch (key) {
      case 'name': card.name = unwrapClientTranslate(val); break
      case 'category': {
        // Form A: unquoted PHP const e.g. POINTS_PROVIDER (uppercase letters + underscores)
        // Form B: quoted string e.g. 'BONUS_POINTS_-_GET' (may contain hyphens)
        const quoted = val.match(/^['"](.+?)['"]$/)
        if (quoted) {
          card.category = quoted[1]
        } else {
          const constMatch = val.match(/^([A-Z][A-Z0-9_-]*)$/)
          if (constMatch) card.category = constMatch[1]
        }
        break
      }
      case 'players': card.players = unwrapClientTranslate(val); break
      case 'extraVp': card.extraVp = val === 'true'; break
      case 'vp': card.vp = Number(val); break
      case 'cost':
      case 'costs': {
        const parsed = parseCost(val)
        if (parsed.cost) card.cost = parsed.cost
        if (parsed.altCosts) card.altCosts = parsed.altCosts
        break
      }
      case 'prerequisite': card.prerequisite = unwrapClientTranslate(val); break
      case 'banned': if (val === 'true') card.banned = true; break
      default: break
    }
  }
  return card
}
