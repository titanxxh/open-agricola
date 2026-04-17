import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { PlayerCard } from '../PlayerCard'
// Registers card definitions with the in-memory catalog.
import '../../../../shared/cards/catalog'

describe('PlayerCard dual-type rendering (alsoCountsAs)', () => {
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

  it('renders the "Return <major> or <cost>" UI for D60 (dual-type minor)', () => {
    const html = renderToStaticMarkup(
      <PlayerCard locale="en" cardId="D60_LargePottery" cardType="minor" />,
    )
    expect(html).toContain('card-cost-return')
    expect(html).toContain('Return')
  })

  it('does not emit data-also-counts-as on plain (non-dual) minors', () => {
    const html = renderToStaticMarkup(
      // D34 is a plain minor with no alsoCountsAs; picking it keeps this
      // test independent of any dual-type flag regressions on other cards.
      <PlayerCard locale="en" cardId="D34_LuxuriousHostel" cardType="minor" />,
    )
    expect(html).not.toContain('data-also-counts-as=')
  })
})
