export type SafeFix =
  | { field: 'vp'; target: number }
  | { field: 'extraVp'; target: boolean }
  | { field: 'category'; target: string }

function valueLiteral(fix: SafeFix): string {
  switch (fix.field) {
    case 'vp': return String(fix.target)
    case 'extraVp': return String(fix.target)
    case 'category': return `'${fix.target}'`
  }
}

function replaceLiteralLine(src: string, field: string, value: string): { src: string; replaced: boolean } {
  const re = new RegExp(`(^[ \\t]*${field}:\\s*)([^,\\n]*)(,?[ \\t]*)$`, 'm')
  if (!re.test(src)) return { src, replaced: false }
  return { src: src.replace(re, `$1${value}$3`), replaced: true }
}

function insertBeforeClosingBrace(src: string, line: string): string {
  const idx = src.lastIndexOf('})')
  if (idx < 0) return src
  return src.slice(0, idx) + `  ${line},\n` + src.slice(idx)
}

export function applySafeFix(src: string, fixes: SafeFix[]): string {
  let out = src
  for (const f of fixes) {
    const lit = valueLiteral(f)
    const replaced = replaceLiteralLine(out, f.field, lit)
    if (replaced.replaced) {
      out = replaced.src
    } else {
      out = insertBeforeClosingBrace(out, `${f.field}: ${lit}`)
    }
  }
  return out
}
