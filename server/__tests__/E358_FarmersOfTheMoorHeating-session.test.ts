import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { Scoring } from '../../shared/domain'

const prepareHands = (session: GameSession) => {
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
}

const prepareHarvest = (session: GameSession) => {
  prepareHands(session)
  session.state.round = 4
  for (const player of session.state.players) {
    markAllWorkersUsed(session.state, player)
  }
}

const feedRequest = (session: GameSession) => {
  const interaction = session.getState().interaction
  expect(interaction.stateId).toBe('wait')
  expect(interaction.request.kind).toBe('feed')
  return interaction
}

const heatingRequest = (session: GameSession, playerIndex: number, required: number) => {
  const interaction = session.getState().interaction
  expect(interaction.stateId).toBe('wait')
  const request = interaction.request as { kind: string; required: number; maxFuelPayable?: number; maxWoodConvertibleToFuel?: number }
  expect(request.kind).toBe('heating')
  expect(interaction.playerIndex).toBe(playerIndex)
  expect(request.required).toBe(required)
  return request
}

const confirmHeating = (
  session: GameSession,
  playerIndex: number,
  payload: { fuelUsed: number; woodToFuel: number },
) => session.resolveChoice(playerIndex, 'confirm', payload)

const confirmNext = (session: GameSession) => {
  const pending = session.getState().interaction
  expect(pending.stateId).toBe('wait')
  expect(pending.request.kind).toBe('confirm-next-player')
  return session.resolveChoice(pending.playerIndex, 'confirm')
}

describe('Farmers of the Moor heating, sick workers, and Infirmary', () => {
  it('charges heating by room count with house discounts and a zero floor', () => {
    const session = new GameSession(51, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    prepareHarvest(session)
    const [p1, p2] = session.state.players
    p1!.resources.food = 10
    p1!.resources.fuel = 10
    p1!.rooms = 3
    p1!.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]
    p2!.resources.food = 10
    p2!.resources.fuel = 10
    p2!.houseType = 'clay'
    p2!.rooms = 3
    p2!.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]

    expect(session.performRoundEnd().ok).toBe(true)
    heatingRequest(session, 0, 3)
    confirmHeating(session, 0, { fuelUsed: 3, woodToFuel: 0 })
    heatingRequest(session, 1, 2)

    const stoneSession = new GameSession(52, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    prepareHarvest(stoneSession)
    for (const player of stoneSession.state.players) {
      player.resources.food = 10
      player.houseType = 'stone'
      player.rooms = 1
      player.roomTiles = [{ row: 0, col: 0 }]
    }

    const resp = stoneSession.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' && (resp.interaction.request as { kind: string }).kind === 'heating').toBe(false)
    expect(stoneSession.state.players[0]!.sickWorkerIds).toEqual([])
  })

  it('resolves food feeding before heating for the same player', () => {
    const session = new GameSession(53, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    prepareHarvest(session)
    const [p1, p2] = session.state.players
    p1!.resources.food = 0
    p1!.resources.grain = 1
    p1!.resources.fuel = 2
    p2!.resources.food = 0
    p2!.resources.grain = 1
    p2!.resources.fuel = 2

    expect(session.performRoundEnd().ok).toBe(true)
    expect(feedRequest(session).playerIndex).toBe(0)
    session.resolveChoice(0, 'confirm', { selections: [] })

    heatingRequest(session, 0, 2)
  })

  it('requires explicit wood-to-fuel conversion and allows deterministic underpay sickness', () => {
    const session = new GameSession(54, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    prepareHarvest(session)
    const [p1, p2] = session.state.players
    p1!.resources.food = 10
    p1!.resources.fuel = 1
    p1!.resources.wood = 1
    p2!.resources.food = 10
    p2!.resources.fuel = 2
    p2!.resources.wood = 2

    expect(session.performRoundEnd().ok).toBe(true)
    const p1Heat = heatingRequest(session, 0, 2)
    expect(p1Heat.maxFuelPayable).toBe(1)
    expect(p1Heat.maxWoodConvertibleToFuel).toBe(1)
    confirmHeating(session, 0, { fuelUsed: 2, woodToFuel: 1 })
    expect(p1!.resources.wood).toBe(0)
    expect(p1!.resources.fuel).toBe(0)
    expect(p1!.sickWorkerIds).toEqual([])

    heatingRequest(session, 1, 2)
    confirmHeating(session, 1, { fuelUsed: 0, woodToFuel: 0 })
    expect(p2!.resources.fuel).toBe(2)
    expect(p2!.resources.wood).toBe(2)
    expect(p2!.sickWorkerIds).toEqual(['2', '1'])
  })

  it('does not request heating during a Through the Seasons summer harvest', () => {
    const session = new GameSession(55, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
      enableThroughTheSeasons: true,
    })
    prepareHarvest(session)
    session.state.throughTheSeasons!.currentSeason = 'summer'
    for (const player of session.state.players) {
      player.resources.food = 10
      player.resources.fuel = 0
    }

    const resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' && (resp.interaction.request as { kind: string }).kind === 'heating').toBe(false)
    expect(session.state.players[0]!.sickWorkerIds).toEqual([])
    expect(session.state.players[1]!.sickWorkerIds).toEqual([])
  })

  it('restricts sick workers to multi-occupancy Infirmary and clears them on return home', () => {
    const session = new GameSession(56, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    prepareHands(session)
    const [p1, p2] = session.state.players
    p1!.sickWorkerIds = ['2']
    p2!.sickWorkerIds = ['2']
    p1!.resources.food = 0
    p2!.resources.food = 0
    setWorkersAtHome(session.state, p1!, 1)
    setWorkersAtHome(session.state, p2!, 1)

    expect(session.takeAction(0, 'day-laborer').ok).toBe(false)
    const specialCard = session.state.farmersOfTheMoor!.specialActionCards.find((card) => card.actions.includes('hiring-fair'))!
    expect(session.takeSpecialAction(0, specialCard.id, 'hiring-fair').ok).toBe(false)

    const p1Resp = session.takeAction(0, 'moor-infirmary')
    expect(p1Resp.ok).toBe(true)
    expect(p1!.resources.food).toBe(1)
    expect(session.state.actionSpaces.find((space) => space.id === 'moor-infirmary')!.takenBy).toContainEqual({
      playerId: p1!.id,
      workerId: '2',
    })

    confirmNext(session)
    const p2Resp = session.takeAction(1, 'moor-infirmary')
    expect(p2Resp.ok).toBe(true)
    expect(p2!.resources.food).toBe(1)
    expect(session.state.actionSpaces.find((space) => space.id === 'moor-infirmary')!.takenBy).toHaveLength(2)

    confirmNext(session)
    expect(p1!.sickWorkerIds).toEqual([])
    expect(p2!.sickWorkerIds).toEqual([])
  })

  it('scores sick workers as one point instead of three', () => {
    const session = new GameSession(57, undefined, {
      playerCount: 2,
      enableFarmersOfTheMoor: true,
    })
    const player = session.state.players[0]!
    player.sickWorkerIds = ['2']

    const farmers = Scoring.breakdown(session.state, 0).categories.find((category) => category.key === 'farmers')!

    expect(farmers.quantity).toBe(2)
    expect(farmers.total).toBe(4)
  })
})
