import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { ActionChoiceOption, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/B/B132_EstateMaster'
import '../../shared/cards/B/B50_ButterChurn'
import '../../shared/cards/D/D38_MilkingStool'
import '../../shared/cards/D/D72_StableManure'
import '../../shared/cards/E/E112_GrainThief'

describe('harvest reaction flow', () => {
  const fillFarm = (player: PlayerState) => {
    player.rooms = 4
    player.roomTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 },
      { row: 1, col: 0 }, { row: 1, col: 1 },
    ]
    player.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 0, col: 3, stacks: [] },
      { row: 0, col: 4, stacks: [] },
      { row: 1, col: 2, stacks: [] },
      { row: 1, col: 3, stacks: [] },
      { row: 1, col: 4, stacks: [] },
    ]
    player.pastures = [
      {
        id: `${player.id}-pasture`,
        size: 5,
        tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]
    player.stableTiles = []
  }

  const setupHarvestSession = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.currentPlayerIndex = 0
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 20
      setActiveWorkerCount(player, 1)
      markAllWorkersUsed(state, player)
    })
    return { session, state }
  }

  const resolveCardTrigger = (
    session: GameSession,
    resp: ReturnType<GameSession['performRoundEnd']>,
    cardId: string,
  ) => {
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected trigger-select')
    const option = resp.interaction.options?.find((entry: ActionChoiceOption) => entry.value === cardId)
    expect(option).toBeDefined()
    return session.resolveChoice(resp.interaction.playerIndex, option!.value)
  }

  const acceptOptional = (
    session: GameSession,
    resp: ReturnType<GameSession['performRoundEnd']>,
  ) => {
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional choice')
    const option = resp.interaction.options?.find((entry: ActionChoiceOption) => entry.value !== '__skip__')
    expect(option).toBeDefined()
    return session.resolveChoice(resp.interaction.playerIndex, option!.value)
  }

  it('auto-runs mandatory non-interactive harvest field hooks without trigger-select pending', () => {
    const { session, state } = setupHarvestSession()
    const player = state.players[0]!
    player.minorPlayed.push('B50_ButterChurn')
    player.pastures = [
      { id: 'sheep-pasture', size: 3, tiles: [], stables: 0, animalType: 'sheep', animalCount: 3 },
      { id: 'cattle-pasture', size: 2, tiles: [], stables: 0, animalType: 'cattle', animalCount: 2 },
    ]

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(5)
    expect(resp.state.players[0]!.resources.food).toBe(20)
  })

  it('auto-runs Milking Stool without trigger-select pending', () => {
    const { session, state } = setupHarvestSession()
    const player = state.players[0]!
    player.occupationPlayed.push('D38_MilkingStool')
    player.resources.cattle = 1
    player.houseAnimalType = 'cattle'
    player.houseAnimalCount = 1

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(5)
    expect(resp.state.players[0]!.resources.food).toBe(19)
  })

  it('keeps Stable Manure harvest field selection interactive', () => {
    const { session, state } = setupHarvestSession()
    const player = state.players[0]!
    player.minorPlayed.push('D72_StableManure')
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ]
    player.stableTiles = [{ row: 2, col: 2 }]
    player.pastures = []

    session.loadState(state)
    let resp = session.performRoundEnd()
    resp = resolveCardTrigger(session, resp, 'D72_StableManure')
    resp = acceptOptional(session, resp)

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.sourceCard).toBe('D72_StableManure')
    expect(resp.interaction.selection?.kind).toBe('farm-position')
  })

  it('keeps Grain Thief harvest field selection interactive', () => {
    const { session, state } = setupHarvestSession()
    const player = state.players[0]!
    player.occupationPlayed.push('E112_GrainThief')
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]

    session.loadState(state)
    let resp = session.performRoundEnd()
    resp = resolveCardTrigger(session, resp, 'E112_GrainThief')
    resp = acceptOptional(session, resp)

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.sourceCard).toBe('E112_GrainThief')
    expect(resp.interaction.selection?.kind).toBe('farm-position')
  })

  it('keeps reap reaction bonus VP on each reacting owner during multiplayer harvest', () => {
    const { session, state } = setupHarvestSession()
    state.players.forEach((player) => {
      player.occupationPlayed.push('B132_EstateMaster')
      player.playedCards = [...(player.playedCards ?? []), 'occupation:B132_EstateMaster']
      fillFarm(player)
      player.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    })

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.cardStates.B132_EstateMaster?.counters?.bonusVp).toBe(1)
    expect(resp.state.players[1]!.cardStates.B132_EstateMaster?.counters?.bonusVp).toBe(1)
  })
})
