import * as fs from 'node:fs'
import * as path from 'node:path'

export type TsCard = {
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
}

function extractStringLiteral(line: string): string | undefined {
  const m = line.match(/['"](.*?)['"]/)
  return m ? m[1] : undefined
}

function extractObjectLiteral(line: string): Record<string, number> | undefined {
  const m = line.match(/\{([^}]*)\}/)
  if (!m) return undefined
  const out: Record<string, number> = {}
  for (const pair of m[1].split(',')) {
    const p = pair.trim().match(/^(?:"(\w+)"|(\w+))\s*:\s*(-?\d+)$/)
    if (!p) continue
    const key = p[1] ?? p[2]
    out[key] = Number(p[3])
  }
  return out
}

function extractArrayOfObjectsLiteral(line: string): Record<string, number>[] | undefined {
  // Find a top-level [ ... ] containing one or more { ... } object literals.
  const arrMatch = line.match(/\[(.*)\]/)
  if (!arrMatch) return undefined
  const inner = arrMatch[1]
  const objs = inner.match(/\{[^}]*\}/g)
  if (!objs) return []
  return objs.map(obj => {
    const out: Record<string, number> = {}
    const body = obj.slice(1, -1)
    for (const pair of body.split(',')) {
      const p = pair.trim().match(/^(?:"(\w+)"|(\w+))\s*:\s*(-?\d+)$/)
      if (!p) continue
      const key = p[1] ?? p[2]
      out[key] = Number(p[3])
    }
    return out
  })
}

export function parseTsCard(tsPath: string): TsCard {
  const src = fs.readFileSync(tsPath, 'utf8')
  const id = path.basename(tsPath, '.ts')
  const deck = id[0]
  const number = Number(id.slice(1).split('_')[0])

  const card: TsCard = { id, deck, number }

  for (const line of src.split('\n').map(l => l.trim())) {
    if (line.startsWith('name:')) card.name = extractStringLiteral(line)
    else if (line.startsWith('category:')) card.category = extractStringLiteral(line)
    else if (line.startsWith('players:')) card.players = extractStringLiteral(line)
    else if (line.startsWith('extraVp:')) card.extraVp = line.includes('true')
    else if (line.startsWith('vp:')) {
      const m = line.match(/vp:\s*(-?\d+)/)
      if (m) card.vp = Number(m[1])
    }
    else if (line.startsWith('cost:')) card.cost = extractObjectLiteral(line)
    else if (line.startsWith('altCosts:')) card.altCosts = extractArrayOfObjectsLiteral(line)
    else if (line.startsWith('prerequisite:')) card.prerequisite = extractStringLiteral(line)
  }

  return card
}
