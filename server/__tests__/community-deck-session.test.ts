/**
 * Session-level gating tests for the community deck flag.
 *
 * Verifies that `enableCommunityDeck` correctly gates whether community cards
 * (here: CUSTOM_FixtureHarvester) appear in player hands after initial deal.
 */
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'

// Ensure the community fixture card is registered before any state is created.
import '../../shared/cards/community/CUSTOM_FixtureHarvester'

const FIXTURE_CARD = 'CUSTOM_FixtureHarvester'

/** Collect all dealt card ids from both players' minor and occupation hands. */
function allDealtCards(session: GameSession): string[] {
  const { state } = session.getState()
  const ids: string[] = []
  for (const player of state.players) {
    ids.push(...player.minorHand)
    ids.push(...player.occupationHand)
  }
  return ids
}

describe('community deck — session gating', () => {
  it('community cards excluded when enableCommunityDeck=false (default)', () => {
    // Seed 42, 2-player game, community deck disabled (the default).
    const session = new GameSession(42, [], { enableCommunityDeck: false })
    const cards = allDealtCards(session)
    expect(cards).not.toContain(FIXTURE_CARD)
  })

  it('community cards excluded when enableCommunityDeck is omitted', () => {
    // No explicit option — should default to false.
    const session = new GameSession(42)
    const cards = allDealtCards(session)
    expect(cards).not.toContain(FIXTURE_CARD)
  })

  it('community cards included in pool when enableCommunityDeck=true', () => {
    // Scan 50 seeds; with a 2-player game and a pool that now includes the
    // fixture card, at least one seed should deal it to some player's hand.
    let found = false
    for (let seed = 0; seed < 50 && !found; seed++) {
      const session = new GameSession(seed, [], { enableCommunityDeck: true })
      if (allDealtCards(session).includes(FIXTURE_CARD)) {
        found = true
      }
    }
    expect(found).toBe(true)
  })
})
