import { describe, expect, it } from 'vitest'
import type { GameState } from '../../contract/types'
import { createInitialState, normalizeState } from '../state-bootstrap'
import { withClassicCardDefinitions } from '../../cards/classic-catalog'
import { classicFixtureCards } from '../../cards/__tests__/__fixtures__/classic-definitions'

// ADR 0049: a classic game rebuilds legacy hands and decks from its own classic decks, never from revised A–E.
const FIXTURES = [
  ...classicFixtureCards('CE', 'occupation', 8),
  ...classicFixtureCards('CE', 'minor', 10),
  ...classicFixtureCards('CI', 'occupation', 8),
  ...classicFixtureCards('CI', 'minor', 8),
  ...classicFixtureCards('CZ', 'occupation', 6),
  ...classicFixtureCards('CZ', 'minor', 6),
]
const chosen = (kind: 'occupation' | 'minor') =>
  new Set(FIXTURES.filter(card => card.deck !== 'CZ' && card.kind === kind).map(card => card.id))
const hands = (state: GameState) => state.players.map(player => [player.occupationHand, player.minorHand])
const cardsOf = (state: GameState, kind: 'occupation' | 'minor') => [
  ...state.players.flatMap(player => kind === 'occupation' ? player.occupationHand : player.minorHand),
  ...state.ordinaryCardDecks[kind],
]

describe('normalizeState for a legacy classic game', () => {
  it('rebuilds a missing hand and the deck from its own classic decks', () => {
    withClassicCardDefinitions(FIXTURES, () => {
      const created = createInitialState(1872, { playerCount: 2, cardEdition: 'classic', classicDeckIds: ['CI', 'CE'] })
      const legacy = JSON.parse(JSON.stringify(created)) as GameState
      legacy.players[1]!.minorHand = []
      delete (legacy as Partial<GameState>).ordinaryCardDecks

      const rebuilt = normalizeState(legacy)

      expect(rebuilt.cardEdition).toBe('classic')
      expect(hands(rebuilt)).toEqual(hands(created))
      // 16 occupations and 18 minors are eligible: 14 of each in hands, the rest rebuilt into the deck.
      expect(rebuilt.ordinaryCardDecks.occupation).toHaveLength(2)
      expect(rebuilt.ordinaryCardDecks.minor).toHaveLength(4)
      for (const kind of ['occupation', 'minor'] as const) expect(new Set(cardsOf(rebuilt, kind))).toEqual(chosen(kind))
    })
  })
})
