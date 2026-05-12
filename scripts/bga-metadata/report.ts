import type { DiffResult, FieldDiff } from './diff'

const LITERAL_FIELDS = ['extraVp', 'vp']
const COMPLEX_FIELDS = ['category', 'players', 'cost', 'altCosts', 'prerequisite']

function fmt(v: unknown): string {
  if (v === undefined) return '(missing)'
  if (typeof v === 'object') return '`' + JSON.stringify(v) + '`'
  return String(v)
}

function groupByField(devs: FieldDiff[]): Map<string, FieldDiff[]> {
  const m = new Map<string, FieldDiff[]>()
  for (const d of devs) {
    if (!m.has(d.field)) m.set(d.field, [])
    m.get(d.field)!.push(d)
  }
  return m
}

export function renderReport(r: DiffResult, dateStr: string): string {
  const warns = r.deviations.filter(d => d.verdict === 'warn')
  const errs = r.deviations.filter(d => d.verdict === 'error')

  const lines: string[] = []
  lines.push(`# BGA Metadata Diff Report (${dateStr})`)
  lines.push('')
  lines.push('## Summary')
  lines.push(`- Total BGA cards scanned: ${r.totalBga}`)
  lines.push(`- Total TS cards scanned: ${r.totalTs}`)
  lines.push(`- ⚠ Literal deviations: ${warns.length}`)
  lines.push(`- ❌ Complex deviations: ${errs.length}`)
  lines.push(`- 🔍 BGA-only: ${r.bgaOnly.length}`)
  lines.push(`- 🔍 TS-only: ${r.tsOnly.length}`)
  lines.push(`- 🔍 Banned-but-present: ${r.bannedButPresent.length}`)
  lines.push('')

  lines.push('## ⚠ Literal deviations (auto-fixable)')
  for (const field of LITERAL_FIELDS) {
    const group = groupByField(warns).get(field)
    if (!group?.length) continue
    lines.push(`### ${field}`)
    lines.push('| Card | BGA | Ours |')
    lines.push('|---|---|---|')
    for (const d of group) lines.push(`| ${d.id} | ${fmt(d.bga)} | ${fmt(d.ours)} |`)
    lines.push('')
  }

  lines.push('## ❌ Complex deviations (manual review)')
  for (const field of COMPLEX_FIELDS) {
    const group = groupByField(errs).get(field)
    if (!group?.length) continue
    lines.push(`### ${field}`)
    lines.push('| Card | BGA | Ours |')
    lines.push('|---|---|---|')
    for (const d of group) lines.push(`| ${d.id} | ${fmt(d.bga)} | ${fmt(d.ours)} |`)
    lines.push('')
  }

  lines.push('## 🔍 Single-sided')
  lines.push('### BGA-only (no matching TS file)')
  for (const id of r.bgaOnly) lines.push(`- ${id}`)
  lines.push('')
  lines.push('### TS-only (no matching BGA file)')
  for (const id of r.tsOnly) lines.push(`- ${id}`)
  lines.push('')
  lines.push('### Banned in BGA but present in TS (route to §2.5)')
  for (const id of r.bannedButPresent) lines.push(`- ${id}`)
  lines.push('')

  return lines.join('\n')
}
