import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { PlayerState } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B132_EstateMaster'

const CARD_ID = 'B132_EstateMaster'

const fillFarm = (player: PlayerState): void => {
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
  player.pastures = [{
    id: `${player.id}-pasture`,
    size: 5,
    tiles: [
      { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 },
      { row: 2, col: 3 }, { row: 2, col: 4 },
    ],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
  player.stableTiles = []
}

const fillFarmMinusOne = (player: PlayerState): void => {
  fillFarm(player)
  player.pastures = [{
    id: `${player.id}-pasture`,
    size: 4,
    tiles: [
      { row: 2, col: 0 }, { row: 2, col: 1 },
      { row: 2, col: 2 }, { row: 2, col: 3 },
    ],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }]
}

const setup = () => {
  const session = new GameSession(132, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 4
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.resources.food = 20
    markAllWorkersUsed(state, player)
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [CARD_ID]
  owner.playedCards = [`occupation:${CARD_ID}`]
  return { session, state, owner }
}

const expectEstateBonus = (
  resp: ReturnType<GameSession['getState']>,
  expected: number,
) => {
  const category = resp.scores[0]!.categories.find((entry) => entry.key === 'cardBonusVp')
  expect(category?.total ?? 0).toBe(expected)
  const entries = category?.entries.filter((entry) =>
    entry.type === 'bonus' && entry.cardId === CARD_ID,
  ) ?? []
  if (expected === 0) {
    expect(entries).toEqual([])
  } else {
    expect(entries).toEqual([
      expect.objectContaining({ type: 'bonus', cardId: CARD_ID, score: expected }),
    ])
  }
}

const reaped = (
  resp: ReturnType<GameSession['getState']>,
  resource: 'grain' | 'vegetable',
) => {
  const playerName = resp.state.players[0]!.name
  return resp.state.log
    .filter((entry) => entry.key === 'log.reapDetail' && entry.params?.player === playerName)
    .reduce((total, entry) => {
      const resources = entry.params?.resources as Partial<Record<'grain' | 'vegetable', number>>
      return total + (resources[resource] ?? 0)
    }, 0)
}

const expectWorkIdle = (
  resp: ReturnType<GameSession['getState']>,
  round: number,
) => {
  expect(resp.state.round).toBe(round)
  expect(resp.state.roundPhase).toBe('work')
  expect(resp.interaction.stateId).toBe('idle')
  expect(resp.interaction.allowedCommands).toEqual(['takeAction'])
}

const bonusCounterEvents = (resp: ReturnType<GameSession['getState']>) => {
  const events = resp.state.events.filter((event) =>
    event.type === 'card.stateChanged' && event.sourceCardId === CARD_ID && event.key === 'bonusVp')
  expect(events.every((event) => !Object.hasOwn(event, 'value'))).toBe(true)
  return events
}

describe('B132_EstateMaster session', () => {
  it('scores no bonus while at least one farmyard space is unused', () => {
    const { session, state, owner } = setup()
    fillFarmMinusOne(owner)
    owner.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expectWorkIdle(resp, 5)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
    expect(bonusCounterEvents(resp)).toHaveLength(0)
    expect(resp.state.events.some((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID,
    )).toBe(false)
    expect(reaped(resp, 'vegetable')).toBe(1)
    expectEstateBonus(resp, 0)
  })

  it('records and scores 1 bonus VP for 1 harvested vegetable', () => {
    const { session, state, owner } = setup()
    fillFarm(owner)
    owner.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expectWorkIdle(resp, 5)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(bonusCounterEvents(resp)).toHaveLength(1)
    expect(resp.state.events.filter((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID,
    )).toHaveLength(1)
    expect(reaped(resp, 'vegetable')).toBe(1)
    expectEstateBonus(resp, 1)
  })

  it('records and scores 2 bonus VP for 2 harvested vegetables', () => {
    const { session, state, owner } = setup()
    fillFarm(owner)
    owner.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    owner.fields[1]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expectWorkIdle(resp, 5)
    expect(resp.state.players[0]!.resources.vegetable).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
    expect(bonusCounterEvents(resp)).toHaveLength(1)
    expect(resp.state.events.filter((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID,
    )).toHaveLength(1)
    expect(reaped(resp, 'vegetable')).toBe(2)
    expectEstateBonus(resp, 2)
  })

  it('does not score for harvested grain', () => {
    const { session, state, owner } = setup()
    fillFarm(owner)
    owner.fields[0]!.stacks = [{ kind: 'grain', remaining: 3 }]
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expectWorkIdle(resp, 5)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBeUndefined()
    expect(bonusCounterEvents(resp)).toHaveLength(0)
    expect(resp.state.events.some((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID,
    )).toBe(false)
    expect(reaped(resp, 'grain')).toBe(1)
    expect(reaped(resp, 'vegetable')).toBe(0)
    expectEstateBonus(resp, 0)
  })

  it('keeps bonus VP cumulative across harvests', () => {
    const { session, state, owner } = setup()
    fillFarm(owner)
    owner.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
    session.loadState(state)

    let resp = session.performRoundEnd()
    expectWorkIdle(resp, 5)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(bonusCounterEvents(resp)).toHaveLength(1)
    expect(reaped(resp, 'vegetable')).toBe(1)
    expectEstateBonus(resp, 1)

    const nextHarvest = resp.state
    nextHarvest.round = 7
    nextHarvest.roundPhase = 'work'
    nextHarvest.players.forEach((player) => {
      player.resources.food = 20
      markAllWorkersUsed(nextHarvest, player)
    })
    session.loadState(nextHarvest)
    resp = session.performRoundEnd()

    expectWorkIdle(resp, 8)
    expect(resp.state.players[0]!.resources.vegetable).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
    expect(bonusCounterEvents(resp)).toHaveLength(2)
    expect(reaped(resp, 'vegetable')).toBe(2)
    expectEstateBonus(resp, 2)
  })

  it('stays active after a real plow fills the farm and a space later becomes unused', () => {
    const session = new GameSession(132, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.resources.food = 20
    })
    const owner = state.players[0]!
    owner.occupationPlayed = [CARD_ID]
    owner.playedCards = [`occupation:${CARD_ID}`]
    fillFarmMinusOne(owner)
    session.loadState(state)

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') {
      throw new Error('expected plow selection')
    }
    const lastSpace = resp.interaction.request.farm.selectableTiles.find((tile) =>
      tile.row === 2 && tile.col === 4)
    expect(lastSpace).toBeDefined()
    resp = session.commitSelectionChoice(0, { tile: lastSpace! })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.saturated).toBe(true)
    expect(resp.state.events).toContainEqual(expect.objectContaining({
      type: 'card.stateChanged',
      sourceCardId: CARD_ID,
      key: 'saturated',
      targetPlayerId: resp.state.players[0]!.id,
    }))

    const harvestState = resp.state
    harvestState.round = 4
    harvestState.roundPhase = 'work'
    harvestState.players.forEach((player) => {
      player.resources.food = 20
      markAllWorkersUsed(harvestState, player)
    })
    harvestState.players[0]!.fields.find((field) =>
      field.row === 2 && field.col === 4)!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    session.loadState(harvestState)
    resp = session.performRoundEnd()

    expectWorkIdle(resp, 5)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(bonusCounterEvents(resp)).toHaveLength(1)
    expect(reaped(resp, 'vegetable')).toBe(1)
    expectEstateBonus(resp, 1)

    const reopenedFarm = resp.state
    const reopenedOwner = reopenedFarm.players[0]!
    reopenedOwner.fields = reopenedOwner.fields.filter((field) =>
      field.row !== 1 || field.col !== 4)
    reopenedOwner.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    reopenedFarm.round = 7
    reopenedFarm.roundPhase = 'work'
    reopenedFarm.players.forEach((player) => {
      player.resources.food = 20
      markAllWorkersUsed(reopenedFarm, player)
    })
    session.loadState(reopenedFarm)
    resp = session.performRoundEnd()

    expectWorkIdle(resp, 8)
    expect(resp.state.players[0]!.resources.vegetable).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
    expect(bonusCounterEvents(resp)).toHaveLength(2)
    expect(reaped(resp, 'vegetable')).toBe(2)
    expectEstateBonus(resp, 2)
  })
})
