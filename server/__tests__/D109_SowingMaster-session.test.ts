import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D109_SowingMaster'

const CARD_ID = 'D109_SowingMaster'

const setup = ({ played = true, grain = 0 }: { played?: boolean; grain?: number } = {}) => {
  const session = new GameSession(6109, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? ['__test_placeholder__'] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.grain = grain
  session.loadState(state)
  return session
}

const chooseCardIfNeeded = (session: GameSession, response: SessionResponse, cardId: string) => {
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
}

const finishSow = (session: GameSession, response: SessionResponse, row: number, col: number) => {
  let current = response
  if (current.interaction.stateId === 'wait' && current.interaction.request.options) {
    const sow = current.interaction.request.options.find((option) => option.labelKey === 'actions.sow.name')
    if (sow) current = session.resolveChoice(current.interaction.playerIndex, sow.value)
  }
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') return current
  expect(current.interaction.request.farm.farmType).toBe('sow')
  return session.commitSelectionChoice(0, { crops: [{ row, col, crop: 'grain' }] })
}

describe('D109 Sowing Master parity', () => {
  it('D109 S1: playing Sowing Master through Lessons immediately gains one wood', () => {
    const session = setup({ played: false })

    const response = chooseCardIfNeeded(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('D109 S2: using Grain Utilization to sow gains two food', () => {
    const session = setup({ grain: 1 })
    const state = session.getState().state
    state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    session.loadState(state)

    const response = finishSow(session, session.takeAction(0, 'grain-utilization'), 0, 0)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
  })

  it('D109 S3: using Cultivation gains two food after placing the farmer', () => {
    const session = setup()

    let response = session.takeAction(0, 'cultivation')
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const field = response.interaction.request.farm.selectableTiles[0]!
    response = session.commitSelectionChoice(0, { tile: field })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('D109 S4: using an unrelated action space grants no Sowing Master food', () => {
    const session = setup()

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })
})
