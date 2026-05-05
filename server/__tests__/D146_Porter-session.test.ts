import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { confirmPlayerSwitch } from './_helpers/legacy-confirms'

import '../../shared/cards/D/D146_Porter'

const CARD_ID = 'D146_Porter'

describe('D146_Porter session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  it('gains 1 clay + 1 food when collecting 4+ clay from clay-pit', () => {
    const session = setup()
    const state = session.getState().state
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (!clayPit) throw new Error('clay-pit space missing')
    clayPit.resources.clay = 4
    session.loadState(state)

    const clayBefore = session.getState().state.players[0]!.resources.clay
    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // +4 clay from space, +1 clay + 1 food from Porter
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 4 + 1)
    expect(after.players[0]!.resources.food).toBe(foodBefore + 1)
  })

  it('gains 1 wood + 1 food when collecting 4+ wood from forest', () => {
    const session = setup()
    const state = session.getState().state
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (!forest) throw new Error('forest space missing')
    forest.resources.wood = 4
    session.loadState(state)

    const woodBefore = session.getState().state.players[0]!.resources.wood
    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // +4 wood from space, +1 wood + 1 food from Porter
    expect(after.players[0]!.resources.wood).toBe(woodBefore + 4 + 1)
    expect(after.players[0]!.resources.food).toBe(foodBefore + 1)
  })

  it('does not trigger when collecting less than 4 building resources', () => {
    const session = setup()
    const state = session.getState().state
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (!clayPit) throw new Error('clay-pit space missing')
    clayPit.resources.clay = 3
    session.loadState(state)

    const clayBefore = session.getState().state.players[0]!.resources.clay
    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // +3 clay from space, no porter bonus
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 3)
    expect(after.players[0]!.resources.food).toBe(foodBefore)
  })

  it('does not trigger for non-building resources (e.g. sheep)', () => {
    const session = setup()
    const state = session.getState().state
    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market space missing')
    sheepMarket.resources.sheep = 4
    session.loadState(state)

    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)

    // Handle animalReorg for sheep
    if (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(0, 'confirm', [
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 4 },
      ])
    }

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // No porter bonus — sheep is not a building resource
    expect(after.players[0]!.resources.food).toBe(foodBefore)
  })
})
