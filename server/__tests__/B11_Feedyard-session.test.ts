import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/game/types'

import '../../shared/cards/B/B11_Feedyard'

describe('B11_Feedyard session', () => {
  const setup = (options?: {
    pastures?: {
      id: string
      size: number
      tiles: { row: number; col: number }[]
      stables: number
      animalType: 'sheep' | 'boar' | 'cattle' | null
      animalCount: number
    }[]
  }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push('B11_Feedyard')
    if (options?.pastures) {
      player.pastures = options.pastures
    }
    session.loadState(state)
    return session
  }

  it('zone capacity equals pasture count, any animal type', () => {
    const session = setup({
      pastures: [
        { id: 'p1', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
        { id: 'p2', size: 2, tiles: [{ row: 2, col: 3 }, { row: 2, col: 4 }], stables: 0, animalType: null, animalCount: 0 },
        { id: 'p3', size: 1, tiles: [{ row: 3, col: 2 }], stables: 1, animalType: null, animalCount: 0 },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:B11_Feedyard')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(3)
    expect(cardZone!.animalType).toBeNull()
  })

  it('zone capacity updates when pastures change', () => {
    const session = setup({
      pastures: [
        { id: 'p1', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    let zones = computeAnimalZones(player)
    let cardZone = zones.find(z => z.id === 'card:B11_Feedyard')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(1)

    // Add another pasture
    player.pastures.push({
      id: 'p2', size: 1, tiles: [{ row: 3, col: 2 }], stables: 0, animalType: null, animalCount: 0,
    })
    zones = computeAnimalZones(player)
    cardZone = zones.find(z => z.id === 'card:B11_Feedyard')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)
  })

  it('no zone when player has no pastures', () => {
    const session = setup({ pastures: [] })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:B11_Feedyard')
    expect(cardZone).toBeUndefined()
  })

  it('onEndHarvest grants 1 food per unused spot on the card zone', () => {
    // 3 pastures → capacity 3. No animals on card → 3 food.
    const session = setup({
      pastures: [
        { id: 'p1', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
        { id: 'p2', size: 1, tiles: [{ row: 2, col: 3 }], stables: 0, animalType: null, animalCount: 0 },
        { id: 'p3', size: 1, tiles: [{ row: 2, col: 4 }], stables: 0, animalType: null, animalCount: 0 },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'B11_Feedyard', 'onEndHarvest')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ food: 3 })
  })

  it('onEndHarvest grants only food for unused spots (capacity - assigned)', () => {
    // We can't easily assign animals to a card zone without board logic,
    // but BGA semantics say `n = capacity - animalCount`. With animalCount=0
    // (default since we don't track card-zone assignments here), n = capacity.
    const session = setup({
      pastures: [
        { id: 'p1', size: 2, tiles: [{ row: 2, col: 2 }, { row: 2, col: 3 }], stables: 0, animalType: null, animalCount: 0 },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'B11_Feedyard', 'onEndHarvest')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.params).toEqual({ food: 1 })
  })

  it('onEndHarvest no flow when no pastures (no zone)', () => {
    const session = setup({ pastures: [] })
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'B11_Feedyard', 'onEndHarvest')
    expect(flow).toBeNull()
  })
})
