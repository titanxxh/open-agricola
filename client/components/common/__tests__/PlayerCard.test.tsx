import { beforeEach, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { PlayerCard } from '../PlayerCard'
import {
  clearCustomCardMetadata,
  registerCustomCardMetadata,
} from '../../../../shared/cards/custom-card-metadata'
import { loadCardsManifest } from '../../../services/card-meta'
// Cards-manifest is preloaded by `client/__tests__/setup-card-manifest.ts`.

describe('PlayerCard dual-type rendering (alsoCountsAs)', () => {
  beforeEach(() => {
    clearCustomCardMetadata()
  })

  it('marks D60_LargePottery with data-also-counts-as="major"', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="D60_LargePottery" cardType="minor" />,
    )
    expect(html).toContain('data-also-counts-as="major"')
  })

  it('marks D59_EarthOven with data-also-counts-as="major"', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="D59_EarthOven" cardType="minor" />,
    )
    expect(html).toContain('data-also-counts-as="major"')
  })

  it('marks A60_OrientalFireplace with data-also-counts-as="major"', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="A60_OrientalFireplace" cardType="minor" />,
    )
    expect(html).toContain('data-also-counts-as="major"')
  })

  it('renders D60 prerequisite separately and keeps the cost area resource-only', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="D60_LargePottery" cardType="minor" />,
    )
    expect(html).toContain('Return the Pottery')
    expect(html).not.toContain('card-cost-return')
    expect(html).toContain('card-res-icon clay')
    expect(html).toContain('card-res-icon stone')
  })

  it('renders C60 prerequisite separately and keeps the cost area resource-only', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="C60_SmallPottersOven" cardType="minor" />,
    )
    expect(html).toContain('Return the Clay / Stone Oven')
    expect(html).not.toContain('card-cost-return')
    expect(html).toContain('card-res-icon clay')
  })

  it('does not emit data-also-counts-as on plain (non-dual) minors', () => {
    const html = renderToStaticMarkup(
      // D34 is a plain minor with no alsoCountsAs; picking it keeps this
      // test independent of any dual-type flag regressions on other cards.
      <PlayerCard locale="en" cardId="D34_LuxuriousHostel" cardType="minor" />,
    )
    expect(html).not.toContain('data-also-counts-as=')
  })

  it('renders desc placeholders as inline icons (no literal <WOOD> text)', () => {
    // E76_LumberPile description contains <WOOD> and <STABLE> placeholders.
    const html = renderToStaticMarkup(
      <PlayerCard locale="zh" cardId="E76_LumberPile" cardType="minor" />,
    )
    expect(html).toContain('res-icon-wood')
    expect(html).toContain('res-icon-barn')
    expect(html).not.toContain('&lt;WOOD&gt;')
    expect(html).not.toContain('<WOOD>')
  })

  it('uses a local player56 portrait when the card numbering has one', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="A169_OffSiter" cardType="occupation" />,
    )

    expect(html).toContain('/assets/player56/A169.png')
    expect(html).not.toContain('/bga-img/deckA/A169.png')
  })

  it('uses the local player56 portrait range beyond A169 on first render', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="B180_GameTeaser" cardType="occupation" />,
    )

    expect(html).toContain('/assets/player56/B180.png')
    expect(html).not.toContain('/bga-img/deckB/B180.png')
  })

  it('renders globally registered custom cards even though they are absent from the static manifest', () => {
    registerCustomCardMetadata({
      cardType: 'minor',
      cardJson: {
        id: 'CUSTOM_DebugMallet',
        name: 'Debug Mallet',
        deck: 'CUSTOM',
        number: 0,
        desc: ['Gain 1 wood.'],
        cost: { wood: 1 },
        vp: 0,
        implemented: true,
      },
    })

    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="CUSTOM_DebugMallet" cardType="minor" />,
    )

    expect(html).toContain('Debug Mallet')
    expect(html).toContain('Gain 1 wood.')
    expect(html).toContain('data-id="CUSTOM_DebugMallet"')
  })

  it('renders C54 stable printed cost from card metadata', async () => {
    const manifest = await loadCardsManifest()
    const originalCost = manifest.C54_MarketBooth?.cost
    manifest.C54_MarketBooth.cost = { stable: 1 }

    try {
      const html = renderToStaticMarkup(
        <PlayerCard locale="en" cardId="C54_MarketBooth" cardType="minor" />,
      )

      expect(html).toContain('card-cost')
      expect(html).toContain('res-icon-barn')
    } finally {
      manifest.C54_MarketBooth.cost = originalCost
    }
  })

  it('renders alternative costs with a visible slash separator', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="D80_BrickHammer" cardType="minor" />,
    )

    expect(html).toContain('card-cost-alt')
    expect(html).toContain('card-cost-separator')
    expect(html).toContain('card-cost-separator">/</span>')
  })
})
