import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/A/A77_Hod'
import type { ActionFlow } from '../../shared/game/types'
import { confirmPlayerSwitch } from './_helpers/legacy-confirms'

describe('A77_Hod session', () => {
  const setup = (currentPlayerIndex = 0) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1

    const owner = state.players[0]!
    owner.minorHand.push('A77_Hod')
    setWorkersAtHome(state, owner, 2)
    owner.resources.clay = 0
    // Give pasture for boar placement
    owner.pastures = [{
      id: 'p1', size: 4,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 1, animalType: null, animalCount: 0,
    }]

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.pastures = [{
      id: 'p2', size: 4,
      tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 3, col: 0 }, { row: 3, col: 1 }],
      stables: 1, animalType: null, animalCount: 0,
    }]

    // Ensure pig-market has accumulated resources
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1

    session.loadState(state)
    session.devPlayCard(0, 'A77_Hod')
    return session
  }

  it('onBuy grants 1 clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'A77_Hod', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ clay: 1 })
  })

  it('owner gets 2 clay when owner uses pig-market', () => {
    const session = setup(0)
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)

    // pig-market gives boar -> animalReorg
    if (resp.interaction.stateId === 'wait' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
      ])
    }

    // Walk through player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 2)
  })

  it('owner gets 2 clay when opponent uses pig-market', () => {
    const session = setup(1)
    const state = session.getState().state
    const ownerClayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    let resp = session.takeAction(1, 'pig-market')
    expect(resp.ok).toBe(true)

    // pig-market gives boar -> animalReorg for opponent
    if (resp.interaction.stateId === 'wait' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(1, 'confirm', [
        { id: 'p2', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
      ])
    }

    // Walk through player switches for card effect
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(ownerClayBefore + 2)
  })

  it('does not trigger on non-pig-market spaces', () => {
    const session = setup(0)
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore)
  })
})
