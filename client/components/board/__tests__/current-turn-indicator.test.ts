import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const linear = (channel: number) => {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

const luminance = (hex: string) => {
  const color = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * linear((color >> 16) & 255)
    + 0.7152 * linear((color >> 8) & 255)
    + 0.0722 * linear(color & 255)
}

const contrast = (foreground: string, background: string) => {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

const rule = (css: string, selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? ''
}

describe('current-turn indicator contrast', () => {
  const game = readFileSync(join(process.cwd(), 'client/styles/pages/game.css'), 'utf8')
  const mobile = readFileSync(join(process.cwd(), 'client/styles/pages/mobile-table.css'), 'utf8')

  it('paints the turn arrow as a light glyph on a dark badge', () => {
    const marker = rule(game, '.turn-marker')
    expect(marker).toMatch(/background:\s*#4a2418/)
    expect(marker).toMatch(/color:\s*#fff8ef/)
    expect(marker).toMatch(/box-shadow:[^;]*#fff8ef/)
    expect(contrast('#fff8ef', '#4a2418')).toBeGreaterThanOrEqual(7)
    expect(contrast('#fff8ef', '#3a5a2c')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#4a2418', '#e4f0d7')).toBeGreaterThanOrEqual(7)
    expect(contrast('#4a2418', '#ffe0a8')).toBeGreaterThanOrEqual(7)
    expect(contrast('#4a2418', '#faf7e7')).toBeGreaterThanOrEqual(7)
  })

  it('gives the current turn its own border and fill, including on a narrow overview', () => {
    for (const body of [
      rule(game, '.desktop-player-overview__player.is-current-turn'),
      rule(mobile, '.game-layout__players .desktop-player-overview__player.is-current-turn'),
      rule(game, '.player-tab.is-current-turn'),
      rule(game, '.player-tabs__tab.is-current-turn'),
    ]) {
      expect(body).toMatch(/#ffe0a8/)
      expect(body).toMatch(/#6b3418/)
    }
    expect(contrast('#6b3418', '#ffe0a8')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#6b3418', '#faf3d9')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#1e1e1e', '#ffe0a8')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#3a5a2c', '#ffe0a8')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#2e4b1e', '#ffe0a8')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the viewed farm distinct when that player also has the turn', () => {
    const farm = rule(game, '.player-tab.active.is-current-turn')
    const tabs = rule(game, '.player-tabs__tab.is-active.is-current-turn')
    expect(farm).toContain('var(--color-primary)')
    expect(farm).toMatch(/#fff8ef/)
    expect(tabs).toContain('var(--color-accent-bg)')
    expect(tabs).toMatch(/#6b3418/)
    expect(contrast('#ffffff', '#3a5a2c')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#fff8ef', '#3a5a2c')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#6b3418', '#fff3d6')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#1e1e1e', '#fff3d6')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the turn legend caption at the declared text color', () => {
    const legend = rule(game, '.player-tabs-legend')
    expect(legend).toMatch(/color:\s*#4f4f4f/)
    expect(game).not.toMatch(/\.legend-text\s*\{[^}]*opacity/)
    expect(contrast('#4f4f4f', '#efe6cf')).toBeGreaterThanOrEqual(4.5)
    expect(contrast('#4f4f4f', '#f3f0df')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps a dark keyboard focus ring on the turn and farm controls', () => {
    const focus = rule(game, '.player-tab:focus-visible,\n.desktop-player-overview__name:focus-visible,\n.player-tabs__tab:focus-visible')
    expect(focus).toMatch(/outline:\s*2px solid #1e1e1e/)
    expect(contrast('#1e1e1e', '#faf7e7')).toBeGreaterThanOrEqual(7)
    expect(contrast('#1e1e1e', '#fff3d6')).toBeGreaterThanOrEqual(7)
  })
})
