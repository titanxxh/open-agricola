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
    expect(html).toContain('data-n="5+"')
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

  it('renders Moor major cards with local Moor art and M numbering', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_HorseSlaughterhouse1" cardType="major" />,
    )

    expect(html).toContain('data-numbering="M001"')
    expect(html).toContain('data-moor-major="true"')
    expect(html).toContain('data-deck="M"')
    expect(html).toContain('/assets/moor/major/M001.png')
  })

  it('renders Moor minor cards with local Moor art and M numbering', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="M068_Church" cardType="minor" />,
    )

    expect(html).toContain('data-numbering="M068"')
    expect(html).toContain('data-deck="M"')
    expect(html).toContain('/assets/moor/minor/M068.png')
  })

  it.each([
    ['B33_Mantlepiece', -3],
    ['B40_BreweryPond', -1],
    ['C83_EarlyCattle', -3],
    ['D40_Cesspit', -1],
    ['M080_AdvancePayment', -4],
    ['M085_OvenInstallation', -1],
  ])('renders printed negative VP for %s', (cardId, vp) => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId={cardId} cardType="minor" />,
    )

    expect(html).toContain(`class="card-score">${vp}</div>`)
  })

  it('renders Moor major printed marker icons from BGA category sprite metadata', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_MuseumOfTheMoors" cardType="major" />,
    )

    expect(html).toContain('class="card-category"')
    expect(html).toContain('data-category="BUILDING_RESOURCE_PROVIDER"')
    expect(html).not.toContain('card-moor-major-marker')
    expect(html).not.toContain('/assets/moor/icons/M013-marker.png')
  })

  it('renders Museum of the Moors discount list like the scanned card', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_MuseumOfTheMoors" cardType="major" />,
    )

    expect(html).toContain('These major improvements cost you 1 building resource less:')
    expect(html).toContain('Well')
    expect(html).toContain('Clay Oven')
    expect(html).toContain('Joinery')
    expect(html).toContain('Stone Oven')
    expect(html).toContain('Pottery')
    expect(html).toContain('Forester')
    expect(html).toContain('Basketmaker')
    expect(html).toContain('res-icon-stone')
    expect(html).toContain('res-icon-clay')
    expect(html).toContain('res-icon-wood')
    expect(html).toContain('res-icon-reed')
  })

  it('renders Cookhouse return cost as both Fireplace and Cooking Hearth families', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_Cookhouse1" cardType="major" />,
    )

    expect(html).toContain('Return Fireplace/Cooking Hearth or')
  })

  it('renders current Moor oven names from i18n', () => {
    const heatingOven = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_HeatingOven" cardType="major" />,
    )
    const tiledOven = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="Major_Moor_TiledOven" cardType="major" />,
    )

    expect(heatingOven).toContain('Heating Oven')
    expect(heatingOven).not.toContain('Furnace')
    expect(tiledOven).toContain('Tiled Oven')
    expect(tiledOven).not.toContain('Heating Stove')
  })
})
