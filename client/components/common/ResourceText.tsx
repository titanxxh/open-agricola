import { Fragment } from 'react'

/**
 * Renders card description text with inline resource icons.
 * Converts <WOOD>, <CLAY>, <FOOD>, <SCORE>, <STABLE> etc. to icon spans.
 * Splits on \n into separate lines (<br/>).
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
  PIG: 'boar', // desc text uses PIG; CSS class is .res-icon-boar
  CATTLE: 'cattle',
  STABLE: 'barn', // desc text uses STABLE; reuses .res-icon-barn (stables.png gray column)
  BEGGING: 'begging',
  SCORE: 'score', // CSS class .res-icon-score is an alias for .res-icon-bonusVp (game.css)
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
  const lines = text.split('\n')
  return (
    <span className={className}>
      {lines.map((line, lineIdx) => (
        <Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {parseDescription(line).map((p, i) =>
            p.type === 'text' ? (
              <span key={i}>{p.text}</span>
            ) : (
              <span key={i} className={`res-icon res-icon-${p.resource}`} title={p.resource} />
            ),
          )}
        </Fragment>
      ))}
    </span>
  )
}
