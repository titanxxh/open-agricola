import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('card sprite CSS', () => {
  it('keeps alternative cost slash separators visible', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../client/styles/card-sprite.css'), 'utf8')

    expect(css).not.toContain('.card-cost-alt .card-cost-separator {\n  display: none;')
    expect(css).toContain('.card-cost-alt .card-cost-separator {\n  display: inline-block;')
  })

  it('renders Farmers of the Moor major badges with reference category sprite', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../client/styles/card-sprite.css'), 'utf8')

    expect(css).toContain("background-image: url('/assets/moor/icons/major-deck-m.png');")
    expect(css).toContain("background-image: url('/assets/revised/card_categories.png');")
    expect(css).not.toContain('.card-moor-major-marker')
    expect(css).not.toContain('content: "M";')
  })

  it('renders 5+ player requirement badges from extracted scan assets', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../client/styles/card-sprite.css'), 'utf8')

    expect(css).toContain(".card-players[data-n='5+']")
    expect(css).toContain("background-image: url('/assets/player56/players-5-plus.png');")
  })

  it('aligns dual-type minor icons with the reference major-minor frame', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../client/styles/card-sprite.css'), 'utf8')

    expect(css).toContain('.player-card.minor .player-card-inner[data-also-counts-as~="major"] .card-icon')
    expect(css).toContain('width: 192px;')
    expect(css).toContain('height: 192px;')
    expect(css).toContain('top: 35px;')
    expect(css).toContain('left: 9.4%;')
  })

  it('stretches ordinary minor and occupation art to the reference icon boxes', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../client/styles/card-sprite.css'), 'utf8')

    expect(css).not.toContain('.player-card.minor .card-icon {\n  width: 182.125px;\n  height: 189.9975px;\n  top: 37.0125px;\n  left: 11.5%;\n  background-size: contain;')
    expect(css).not.toContain('.player-card.occupation .card-icon {\n  width: 180.95px;\n  height: 189.645px;\n  top: 37.0125px;\n  left: 11.5%;\n  background-size: contain;')
    expect(css).toContain('background-position: center -6px;')
  })

  it('covers the left traveling arrow on non-passing dual-type minors with the ordinary leaf', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../client/styles/card-sprite.css'), 'utf8')
    const ruleBody = (selector: string): string => {
      const start = css.indexOf(`${selector} {`)
      if (start < 0) return ''
      const open = css.indexOf('{', start)
      const close = css.indexOf('}', open)
      return close < 0 ? '' : css.slice(open + 1, close)
    }
    const dual = '.player-card.minor .player-card-inner[data-also-counts-as~="major"]'

    expect(ruleBody(`${dual} .card-frame-left-leaves`)).not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden/)
    expect(ruleBody('.player-card.minor .card-frame-left-leaves')).toContain("url('/assets/revised/meeples.png')")

    const rightLeaves = ruleBody(`${dual} .card-frame-right-leaves`)
    expect(rightLeaves).toContain("url('/assets/revised/card_frame_major_minor.png')")
    expect(rightLeaves).toContain('background-position: 99.5% 32.5%;')
    expect(rightLeaves).not.toMatch(/display\s*:\s*none/)

    for (const file of [
      'shared/cards/A/A060_OrientalFireplace.ts',
      'shared/cards/C/C060_SmallPottersOven.ts',
      'shared/cards/D/D025_WitchesDanceFloor.ts',
      'shared/cards/D/D059_EarthOven.ts',
      'shared/cards/D/D060_LargePottery.ts',
    ]) {
      const source = fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8')
      expect(source, file).toContain("alsoCountsAs: ['major']")
      expect(source, file).not.toMatch(/passing\s*:\s*true/)
    }
  })
})
