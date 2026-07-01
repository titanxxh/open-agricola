import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B050_ButterChurn'
import type { ActionFlow } from '../../shared/contract/types'

describe('B050_ButterChurn — onHarvestFieldPhase uses on-board sheep+cattle (not reserve)', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('B050_ButterChurn')
    return session
  }

  it('reserve only animals: no food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 6
    player.resources.cattle = 4
    const flow = runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase')
    expect(flow).toBeNull()
  })

  it('3 sheep on board: +1 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 2, tiles: [], stables: 0, animalType: 'sheep', animalCount: 3 },
    ]
    player.resources.sheep = 3
    const flow = runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('2 cattle on board: +1 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 2, tiles: [], stables: 0, animalType: 'cattle', animalCount: 2 },
    ]
    player.resources.cattle = 2
    const flow = runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('6 sheep + 4 cattle on board: 2 + 2 = 4 food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 3, tiles: [], stables: 0, animalType: 'sheep', animalCount: 6 },
      { id: 'pa-2', size: 2, tiles: [], stables: 0, animalType: 'cattle', animalCount: 4 },
    ]
    player.resources.sheep = 6
    player.resources.cattle = 4
    const flow = runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 4 })
  })

  it('mixed (placed 3 sheep + reserve 5 sheep): +1 food (placed only)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'pa-1', size: 1, tiles: [], stables: 0, animalType: 'sheep', animalCount: 3 },
    ]
    player.resources.sheep = 8
    const flow = runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('counts sheep hosted on other players Night Pastures', () => {
    const session = new GameSession(50050, undefined, {
      playerCount: 4,
      enableFarmersOfTheMoor: true,
      allowIncompleteFarmersOfTheMoorMinorDeal: true,
    })
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = ['B050_ButterChurn']
    player.resources.sheep = 3
    state.players.slice(1).forEach((owner, index) => {
      owner.name = `Owner${index}`
      owner.minorPlayed = ['M033_NightPasture']
      const zoneId = `card:M033_NightPasture:owner:${owner.id}:animalOwner:${player.id}`
      owner.cardStates = {
        M033_NightPasture: {
          extraData: {
            animalCountsByZone: {
              [zoneId]: {
                animalCounts: { sheep: 1 },
                ownerPlayerId: owner.id,
                animalOwnerPlayerId: player.id,
                cardId: 'M033_NightPasture',
                capacity: 1,
                allowedAnimalType: null,
              },
            },
          },
        },
      }
    })

    const flow = runCardEffectHook(state, player, 'B050_ButterChurn', 'onHarvestFieldPhase')

    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })
})
