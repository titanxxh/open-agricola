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

const bonusVp = (resp: ReturnType<GameSession['getState']>) =>
  resp.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0

describe('B132_EstateMaster session', () => {
  it('scores no bonus while at least one farmyard space is unused', () => {
    const { session, state, owner } = setup()
    fillFarmMinusOne(owner)
    owner.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(bonusVp(resp)).toBe(0)
  })

  it('records 1 bonus VP but reports it twice in the final score', () => {
    const { session, state, owner } = setup()
    fillFarm(owner)
    owner.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(bonusVp(resp)).toBe(2)
  })

  it('records each vegetable harvested but doubles the total in the final score', () => {
    const { session, state, owner } = setup()
    fillFarm(owner)
    owner.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 1 }]
    owner.fields[1]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
    expect(bonusVp(resp)).toBe(4)
  })

  it('does not score for harvested grain', () => {
    const { session, state, owner } = setup()
    fillFarm(owner)
    owner.fields[0]!.stacks = [{ kind: 'grain', remaining: 3 }]
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(bonusVp(resp)).toBe(0)
  })

  it('keeps bonus VP cumulative across harvests', () => {
    const { session, state, owner } = setup()
    fillFarm(owner)
    owner.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(bonusVp(resp)).toBe(2)

    const nextHarvest = resp.state
    nextHarvest.round = 7
    nextHarvest.roundPhase = 'work'
    nextHarvest.players.forEach((player) => {
      player.resources.food = 20
      markAllWorkersUsed(nextHarvest, player)
    })
    session.loadState(nextHarvest)
    resp = session.performRoundEnd()

    expect(resp.state.players[0]!.resources.vegetable).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
    expect(bonusVp(resp)).toBe(4)
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

    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(bonusVp(resp)).toBe(2)

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

    expect(resp.state.players[0]!.resources.vegetable).toBe(2)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
    expect(bonusVp(resp)).toBe(4)
  })
})
