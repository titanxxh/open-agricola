import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/C/C49_BeerStall'

const CARD_ID = 'C49_BeerStall'

describe('C49_BeerStall session', () => {
  it('offers optional exchange when player has grain and empty unfenced stable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 3
    // Add an unfenced stable (not inside any pasture)
    player.stableTiles = [{ row: 2, col: 2 }]
    player.pastures = []
    player.stableAnimals = {}

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    // With 1 empty stable, should be a single seq
    expect(flow!.type).toBe('seq')
    expect((flow as any).optional).toBe(true)
  })

  it('returns undefined when player has no grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 0
    player.stableTiles = [{ row: 2, col: 2 }]
    player.pastures = []
    player.stableAnimals = {}

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('returns undefined when no unfenced stables', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 3
    // All stables are inside pastures
    player.stableTiles = [{ row: 2, col: 2 }]
    player.pastures = [{
      id: 'p0',
      size: 1,
      stables: 1,
      animalType: null,
      animalCount: 0,
      tiles: [{ row: 2, col: 2 }],
    }]
    player.stableAnimals = {}

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('returns undefined when unfenced stables have animals', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 3
    player.stableTiles = [{ row: 2, col: 2 }]
    player.pastures = []
    player.stableAnimals = { '2-2': 'sheep' }

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('offers xor with multiple options when multiple empty unfenced stables and grain', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 5
    player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }]
    player.pastures = []
    player.stableAnimals = {}

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    expect((flow as any).optional).toBe(true)
    // 3 empty stables, 5 grain → min(3,5) = 3 options
    expect((flow as any).children.length).toBe(3)
  })

  it('caps exchanges at grain count when less grain than empty stables', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.grain = 2
    player.stableTiles = [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }]
    player.pastures = []
    player.stableAnimals = {}

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onHarvestFeedingPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    // min(3 stables, 2 grain) = 2 options
    expect((flow as any).children.length).toBe(2)
  })
})
