import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/A/A050_MilkJug'

describe('A050_MilkJug session', () => {
  /**
   * Setup: 2-player game, player 0 owns MilkJug.
   * cattle-market has 1 cattle pre-loaded so the space is usable.
   * Both players get pastures so animal reorg can succeed.
   */
  const setup = (currentPlayerIndex = 0) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1

    const owner = state.players[0]!
    owner.minorPlayed.push('A050_MilkJug')
    setWorkersAtHome(state, owner, 2)
    owner.resources.food = 0
    // Give pasture so cattle placement works
    owner.pastures = [{
      id: 'p1', size: 4,
      tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
      stables: 1, animalType: null, animalCount: 0,
    }]

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.resources.food = 0
    opponent.pastures = [{
      id: 'p2', size: 4,
      tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 3, col: 0 }, { row: 3, col: 1 }],
      stables: 1, animalType: null, animalCount: 0,
    }]

    // Ensure cattle-market has accumulated resources
    const cattleMarket = state.actionSpaces.find((s) => s.id === 'cattle-market')
    if (cattleMarket) cattleMarket.resources.cattle = 1

    session.loadState(state)
    return session
  }

  it('owner gets 3 food and opponent gets 1 food when owner uses cattle-market', () => {
    const session = setup(0)

    let resp = session.takeAction(0, 'cattle-market')
    expect(resp.ok).toBe(true)

    // cattle-market gives cattle -> animalReorg
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'p1', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
      ])
    }

    // Walk through player switches for card effect
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Owner gets 3 food from MilkJug
    expect(after.players[0]!.resources.food).toBe(3)
    // Opponent gets 1 food from MilkJug
    expect(after.players[1]!.resources.food).toBe(1)
  })

  it('owner gets 3 food and opponent gets 1 food when opponent uses cattle-market', () => {
    const session = setup(1)

    let resp = session.takeAction(1, 'cattle-market')
    expect(resp.ok).toBe(true)

    // cattle-market gives cattle -> animalReorg for opponent
    if (resp.interaction.stateId === 'wait' && resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(1, 'confirm', [
        { id: 'p2', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
      ])
    }

    // Walk through player switches for card effect
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Owner (player 0) gets 3 food from MilkJug
    expect(after.players[0]!.resources.food).toBe(3)
    // Opponent (player 1) who triggered gets 1 food from MilkJug's gain-other-players
    expect(after.players[1]!.resources.food).toBe(1)
  })

  it('does not trigger on non-cattle-market spaces', () => {
    const session = setup(0)
    const foodBefore = session.getState().state.players[1]!.resources.food

    // Use day-laborer instead (gives 2 food to acting player only)
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // Owner gets 2 food from day-laborer but NOT 3 from MilkJug
    expect(after.players[0]!.resources.food).toBe(2)
    // Opponent gets no food — MilkJug did not trigger
    expect(after.players[1]!.resources.food).toBe(foodBefore)
  })
})
