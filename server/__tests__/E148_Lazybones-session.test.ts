import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import '../../shared/cards/E/E148_Lazybones'

describe('E148_Lazybones session', () => {
  /**
   * Setup: 2-player game.
   * p0 = Lazybones owner (has all 4 stables in reserve).
   * p1 = opponent, will use marked action spaces.
   */
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 1 // opponent's turn

    const owner = state.players[0]!
    // Play Lazybones via devPlayCard so onBuy fires
    owner.occupationHand.push('E148_Lazybones')
    session.loadState(state)
    session.devPlayCard(0, 'E148_Lazybones')

    // Reload state after devPlayCard
    const updatedState = session.getState().state
    updatedState.currentPlayerIndex = 1

    const opponent = updatedState.players[1]!
    setWorkersAtHome(state, opponent, 2)
    session.loadState(updatedState)
    return session
  }

  it('stables placed on spaces during onBuy', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!

    expect(owner.occupationPlayed).toContain('E148_Lazybones')
    const spaces = owner.cardStates?.['E148_Lazybones']?.extraData?.reservedActionSpaces as string[]
    expect(spaces).toBeDefined()
    expect(spaces).toEqual(['grain-seeds', 'farmland', 'day-laborer', 'farm-expansion'])
    // Owner started with 0 stables on farm — 4 are now on action spaces
    expect(owner.stableTiles.length).toBe(0)
  })

  it('respects stable reserve limit on onBuy', () => {
    const session = new GameSession()
    const state = session.getState().state

    const owner = state.players[0]!
    // Pre-place 2 stables on the farm so only 2 remain in reserve
    owner.stableTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }]
    owner.occupationHand.push('E148_Lazybones')
    session.loadState(state)
    session.devPlayCard(0, 'E148_Lazybones')

    const updatedState = session.getState().state
    const updatedOwner = updatedState.players[0]!
    const spaces = updatedOwner.cardStates?.['E148_Lazybones']?.extraData?.reservedActionSpaces as string[]
    expect(spaces).toBeDefined()
    expect(spaces.length).toBe(2)
    // Only the first 2 target spaces should have stables
    expect(spaces).toEqual(['grain-seeds', 'farmland'])
  })

  it('no stables placed if reserve is empty', () => {
    const session = new GameSession()
    const state = session.getState().state

    const owner = state.players[0]!
    // All 4 stables already on the farm
    owner.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 },
      { row: 0, col: 2 }, { row: 0, col: 3 },
    ]
    owner.occupationHand.push('E148_Lazybones')
    session.loadState(state)
    session.devPlayCard(0, 'E148_Lazybones')

    const updatedState = session.getState().state
    const updatedOwner = updatedState.players[0]!
    const spaces = updatedOwner.cardStates?.['E148_Lazybones']?.extraData?.reservedActionSpaces as string[]
    // No stables available to place
    expect(spaces ?? []).toEqual([])
  })

  it('owner receives free stable when opponent uses grain-seeds', () => {
    const session = setup()

    const resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)

    // The owner should have gained a stable on their farm
    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(1)

    // grain-seeds should be removed from the spaces list
    const spaces = owner.cardStates?.['E148_Lazybones']?.extraData?.reservedActionSpaces as string[]
    expect(spaces).not.toContain('grain-seeds')
    expect(spaces.length).toBe(3)
  })

  it('owner receives free stable when opponent uses day-laborer', () => {
    const session = setup()

    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(1)

    const spaces = owner.cardStates?.['E148_Lazybones']?.extraData?.reservedActionSpaces as string[]
    expect(spaces).not.toContain('day-laborer')
    expect(spaces.length).toBe(3)
  })

  it('owner receives free stable when opponent uses day-laborer', () => {
    const session = setup()

    const resp = session.takeAction(1, 'day-laborer')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(1)

    const spaces = owner.cardStates?.['E148_Lazybones']?.extraData?.reservedActionSpaces as string[]
    expect(spaces).not.toContain('day-laborer')
    expect(spaces.length).toBe(3)
  })

  it('no trigger for unmarked spaces', () => {
    const session = setup()

    const resp = session.takeAction(1, 'lessons')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    // No stable should have been built
    expect(owner.stableTiles.length).toBe(0)
    // All 4 spaces should still be marked
    const spaces = owner.cardStates?.['E148_Lazybones']?.extraData?.reservedActionSpaces as string[]
    expect(spaces.length).toBe(4)
  })

  it('no trigger after stable already collected from a space', () => {
    const session = setup()

    // First use of grain-seeds by opponent
    let resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles.length).toBe(1)

    // Advance to next round so the space can be reused
    const state = session.getState().state
    state.round += 1
    // Reset action spaces
    for (const space of state.actionSpaces) {
      space.takenBy = []
    }
    state.currentPlayerIndex = 1
    state.players[1]!.workersAvailable = 2
    session.loadState(state)

    // Second use of grain-seeds by opponent — no more stable on this space
    resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    // Still only 1 stable from the first trigger
    expect(owner.stableTiles.length).toBe(1)
  })

  it('no trigger when owner uses their own marked space', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    // Owner using the space should NOT trigger (scope: opponent)
    expect(owner.stableTiles.length).toBe(0)
    // Stable should still be on the space
    const spaces = owner.cardStates?.['E148_Lazybones']?.extraData?.reservedActionSpaces as string[]
    expect(spaces).toContain('grain-seeds')
  })

  it('removes the reserved space without a stable gain log when owner has no empty tile', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.fields = getAllTilePositions().map((tile) => ({
      row: tile.row,
      col: tile.col,
      stacks: [],
    }))
    session.loadState(state)

    const resp = session.takeAction(1, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const owner = resp.state.players[0]!
    expect(owner.stableTiles.length).toBe(0)
    const spaces = owner.cardStates?.['E148_Lazybones']?.extraData?.reservedActionSpaces as string[]
    expect(spaces).not.toContain('grain-seeds')
    expect(owner.cardStates?.['E148_Lazybones']?.resourceStats?.used ?? 0).toBe(0)
    expect(resp.state.log.some((entry) =>
      entry.key === 'log.cardEffectGain' &&
      entry.params?.cardId === 'E148_Lazybones',
    )).toBe(false)
  })
})
