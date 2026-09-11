import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { commitFirstPlow, setupSowingSession, sowOptions } from './_helpers/batch07-sowing'

import '../../shared/cards/A/A018_WheelPlow'

const CARD_ID = 'A018_WheelPlow'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

const setup = ({ played = true } = {}) => {
  const session = new GameSession(7018, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    player.fields = []
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.occupationPlayed = OCCUPATIONS
  owner.resources.wood = 2
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === CARD_ID)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

const acceptWheelPlow = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let guard = 0; guard < 6; guard += 1) {
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind === 'farm-select') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }
  return response
}

const commitPlow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(
    response.interaction.playerIndex, { tile: response.interaction.request.farm.selectableTiles[0]! },
  )
}

describe('A018 Wheel Plow parity', () => {
  it('A018 S1: two occupations and two wood allow Wheel Plow to be played', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A018 S2: first-person Farmland plows its normal field before two additional fields in OA', () => {
    const session = setup()
    let response = commitPlow(session, session.takeAction(0, 'farmland'))
    response = acceptWheelPlow(session, response)
    response = commitPlow(session, response)
    response = acceptWheelPlow(session, response)
    response = commitPlow(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('A018 S3: declining the first-person bonus consumes Wheel Plow but keeps the normal plow', () => {
    const session = setup()
    let response = commitPlow(session, session.takeAction(0, 'farmland'))
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    while (response.interaction.stateId === 'wait'
      && !options(response).some((option) => option.value === '__skip__')) {
      const confirm = options(response)[0]
      expect(confirm).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, confirm!.value)
      response = resolveTriggerIfPresent(session, response, CARD_ID)
    }
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('A018 S4: Farmland used by the second person does not trigger Wheel Plow', () => {
    const session = setup()
    let response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    session.loadState(state)

    response = session.takeAction(0, 'farmland')

    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBeFalsy()
  })

  it('A018 S5: Cultivation bonus fields participate in the same sow action', () => {
    const session = setupSowingSession({ cardId: CARD_ID, grain: 3 })
    session.state.players[0]!.occupationPlayed = OCCUPATIONS
    session.loadState(session.state)

    let response = commitFirstPlow(session, session.takeAction(0, 'cultivation'))
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    const accept = sowOptions(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0, accept!.value)
    response = commitFirstPlow(session, response)
    const second = sowOptions(response).find((option) => option.value !== '__skip__')
    expect(second, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0, second!.value)
    response = commitFirstPlow(session, response)

    expect(response.state.players[0]!.fields).toHaveLength(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    const sowOption = sowOptions(response).find((option) =>
      option.value === 'sow' || option.labelKey === 'actions.sow.name')
    expect(sowOption, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0, sowOption!.value)
    const fields = response.state.players[0]!.fields
    response = session.commitSelectionChoice(0, {
      crops: fields.map(({ row, col }) => ({ row, col, crop: 'grain' as const })),
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.map((field) => field.stacks[0]?.remaining)).toEqual([3, 3, 3])
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})
