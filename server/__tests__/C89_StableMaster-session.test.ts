import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/C/C89_StableMaster'
import '../../shared/cards/C/C88_CarpentersApprentice'

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

  it('onBuy returns optional stables flow with exact 1 wood cost', () => {
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
      exactCost: { wood: 1 },
      trueAction: false,
    })
    expect(leaf.actionContext?.costOverride).toBeUndefined()
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

  it('onBuy returns stables flow even when wood is paid by a stables cost modifier', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C89_StableMaster')
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
    player.resources.wood = 0
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C89_StableMaster', 'onBuy')
    expect(flow).not.toBeNull()
  })

  it('onBuy stable can be built with C88 discount and no wood', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const player = state.players[0]!
    player.occupationPlayed = ['C88_CarpentersApprentice']
    player.occupationHand = ['C89_StableMaster']
    player.resources.food = 10
    player.resources.wood = 0
    player.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
    session.loadState(state)

    const action = session.takeAction(0, 'lessons-4')
    expect(action.ok).toBe(true)
    expect(action.interaction.stateId).toBe('wait')
    if (action.interaction.stateId !== 'wait') return
    const stableOption = action.interaction.options?.find((entry) => entry.labelKey === 'actions.stables.name')
    expect(stableOption).toBeDefined()

    const prompt = session.resolveChoice(0, stableOption!.value)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.stateId).toBe('wait')
    if (prompt.interaction.stateId !== 'wait') return
    expect(prompt.interaction.request.kind).toBe('farm-select')

    const built = session.commitSelectionChoice(0, {
      stables: [{ row: 1, col: 4 }],
    })
    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.stableTiles).toHaveLength(3)
  })
})
