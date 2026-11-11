/**
 * Markup for scan-card text, transcribed from the printed originals.
 *
 *   blank line         paragraph
 *   `\n`               line break inside a paragraph
 *   `*i*`              italic; there is no bold, numerals keep the body weight
 *   `{sc}…{/sc}`       small caps; capitals inside stay full size
 *   `[icon:name]`      glyph printed inline
 *
 * A paragraph may start with `{small}`, `{left}`, or `{pile}` (a vertical
 * stack of its lines, so two piles sit side by side). Or it is a diagram:
 * `{art:PATH|WIDTH}` on its own, or `{row:PATH|WIDTH}text` with the text to
 * the diagram's right. WIDTH is in card pixels (the card is 235 wide).
 * `|top` keeps the text at the top of a tall picture. `|mid` centers a
 * leading arrow on the picture and starts the text level with it.
 */

export type ScanInline =
  | { readonly kind: 'text'; readonly text: string; readonly italic: boolean; readonly smallCaps: boolean }
  | { readonly kind: 'icon'; readonly name: string }
  | { readonly kind: 'art'; readonly src: string; readonly width: number }
  | { readonly kind: 'break' }

export type ScanParagraph = {
  readonly kind: 'paragraph'
  readonly inline: readonly ScanInline[]
  readonly small: boolean
  readonly left: boolean
  readonly pile: boolean
  readonly aside?: readonly ScanInline[]
}

export type ScanBlock =
  | ScanParagraph
  | { readonly kind: 'art'; readonly src: string; readonly width: number }
  | { readonly kind: 'row'; readonly src: string; readonly width: number; readonly top: boolean; readonly mid: boolean; readonly inline: readonly ScanInline[] }

/**
 * Icons scan text prints inline, each with the word plain text reads for it:
 * the A–E resource icons, plus the person, llama, fairy, dog, and forest-tree
 * tokens that no A–E card prints.
 */
export const SCAN_TEXT_ICONS: Readonly<Record<string, string>> = {
  wood: 'wood', clay: 'clay', reed: 'reed', stone: 'stone', grain: 'grain', vegetable: 'vegetable', food: 'food',
  sheep: 'sheep', boar: 'boar', cattle: 'cattle', horse: 'horse', llama: 'llama', fairy: 'fairy', person: 'person',
  arrow: '→', 'arrow-1x': '1x', 'arrow-2x': '2x', 'arrow-down': '↓', field: 'field',
  'field-grain': 'field grain', 'field-vegetable': 'field vegetable', fuel: 'fuel', moor: 'moor', score: 'point',
  dog: 'dog', 'tree-small': 'tree',
}

/** The line forest events print under their rules when they go back into the deck. */
export const SCAN_RESHUFFLE_LINE = '{sc}Shuffle this card back into the deck.{/sc}'

const INLINE = /\*|\{sc\}|\{\/sc\}|\[icon:([a-z0-9-]+)\]|\{art:([^|}]+)\|(\d+)\|end\}|\n/g
const ART = /^\{(art|row):([^|}]+)\|(\d+)(?:\|(top|mid))?\}/

export function parseScanInline(text: string): ScanInline[] {
  const out: ScanInline[] = []
  let italic = false
  let smallCaps = false
  let last = 0
  const push = (chunk: string) => {
    if (chunk) out.push({ kind: 'text', text: chunk, italic, smallCaps })
  }
  for (const match of text.matchAll(INLINE)) {
    push(text.slice(last, match.index))
    last = match.index + match[0].length
    const token = match[0]
    if (token === '*') italic = !italic
    else if (token === '{sc}') smallCaps = true
    else if (token === '{/sc}') smallCaps = false
    else if (token === '\n') out.push({ kind: 'break' })
    else if (match[2]) out.push({ kind: 'art', src: match[2], width: Number(match[3]) })
    else out.push({ kind: 'icon', name: match[1] })
  }
  push(text.slice(last))
  return out
}

export function parseScanText(text: string): ScanBlock[] {
  return text.split(/\n{2,}/).map((source): ScanBlock => {
    const art = ART.exec(source)
    if (art) {
      const [whole, kind, src, width, align] = art
      return kind === 'art'
        ? { kind: 'art', src, width: Number(width) }
        : { kind: 'row', src, width: Number(width), top: align === 'top', mid: align === 'mid', inline: parseScanInline(source.slice(whole.length)) }
    }
    let rest = source
    let small = false
    let left = false
    let pile = false
    for (let prefix = /^\{(small|left|pile)\}/.exec(rest); prefix; prefix = /^\{(small|left|pile)\}/.exec(rest)) {
      if (prefix[1] === 'small') small = true
      else if (prefix[1] === 'left') left = true
      else pile = true
      rest = rest.slice(prefix[0].length)
    }
    const bar = pile ? rest.indexOf('|') : -1
    const aside = bar >= 0 ? parseScanInline(rest.slice(bar + 1)) : undefined
    if (bar >= 0) rest = rest.slice(0, bar)
    return { kind: 'paragraph', inline: parseScanInline(rest), small, left, pile, ...(aside ? { aside } : {}) }
  })
}

const plainInline = (inline: readonly ScanInline[]): string =>
  inline.map((part) => part.kind === 'text'
    ? (part.smallCaps ? part.text.toUpperCase() : part.text)
    : part.kind === 'break' ? '\n' : part.kind === 'icon' ? (SCAN_TEXT_ICONS[part.name] ?? '') : '').join('').replace(/ {2,}/g, ' ')

/** The words of a scan text without markup or diagrams, one line per paragraph. */
export function scanPlainText(text: string): string {
  return parseScanText(text)
    .flatMap((block) => block.kind === 'art' ? [] : [
      block.kind === 'paragraph' && block.aside ? `${plainInline(block.inline)}\n${plainInline(block.aside)}` : plainInline(block.inline),
    ])
    .join('\n')
}

/** Diagram images a scan text draws. */
export function scanTextArt(text: string): string[] {
  return parseScanText(text).flatMap((block) => block.kind === 'paragraph'
    ? block.inline.flatMap((part) => part.kind === 'art' ? [part.src] : [])
    : [block.src])
}
