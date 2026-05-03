import { describe, it, expect } from 'vitest'
import { extractClientTranslateFromSource, normalizeBgaString } from '../i18n/bga-clienttranslate'

describe('extractClientTranslateFromSource', () => {
  it('extracts single-quoted single-line strings', () => {
    const src = `<?php\nself::notify(clienttranslate('Hello \${player}'));`
    const r = extractClientTranslateFromSource('a.php', src)
    expect(r.found).toEqual([{ raw: 'Hello ${player}', file: 'a.php', line: 2 }])
  })

  it('extracts double-quoted strings', () => {
    const src = `<?php\nclienttranslate("World <FOOD>");`
    const r = extractClientTranslateFromSource('a.php', src)
    expect(r.found[0].raw).toBe('World <FOOD>')
  })

  it('records unextracted multi-line variants', () => {
    const src = `<?php\nclienttranslate(\n'multi line'\n);`
    const r = extractClientTranslateFromSource('a.php', src)
    expect(r.found).toHaveLength(0)
    expect(r.unextracted).toHaveLength(1)
  })
})

describe('normalizeBgaString', () => {
  it('converts ${X} to {X}', () => {
    expect(normalizeBgaString('Hello ${player_name}')).toBe('Hello {player_name}')
  })

  it('strips <HTMLTOKEN>', () => {
    expect(normalizeBgaString('Pay <FOOD> for <CLAY>')).toBe('Pay  for ')
  })

  it('handles both', () => {
    expect(normalizeBgaString('${actplayer} pays <WOOD>')).toBe('{actplayer} pays ')
  })
})
