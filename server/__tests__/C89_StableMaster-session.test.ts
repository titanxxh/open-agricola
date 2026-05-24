import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

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

  it('onBuy returns optional stables flow with cost override -1 wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C89_StableMaster')
    player.resources.wood = 1
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C89_StableMaster', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('stables')
    expect(leaf.optional).toBe(true)
    expect(leaf.actionContext).toMatchObject({
      max: 1,
      costOverride: { wood: -1 },
      trueAction: false,
    })
  })

  it('onBuy skipped if player has 4 stables built', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C89_StableMaster')
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 },
    ]
    player.resources.wood = 5
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C89_StableMaster', 'onBuy')
    expect(flow).toBeNull()
  })

  it('onBuy skipped if consumed stable tokens exhaust reserve', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C89_StableMaster')
    player.resources.wood = 5
    player.supplyTokensConsumed = { stable: 4 }
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C89_StableMaster', 'onBuy')
    expect(flow).toBeNull()
  })

  it('onBuy skipped if player has no wood', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C89_StableMaster')
    player.resources.wood = 0
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C89_StableMaster', 'onBuy')
    expect(flow).toBeNull()
  })
})
