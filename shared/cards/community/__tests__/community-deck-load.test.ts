import { describe, it, expect } from 'vitest'
import { allCommunityCards } from '../auto-catalog'
import { ALL_CARD_IMPLS } from '../../register-all'

describe('community deck — load shape invariants', () => {
  it('every community card id starts with CUSTOM_', () => {
    for (const card of allCommunityCards) {
      expect(card.id).toMatch(/^CUSTOM_/)
    }
  })

  it('every community card has deck === "community"', () => {
    for (const card of allCommunityCards) {
      expect(card.deck).toBe('community')
    }
  })

  it('every community card has a matching _impl in ALL_CARD_IMPLS', () => {
    for (const card of allCommunityCards) {
      expect(ALL_CARD_IMPLS[card.id]).toBeDefined()
    }
  })

  it('card ids are unique across the community deck', () => {
    const ids = allCommunityCards.map((c) => c.id)
    const dedupe = new Set(ids)
    expect(dedupe.size).toBe(ids.length)
  })
})
