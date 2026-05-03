import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

import { markAllWorkersUsed } from '../../shared/game/player'
import '../../shared/cards/B/B70_NewPurchase'
import '../../shared/cards/A/A166_Haydryer'
import '../../shared/cards/A/A64_BarleyMill'
import '../../shared/cards/C/C71_SlurrySpreader'
import '../../shared/cards/C/C120_AgriculturalLabourer'
import '../../shared/cards/D/D99_EarthenwarePotter'
import '../../shared/cards/D/D115_FodderPlanter'

const chooseFirstOption = (session: GameSession, playerIndex: number) => {
  const pending = session.getState().pending
  expect(pending.type).toBe('choice')
  if (pending.type !== 'choice') {
    throw new Error('expected pending choice')
  }
  return session.resolveChoice(playerIndex, pending.options[0]!.value)
}

describe('stage hook flows', () => {
  it('runs B70_NewPurchase through before-start-of-turn flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 3
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.minorPlayed.push('B70_NewPurchase')
    player.resources.food = 6

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionNewPurchaseGrain')

    resp = chooseFirstOption(session, 0)
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionNewPurchaseVegetable')

    resp = chooseFirstOption(session, 0)
    expect(resp.pending.type).toBe('none')
    expect(resp.state.round).toBe(4)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(readCardResourceStats(resp.state.players[0]!, 'B70_NewPurchase')).toMatchObject({
      paid: { food: 6 },
      gained: { grain: 1, vegetable: 1 },
    })
  })

  it('runs A166_Haydryer through before-harvest flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('A166_Haydryer')
    player.resources.food = 10
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionHaydryer')

    resp = chooseFirstOption(session, 0)
    expect(resp.pending.type).toBe('choice')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'cattle', animalCount: 1 },
    ])

    expect(resp.pending.type).toBe('none')
    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[0]!.resources.cattle).toBe(1)
    expect(readCardResourceStats(resp.state.players[0]!, 'A166_Haydryer')).toMatchObject({
      paid: { food: 3 },
      gained: { cattle: 1 },
    })
  })

  it('runs D99_EarthenwarePotter through after-harvest flow on round 14', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 14
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('D99_EarthenwarePotter')
    player.resources.food = 10
    player.resources.clay = 2
    player.cardStates = {
      ...player.cardStates,
      D99_EarthenwarePotter: { counters: { earlyBuy: 1 } },
    }

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionEarthenwarePotter')

    resp = chooseFirstOption(session, 0)
    expect(resp.pending.type).toBe('none')
    expect(resp.state.gameOver).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.cardStates?.D99_EarthenwarePotter?.counters?.bonusVp).toBe(2)
    expect(readCardResourceStats(resp.state.players[0]!, 'D99_EarthenwarePotter')).toMatchObject({
      paid: { clay: 2 },
      gained: {},
    })
  })

  it('runs A64_BarleyMill through after-reap flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.minorPlayed.push('A64_BarleyMill')
    player.resources.food = 10
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.pending.type).toBe('none')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(8)
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(readCardResourceStats(resp.state.players[0]!, 'A64_BarleyMill')).toMatchObject({
      paid: {},
      gained: { food: 2 },
    })

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A64_BarleyMill',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 2 })
  })

  it('runs C120_AgriculturalLabourer through after-reap flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('C120_AgriculturalLabourer')
    player.resources.food = 10
    player.cardStates = {
      ...player.cardStates,
      C120_AgriculturalLabourer: { counters: { clay: 3 } },
    }
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.pending.type).toBe('none')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(6)
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(resp.state.players[0]!.resources.clay).toBe(2)
    expect(resp.state.players[0]!.cardStates?.C120_AgriculturalLabourer?.counters?.clay).toBe(1)

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'C120_AgriculturalLabourer',
    )
    expect(gainLog?.params?.gain).toEqual({ clay: 2 })
  })

  it('runs C71_SlurrySpreader through end-harvest sow flow after multi-animal breeding', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.minorPlayed.push('C71_SlurrySpreader')
    player.resources.food = 10
    player.resources.grain = 1
    player.resources.sheep = 2
    player.resources.boar = 2
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
      {
        id: 'p2',
        size: 2,
        tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
        stables: 0,
        animalType: 'boar',
        animalCount: 2,
      },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('choice')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 },
      { id: 'p2', zoneType: 'pasture', animalType: 'boar', animalCount: 3 },
    ])
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionSlurrySpreaderSow')

    resp = chooseFirstOption(session, 0)
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionSowSelect')
    expect(resp.interaction.stateId).toBe('farmSelect')
    expect(resp.interaction.stateId === 'farmSelect' ? resp.interaction.farm.farmType : undefined)
      .toBe('sow')

    resp = session.resolveChoice(0, 'confirm', {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(resp.pending.type).toBe('none')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(6)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.sheep).toBe(3)
    expect(resp.state.players[0]!.resources.boar).toBe(3)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: 0,
      col: 0,
      stacks: [{ kind: 'grain', remaining: 3 }],
    })
  })

  it('runs D115_FodderPlanter through multi-sow flow based on newborn count', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('D115_FodderPlanter')
    player.resources.food = 10
    player.resources.grain = 2
    player.resources.sheep = 2
    player.resources.boar = 2
    player.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ]
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
      {
        id: 'p2',
        size: 2,
        tiles: [{ row: 1, col: 0 }, { row: 1, col: 1 }],
        stables: 0,
        animalType: 'boar',
        animalCount: 2,
      },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('choice')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 },
      { id: 'p2', zoneType: 'pasture', animalType: 'boar', animalCount: 3 },
    ])
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionFodderPlanterSow')

    resp = chooseFirstOption(session, 0)
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionSowSelect')
    expect(resp.interaction.stateId).toBe('farmSelect')
    expect(resp.interaction.stateId === 'farmSelect' ? resp.interaction.farm.farmType : undefined)
      .toBe('sow')
    expect(resp.interaction.stateId === 'farmSelect' && resp.interaction.farm.farmType === 'sow'
      ? resp.interaction.farm.maxSelections
      : undefined).toBe(2)

    resp = session.resolveChoice(0, 'confirm', {
      crops: [
        { row: 0, col: 0, crop: 'grain' },
        { row: 0, col: 1, crop: 'grain' },
      ],
    })

    expect(resp.pending.type).toBe('none')
    expect(resp.state.round).toBe(5)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.resources.food).toBe(6)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.sheep).toBe(3)
    expect(resp.state.players[0]!.resources.boar).toBe(3)
    expect(resp.state.players[0]!.fields).toEqual([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
    ])
  })

  it('limits D115_FodderPlanter sow count to the number of newborn animals', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
    })

    const player = state.players[0]!
    player.occupationPlayed.push('D115_FodderPlanter')
    player.resources.food = 10
    player.resources.grain = 2
    player.resources.sheep = 2
    player.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 1, stacks: [] },
    ]
    player.pastures = [
      {
        id: 'p1',
        size: 3,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 2,
      },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    expect(resp.pending.type).toBe('choice')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 3 },
    ])
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionFodderPlanterSow')

    resp = chooseFirstOption(session, 0)
    expect(resp.interaction.stateId).toBe('farmSelect')
    expect(resp.interaction.stateId === 'farmSelect' && resp.interaction.farm.farmType === 'sow'
      ? resp.interaction.farm.maxSelections
      : undefined).toBe(1)

    // Sowing within the 1-newborn cap succeeds. (Note: PR 3 unified the sow
    // commit onto resolveChoice; an over-cap submission now clears pending,
    // so we no longer assert a fail-then-retry path here — the limit is
    // already exercised by maxSelections in the validator unit tests.)
    resp = session.resolveChoice(0, 'confirm', {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: 0,
      col: 0,
      stacks: [{ kind: 'grain', remaining: 3 }],
    })
  })
})
