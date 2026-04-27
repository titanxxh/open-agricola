/**
 * Session-level gating tests for the community deck flag.
 *
 * Verifies that `enableCommunityDeck` correctly gates whether community cards
 * (here: CUSTOM_FixtureHarvester) appear in player hands after initial deal.
 */
import { describe, it, expect } from 'vitest'
import { dealHands } from '../../shared/logic/state'
import { allCommunityCards } from '../../shared/cards/community/auto-catalog'

// Ensure the community fixture card is registered before any state is created.
import '../../shared/cards/community/CUSTOM_FixtureHarvester'

const FIXTURE_CARD = 'CUSTOM_FixtureHarvester'

const COMMUNITY_CARD_IDS = new Set(allCommunityCards.map((card) => card.id))

function allDealtCards(enableCommunityDeck: boolean): string[] {
  const { minorHands, occupationHands } = dealHands(
    2,
    42,
    [],
    [],
    undefined,
    500,
    enableCommunityDeck,
  )
  return [...minorHands.flat(), ...occupationHands.flat()]
}

describe('community deck — session gating', () => {
  it('community cards excluded when enableCommunityDeck=false (default)', () => {
    const cards = allDealtCards(false)
    expect(cards).not.toContain(FIXTURE_CARD)
    expect(cards.some((id) => COMMUNITY_CARD_IDS.has(id))).toBe(false)
  })

  it('community cards excluded when enableCommunityDeck is omitted', () => {
    const cards = allDealtCards(false)
    expect(cards).not.toContain(FIXTURE_CARD)
    expect(cards.some((id) => COMMUNITY_CARD_IDS.has(id))).toBe(false)
  })

  it('community cards included in pool when enableCommunityDeck=true', () => {
    const cards = allDealtCards(true)
    expect(cards).toContain(FIXTURE_CARD)
    expect(cards.some((id) => COMMUNITY_CARD_IDS.has(id))).toBe(true)
  })
})
