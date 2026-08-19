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
})
