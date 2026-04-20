import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/actions/effects/animals'

import '../../shared/cards/C/C89_StableMaster'

describe('C89_StableMaster session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('C89_StableMaster')
    session.loadState(state)
    session.devPlayCard(0, 'C89_StableMaster')
    return session
  }

  it('first unfenced stable has capacity 3', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Add an unfenced stable
    player.stableTiles.push({ row: 0, col: 2 })
    // No pastures covering this tile, so it's unfenced

    const zones = computeAnimalZones(player)
    const stableZone = zones.find(z => z.zoneType === 'stable')
    expect(stableZone).toBeDefined()
    expect(stableZone!.capacity).toBe(3) // 1 + 2
  })

  it('second unfenced stable still has capacity 1', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Add two unfenced stables
    player.stableTiles.push({ row: 0, col: 2 })
    player.stableTiles.push({ row: 0, col: 3 })

    const zones = computeAnimalZones(player)
    const stableZones = zones.filter(z => z.zoneType === 'stable')
    expect(stableZones.length).toBe(2)

    // First stable gets the bonus
    expect(stableZones[0]!.capacity).toBe(3)
    // Second stable remains at default
    expect(stableZones[1]!.capacity).toBe(1)
  })

  it('no effect without unfenced stables', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // No stables at all
    const zones = computeAnimalZones(player)
    const stableZones = zones.filter(z => z.zoneType === 'stable')
    expect(stableZones.length).toBe(0)
  })

  it('no effect without the card', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.stableTiles.push({ row: 0, col: 2 })
    session.loadState(state)

    const zones = computeAnimalZones(player)
    const stableZone = zones.find(z => z.zoneType === 'stable')
    expect(stableZone).toBeDefined()
    expect(stableZone!.capacity).toBe(1) // default, no bonus
  })
})
