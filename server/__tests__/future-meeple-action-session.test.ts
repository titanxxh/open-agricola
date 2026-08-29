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
      cardId: 'A019_Handplow',
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
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
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
      cardId: 'A089_StablePlanner',
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
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionStableSelect')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.farm.maxSelections : undefined)
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
      cardId: 'D091_Plowman',
      playerId: player.id,
      round: 2,
      actionId: null,
      resources: { field: 1 } as never,
      actionContext: { exactCost: { food: 1 }, trueAction: false },
    } as never]

    session.loadState(state)
    let resp = session.performRoundEnd()
    if (resp.interaction.stateId !== 'wait') throw new Error('expected future field choice')
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow selection')
    const tile = resp.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()

    resp = session.commitSelectionChoice(0, { tile })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toHaveLength(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('can exchange before a paid future field action is checked', () => {
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
    player.improvements = ['Major_Fireplace1']
    player.resources = { ...player.resources, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 }
    state.futureMeeples = [
      {
        id: 'future-vegetable-before-paid-field',
        cardId: 'test-future-vegetable',
        playerId: player.id,
        round: 2,
        actionId: null,
        resources: { vegetable: 1 },
      },
      {
        id: 'future-paid-field-after-exchange',
        cardId: 'D091_Plowman',
        playerId: player.id,
        round: 2,
        actionId: null,
        resources: { field: 1 } as never,
        actionContext: { exactCost: { food: 1 }, trueAction: false },
      } as never,
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected future action preparation')
    const exchange = resp.interaction.request.options?.find((option) => option.labelKey === 'actions.exchange.name')
    expect(exchange).toBeDefined()

    resp = session.resolveChoice(0, exchange!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected exchange choice')
    const cookVegetable = resp.interaction.request.options?.find((option) =>
      option.effectPreview?.kind === 'resourceExchange' &&
      option.effectPreview.resourcesPaid?.vegetable === 1 &&
      option.effectPreview.resourcesGained?.food === 2,
    )
    expect(cookVegetable).toBeDefined()

    resp = session.resolveChoice(0, cookVegetable!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected future field choice')
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow selection')
    const tile = resp.interaction.request.farm.selectableTiles[0]
    expect(tile).toBeDefined()

    resp = session.commitSelectionChoice(0, { tile })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toHaveLength(1)
    expect(resp.state.players[0]!.resources).toMatchObject({ food: 1, vegetable: 0 })
  })
})
