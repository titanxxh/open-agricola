import { describe, expect, it } from 'vitest'
import { getMinorImprovementCard, getOccupationCard } from '../../cards/catalog'
import { createInitialState, defaultSandboxPlayerNames } from '../state-bootstrap'

describe('sandbox initial state options', () => {
  it('uses the same generated names for unnamed hotseat and sandbox seats', () => {
    const state = createInitialState(42, { playerCount: 6, playerNames: ['PlayerF'] })
    expect(state.players.map((player) => player.name)).toEqual([
      'PlayerF', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6',
    ])
  })
  it('supports configurable player count and sandbox player names', () => {
    const state = createInitialState(42, {
      playerCount: 4,
      playerNames: [...defaultSandboxPlayerNames],
    })

    expect(state.players).toHaveLength(4)
    expect(state.players.map((player) => player.name)).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4'])
  })

  it('supports six stable sandbox players without changing the first four seats', () => {
    const state = createInitialState(42, {
      playerCount: 6,
      playerNames: [...defaultSandboxPlayerNames],
    })

    expect(state.players).toHaveLength(6)
    expect(state.players.map((player) => player.id)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
    expect(state.players.map((player) => player.name)).toEqual(['Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6'])
    expect(state.players.map((player) => player.color)).toEqual(['red', 'blue', 'black', 'yellow', 'green', 'purple'])
    expect(state.players.map((player) => player.startPlayer)).toEqual([true, false, false, false, false, false])
    expect(state.players.every((player) => player.workers.slice(0, 2).every((worker) => worker.isActive))).toBe(true)
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
