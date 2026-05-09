/**
 * Parse docs/community-card-examples.md → extract the 10 example cards.
 *
 * Each example lives under a `## N. <title>` heading and contains exactly
 * one ` ```typescript ` fenced code block with `CARD_DEF` + `CARD_IMPL`.
 */

export interface ExtractedExample {
  /** Card id from `const CARD_ID = '...'`. */
  id: string
  /** Section heading text (e.g. "极简纯分数卡"). */
  sectionTitle: string
  /** Full TS code block including CARD_DEF + CARD_IMPL. */
  code: string
  /** Inferred from `new MinorImprovement(...)` vs `new Occupation(...)`. */
  cardType: 'minor' | 'occupation'
}

const SECTION_RE = /^## (\d+)\.\s+(.+)$/gm
const FENCE_RE = /```typescript\s*\n([\s\S]*?)```/i
const CARD_ID_RE = /const\s+CARD_ID\s*=\s*['"]([^'"]+)['"]/

export function extractExamplesFromMarkdown(md: string): ExtractedExample[] {
  const sections: { num: number; title: string; start: number }[] = []
  let m: RegExpExecArray | null
  SECTION_RE.lastIndex = 0
  while ((m = SECTION_RE.exec(md)) !== null) {
    sections.push({ num: Number(m[1]), title: m[2]!.trim(), start: m.index })
  }

  const examples: ExtractedExample[] = []
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i]!
    const end = i + 1 < sections.length ? sections[i + 1]!.start : md.length
    const body = md.slice(sec.start, end)
    const fenceMatch = body.match(FENCE_RE)
    if (!fenceMatch) continue
    const code = fenceMatch[1]!.trim()
    const idMatch = code.match(CARD_ID_RE)
    if (!idMatch) continue
    const cardType: 'minor' | 'occupation' = code.includes('new Occupation(')
      ? 'occupation'
      : 'minor'
    examples.push({
      id: idMatch[1]!,
      sectionTitle: sec.title,
      code,
      cardType,
    })
  }
  return examples
}
