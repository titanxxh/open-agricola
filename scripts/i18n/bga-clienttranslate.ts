import * as fs from 'node:fs'
import * as path from 'node:path'

export interface BgaString {
  raw: string
  file: string
  line: number
}

export interface ExtractResult {
  found: BgaString[]
  unextracted: { file: string; line: number; sample: string }[]
}

const SINGLE_LINE_RE = /clienttranslate\(\s*(['"])((?:[^'"\\]|\\.)*?)\1\s*\)/g

export function extractClientTranslateFromSource(file: string, source: string): ExtractResult {
  const found: BgaString[] = []
  const unextracted: ExtractResult['unextracted'] = []
  const lines = source.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    SINGLE_LINE_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = SINGLE_LINE_RE.exec(line)) !== null) {
      const raw = m[2].replace(/\\(['"\\])/g, '$1')
      found.push({ raw, file, line: i + 1 })
    }
    if (
      /clienttranslate\(\s*$/.test(line) ||
      /\bself::_\(/.test(line)
    ) {
      unextracted.push({ file, line: i + 1, sample: line.trim().slice(0, 120) })
    }
  }
  return { found, unextracted }
}

export function normalizeBgaString(raw: string): string {
  return raw.replace(/\$\{(\w+)\}/g, '{$1}').replace(/<[A-Z_]+>/g, '')
}

export interface AggregatedResult {
  unique: Map<string, { count: number; locations: string[] }>
  unextractedVariants: { file: string; line: number; sample: string }[]
}

export function extractClientTranslateFromBgaRoot(bgaRoot: string): AggregatedResult {
  const unique = new Map<string, { count: number; locations: string[] }>()
  const unextractedVariants: AggregatedResult['unextractedVariants'] = []
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (entry.isFile() && /\.php$/.test(entry.name)) {
        const src = fs.readFileSync(p, 'utf8')
        const r = extractClientTranslateFromSource(path.relative(bgaRoot, p), src)
        for (const s of r.found) {
          const norm = normalizeBgaString(s.raw)
          const cur = unique.get(norm) ?? { count: 0, locations: [] }
          cur.count++
          if (cur.locations.length < 5) cur.locations.push(`${s.file}:${s.line}`)
          unique.set(norm, cur)
        }
        unextractedVariants.push(...r.unextracted)
      }
    }
  }
  walk(bgaRoot)
  return { unique, unextractedVariants }
}
