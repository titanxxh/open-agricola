/**
 * Renders card description text with inline resource icons.
 * Converts <WOOD>, <CLAY>, <FOOD> etc. to icon spans.
 * Also handles <SCORE> as a VP icon.
 */

const RESOURCE_TAGS: Record<string, string> = {
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
  SCORE: 'score',
}

const TAG_RE = /<([A-Z_]+)>/g

type Part = { type: 'text'; text: string } | { type: 'icon'; resource: string; tag: string }

function parseDescription(text: string): Part[] {
  const parts: Part[] = []
  let last = 0
  let match: RegExpExecArray | null
  TAG_RE.lastIndex = 0
  while ((match = TAG_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', text: text.slice(last, match.index) })
    }
    const tag = match[1]!
    const resource = RESOURCE_TAGS[tag]
    if (resource) {
      parts.push({ type: 'icon', resource, tag })
    } else {
      parts.push({ type: 'text', text: match[0] })
    }
    last = TAG_RE.lastIndex
  }
  if (last < text.length) {
    parts.push({ type: 'text', text: text.slice(last) })
  }
  return parts
}

export function ResourceText({ text, className }: { text: string; className?: string }) {
  const parts = parseDescription(text)
  return (
    <span className={className}>
      {parts.map((p, i) =>
        p.type === 'text'
          ? <span key={i}>{p.text}</span>
          : p.resource === 'score'
            ? <span key={i} className="res-inline-score" title="VP">★</span>
            : <span key={i} className={`res-icon res-icon-${p.resource}`} title={p.resource} />
      )}
    </span>
  )
}
