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

function unwrapClientTranslate(value: string): string {
  const m = value.match(/clienttranslate\(\s*['"](.*?)['"]\s*\)/)
  if (m) return m[1]
  const parenStr = value.match(/^\(\s*['"](.+?)['"]\s*\)$/)
  if (parenStr) return parenStr[1]
  const sm = value.match(/^['"](.*?)['"]$/)
  return sm ? sm[1] : value
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
