import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { CUSTOM_MedievalMallet } from '../../shared/cards/community/CUSTOM_MedievalMallet'

const CARD_ID = 'CUSTOM_MedievalMallet'

void CUSTOM_MedievalMallet

const setup = (withCard: boolean) => {
  const session = new GameSession(1)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.availableMajorImprovements = ['Major_Joinery']

  const player = state.players[0]!
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
  }
  player.houseType = 'wood'
  player.rooms = 2
  player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
  player.supplyTokensConsumed = { ...player.supplyTokensConsumed, stable: 4 }
  setWorkersAtHome(state, player, 2)
  if (withCard) player.minorPlayed = [CARD_ID]

  session.loadState(state)
  return session
}

const buildOneRoom = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
    const construct = response.interaction.request.options?.find(
      option => option.labelKey === 'actions.construct.name',
    )
    expect(construct).toBeDefined()
    response = session.resolveChoice(0, construct!.value)
  }
  expect(response.ok).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected room selection')
  expect(response.interaction.request.kind).toBe('farm-select')
  if (response.interaction.request.kind !== 'farm-select') throw new Error('expected farm selection')
  expect(response.interaction.request.farm.farmType).toBe('room')
  const room = response.interaction.request.farm.selectableTiles[0]
  expect(room).toBeDefined()
  return session.commitSelectionChoice(0, { rooms: [room!] })
}

const buyJoinery = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'choice'
    && response.interaction.promptKey === 'ui.interactionChooseImprovement'
  ) {
    const joinery = response.interaction.request.options?.find(
      option => option.value === 'Major_Joinery',
    )
    expect(joinery).toBeDefined()
    response = session.resolveChoice(0, joinery!.value)
  }
  return response
}

const paymentEvent = (response: SessionResponse, paymentFor: 'construct' | 'major-improvement') =>
  response.state.events.find(
    event => event.type === 'resource.paid' && event.paymentFor === paymentFor,
  )

const actionLog = (response: SessionResponse, actionId: string) =>
  response.state.log.find(entry =>
    entry.key === 'log.actionDetail'
    && typeof entry.params?.action === 'string'
    && entry.params.action.includes(actionId),
  )

describe('CUSTOM_MedievalMallet session', () => {
  it('builds a wooden room for 3 wood and records 2 wood saved', () => {
    const session = setup(true)
    session.state.players[0]!.resources.wood = 3
    session.state.players[0]!.resources.reed = 2
    session.loadState(session.state)

    const response = buildOneRoom(session)

    expect(response.ok).toBe(true)
    expect(response.interaction.promptKey).not.toBe('prompt.selectPayment')
    expect(response.state.players[0]).toMatchObject({
      rooms: 3,
      resources: { wood: 0, reed: 0 },
    })
    expect(response.state.players[0]!.roomTiles).toHaveLength(3)
    expect(paymentEvent(response, 'construct')).toMatchObject({
      resources: { wood: 3, reed: 2 },
    })
    expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.saved).toEqual({ wood: 2 })
    expect(actionLog(response, 'construct')).toBeDefined()
    expect(response.scores).toHaveLength(2)
  })

  it('buys Joinery for 2 stone and records 2 wood saved', () => {
    const session = setup(true)
    session.state.players[0]!.resources.stone = 2
    session.loadState(session.state)

    const response = buyJoinery(session)

    expect(response.ok).toBe(true)
    expect(response.interaction.promptKey).not.toBe('prompt.selectPayment')
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
    expect(paymentEvent(response, 'major-improvement')).toMatchObject({
      resources: { stone: 2 },
      bonusSources: [CARD_ID],
    })
    expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.saved).toEqual({ wood: 2 })
    expect(response.state.log.find(entry =>
      entry.key === 'log.playImprovement'
      && entry.params?.improvements === 'Major_Joinery',
    )).toBeDefined()
    expect(response.scores).toHaveLength(2)
  })

  it('pays both printed costs without the card and records no card source', () => {
    const roomSession = setup(false)
    roomSession.state.players[0]!.resources.wood = 5
    roomSession.state.players[0]!.resources.reed = 2
    roomSession.loadState(roomSession.state)

    const roomResponse = buildOneRoom(roomSession)
    expect(roomResponse.ok).toBe(true)
    expect(roomResponse.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
    expect(paymentEvent(roomResponse, 'construct')).toMatchObject({
      resources: { wood: 5, reed: 2 },
    })
    expect(paymentEvent(roomResponse, 'construct')?.bonusSources ?? []).not.toContain(CARD_ID)
    expect(readCardResourceStats(roomResponse.state.players[0]!, CARD_ID)).toBeUndefined()
    expect(actionLog(roomResponse, 'construct')).toBeDefined()
    expect(roomResponse.scores).toHaveLength(2)

    const joinerySession = setup(false)
    joinerySession.state.players[0]!.resources.wood = 2
    joinerySession.state.players[0]!.resources.stone = 2
    joinerySession.loadState(joinerySession.state)

    const joineryResponse = buyJoinery(joinerySession)
    expect(joineryResponse.ok).toBe(true)
    expect(joineryResponse.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
    expect(paymentEvent(joineryResponse, 'major-improvement')).toMatchObject({
      resources: { wood: 2, stone: 2 },
    })
    expect(paymentEvent(joineryResponse, 'major-improvement')?.bonusSources ?? []).not.toContain(CARD_ID)
    expect(readCardResourceStats(joineryResponse.state.players[0]!, CARD_ID)).toBeUndefined()
    expect(joineryResponse.state.log.find(entry =>
      entry.key === 'log.playImprovement'
      && entry.params?.improvements === 'Major_Joinery',
    )).toBeDefined()
    expect(joineryResponse.scores).toHaveLength(2)
  })
})
