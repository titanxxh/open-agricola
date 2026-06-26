import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('card sprite CSS', () => {
  it('keeps alternative cost slash separators visible', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../client/styles/card-sprite.css'), 'utf8')

    expect(css).not.toContain('.card-cost-alt .card-cost-separator {\n  display: none;')
    expect(css).toContain('.card-cost-alt .card-cost-separator {\n  display: inline-block;')
  })

  it('renders Farmers of the Moor major badges with BGA category sprite', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../client/styles/card-sprite.css'), 'utf8')

    expect(css).toContain("background-image: url('/assets/moor/icons/major-deck-m.png');")
    expect(css).toContain("background-image: url('/bga-img/card_categories.png');")
    expect(css).not.toContain('.card-moor-major-marker')
    expect(css).not.toContain('content: "M";')
  })

  it('renders 5+ player requirement badges from extracted scan assets', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../client/styles/card-sprite.css'), 'utf8')

    expect(css).toContain(".card-players[data-n='5+']")
    expect(css).toContain("background-image: url('/assets/player56/players-5-plus.png');")
  })
})
