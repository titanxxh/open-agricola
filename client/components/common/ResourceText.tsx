import { Fragment, type Key, type ReactNode } from 'react'

/**
 * Renders card description text with inline resource icons and BGA-style
 * markup. Three token kinds are recognised:
 *
 *   `<TAG>`     — resource / arrow / action sprite (see `RESOURCE_TAGS`)
 *   `[text]`    — section label, rendered as an italic block (BGA's
 *                 `formatStringMeeples` `<span class="text">…</span>`).
 *   `__text__`  — italic emphasis used for in-line action references
 *                 (BGA's `<span class="action-card-name-reference">…</span>`).
 *
 * Tokens may nest — e.g. `[__Bake Bread__ action:]` becomes a labelled
 * block whose `Bake Bread` portion is additionally emphasised.
 *
 * `\n` splits the input into lines separated by `<br/>`.
 */

const RESOURCE_TAGS: Record<string, string> = {
  // ── Resources ──
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

  // ── Arrows (the "→" used in exchanges and scoring maps) ──
  ARROW: 'arrow',
  'ARROW-1X': 'arrow-1x',
  'ARROW-2X': 'arrow-2x',

  // ── Action / farm iconography ──
  BAKE: 'bake', // BGA meeple-bake: bread-baking action icon
  FIELD: 'field',
  FENCE: 'fence-icon',
  GRAIN_VEG_STACK: 'grain-veg-stack',
}

// One regex covers all three token kinds — alternation captures into
// distinct groups so the dispatch loop knows which kind it matched.
//   1 = <TAG>
//   2 = [label]
//   3 = __em__
//
// A factory rather than a module-scoped instance — `parseDescription`
// recurses, and a shared `lastIndex` would clobber the outer scan.
const makeTokenRegex = () => /<([A-Z0-9_-]+)>|\[([^\]]+)\]|__([^_]+)__/g

type Part =
  | { type: 'text'; text: string }
  | { type: 'icon'; resource: string; tag: string }
  | { type: 'label'; children: Part[] }
  | { type: 'em'; children: Part[] }

function parseDescription(text: string): Part[] {
  const re = makeTokenRegex()
  const parts: Part[] = []
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', text: text.slice(last, match.index) })
    }
    if (match[1]) {
      const tag = match[1]
      const resource = RESOURCE_TAGS[tag]
      if (resource) parts.push({ type: 'icon', resource, tag })
      else parts.push({ type: 'text', text: match[0] }) // unknown tag → keep literal
    } else if (match[2]) {
      // [text] — recurse so nested tokens still get parsed.
      parts.push({ type: 'label', children: parseDescription(match[2]) })
    } else if (match[3]) {
      // __text__ emphasis — also recurse.
      parts.push({ type: 'em', children: parseDescription(match[3]) })
    }
    last = re.lastIndex
  }
  if (last < text.length) {
    parts.push({ type: 'text', text: text.slice(last) })
  }
  return parts
}

function renderParts(parts: Part[], keyPrefix: Key): ReactNode {
  return parts.map((p, i) => {
    const key = `${keyPrefix}-${i}`
    switch (p.type) {
      case 'text':
        return <span key={key}>{p.text}</span>
      case 'icon':
        return (
          <span
            key={key}
            className={`res-icon res-icon-${p.resource}`}
            title={p.resource}
          />
        )
      case 'label':
        return (
          <span key={key} className="card-desc-label">
            {renderParts(p.children, key)}
          </span>
        )
      case 'em':
        return (
          <em key={key} className="card-desc-em">
            {renderParts(p.children, key)}
          </em>
        )
    }
  })
}

export function ResourceText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  return (
    <span className={className}>
      {lines.map((line, lineIdx) => (
        <Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {renderParts(parseDescription(line), `l${lineIdx}`)}
        </Fragment>
      ))}
    </span>
  )
}
