import { describe, expect, it } from 'vitest'
import { getMinorImprovementCard, getOccupationCard } from '../../cards/catalog'
import { createInitialState, defaultSandboxPlayerNames } from '../state'

describe('sandbox initial state options', () => {
  it('supports configurable player count and sandbox player names', () => {
    const state = createInitialState(42, {
      playerCount: 4,
      playerNames: [...defaultSandboxPlayerNames],
    })

    expect(state.players).toHaveLength(4)
    expect(state.players.map((player) => player.name)).toEqual(['playerA', 'playerB', 'playerC', 'playerD'])
  })

  it('filters dealt hands by selected default decks', () => {
    const state = createInitialState(42, {
      playerCount: 2,
      deckIds: ['A'],
      playerNames: ['playerA', 'playerB'],
    })

    for (const player of state.players) {
      for (const minorId of player.minorHand) {
        expect(getMinorImprovementCard(minorId)?.deck).toBe('A')
      }
      for (const occupationId of player.occupationHand) {
        expect(getOccupationCard(occupationId)?.deck).toBe('A')
      }
    }
  })
})
