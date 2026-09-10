import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { A020_DoubleTurnPlow } from '../../shared/cards/A/A020_DoubleTurnPlow'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const CARD_ID = 'A020_DoubleTurnPlow'
const FILLER = '__test_placeholder__'

const setup = ({ round = 3, food = round > 3 ? 1 : 0 } = {}) => {
  const session = new GameSession(7020 + round, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  state.players[0]!.minorHand = [CARD_ID]
  state.players[0]!.resources.grain = 1
  state.players[0]!.resources.food = food
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === CARD_ID)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

const choosePlow = (session: GameSession, response: SessionResponse) => {
  for (let guard = 0; guard < 4
    && response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'choice'; guard += 1) {
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(
    response.interaction.playerIndex, { tile: response.interaction.request.farm.selectableTiles[0]! },
  )
}

describe('A020_DoubleTurnPlow prerequisite', () => {
  it('blocks when round > 5', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.round = 6
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A020_DoubleTurnPlow, state.round, state)).toBe(false)
  })

  it('allows when round <= 5', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    const state = session.getState().state
    state.round = 5
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A020_DoubleTurnPlow, state.round, state)).toBe(true)
  })
})

describe('A020 Double-Turn Plow parity', () => {
  it('A020 S1: in round three one grain plays Double-Turn Plow and may plow two fields', () => {
    const session = setup()
    let response = playMinor(session)
    response = choosePlow(session, response)
    response = choosePlow(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields).toHaveLength(2)
  })

  it('A020 S2: in round four Double-Turn Plow additionally costs one food and may be declined', () => {
    const session = setup({ round: 4 })
    let response = playMinor(session)
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 0 })
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })

  it('A020 S3: round five is the last round in which Double-Turn Plow is available', () => {
    const available = playMinor(setup({ round: 5 }))
    expect(available.state.players[0]!.minorPlayed).toContain(CARD_ID)

    const late = playMinor(setup({ round: 6 }))
    expect(late.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(late.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
  })
})
