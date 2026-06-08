import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'

describe('future meeple round-start actions', () => {
  it('offers plow when a field future meeple resolves', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })

    const player = state.players[0]!
    player.startPlayer = true
    state.futureMeeples = [{
      id: 'future-field',
      cardId: 'A19_Handplow',
      playerId: player.id,
      round: 2,
      actionId: null,
      resources: { field: 1 } as never,
    }]

    session.loadState(state)
    let resp = session.performRoundEnd()

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionOptionalAction')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected future field choice')
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionPlowSelect')
  })

  it('offers a free stable build when a stable future meeple resolves', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })

    const player = state.players[0]!
    player.startPlayer = true
    state.futureMeeples = [{
      id: 'future-stable',
      cardId: 'A89_StablePlanner',
      playerId: player.id,
      round: 2,
      actionId: null,
      resources: { stable: 1 },
    }]

    session.loadState(state)
    let resp = session.performRoundEnd()

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionOptionalAction')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected future stable choice')
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionStableSelect')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.farm.maxSelections : undefined)
      .toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(player.resources.wood)
  })

  it('applies future field actionContext cost when the plow resolves', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })

    const player = state.players[0]!
    player.startPlayer = true
    player.resources.food = 1
    state.futureMeeples = [{
      id: 'future-paid-field',
      cardId: 'D91_Plowman',
      playerId: player.id,
      round: 2,
      actionId: null,
      resources: { field: 1 } as never,
      actionContext: { exactCost: { food: 1 }, trueAction: false },
    } as never]

    session.loadState(state)
    let resp = session.performRoundEnd()
    if (resp.interaction.stateId !== 'wait') throw new Error('expected future field choice')
    const accept = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow selection')
    const tile = resp.interaction.farm.selectableTiles[0]
    expect(tile).toBeDefined()

    resp = session.commitSelectionChoice(0, { tile })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toHaveLength(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })
})
