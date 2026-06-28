import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/A/A011_MudPatch'
import type { ActionFlow } from '../../shared/contract/types'

describe('A011_MudPatch session', () => {
  const setup = (options?: {
    fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
  }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push('A011_MudPatch')
    if (options?.fields) {
      player.fields = options.fields
    }
    session.loadState(state)
    return session
  }

  it('onBuy returns a gain flow for 1 boar', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'A011_MudPatch', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ boar: 1 })
  })

  it('zone exists with capacity = empty field count, animalType = boar', () => {
    const session = setup({
      fields: [
        { row: 1, col: 1, stacks: [] },
        { row: 1, col: 2, stacks: [] },
        { row: 2, col: 1, stacks: [] },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:A011_MudPatch')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(3)
    expect(cardZone!.animalType).toBe('boar')
  })

  it('zone capacity changes when fields get crops', () => {
    const session = setup({
      fields: [
        { row: 1, col: 1, stacks: [] },
        { row: 1, col: 2, stacks: [] },
        { row: 2, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    // 2 empty fields out of 3
    let zones = computeAnimalZones(player)
    let cardZone = zones.find(z => z.id === 'card:A011_MudPatch')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)

    // Plant on another field
    player.fields[0]!.stacks.push({ kind: 'vegetable', remaining: 1 })
    zones = computeAnimalZones(player)
    cardZone = zones.find(z => z.id === 'card:A011_MudPatch')
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(1)
  })

  it('no zone when all fields are planted', () => {
    const session = setup({
      fields: [
        { row: 1, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
        { row: 1, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      ],
    })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:A011_MudPatch')
    expect(cardZone).toBeUndefined()
  })

  it('no zone when player has no fields', () => {
    const session = setup({ fields: [] })
    const state = session.getState().state
    const player = state.players[0]!

    const zones = computeAnimalZones(player)
    const cardZone = zones.find(z => z.id === 'card:A011_MudPatch')
    expect(cardZone).toBeUndefined()
  })
})
