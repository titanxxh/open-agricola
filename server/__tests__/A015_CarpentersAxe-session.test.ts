import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A015_CarpentersAxe'

const CARD_ID = 'A015_CarpentersAxe'
const FILLER = '__test_placeholder__'

const setup = ({ wood = 4, forestWood = 3 } = {}) => {
  const session = new GameSession(7015, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorPlayed = [CARD_ID]
  owner.resources.wood = wood
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = forestWood
  session.loadState(state)
  return session
}

const expectStableChoice = (response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    request: { kind: 'farm-select', farm: { farmType: 'stable', maxSelections: 1 } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
    throw new Error('expected Carpenter Axe stable selection')
  }
  return response.interaction.request.farm.selectableTiles[0]!
}

const acceptCarpentersAxe = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe("A015 Carpenter's Axe parity", () => {
  it('A015 S1: reaching seven wood from Forest may build exactly one stable for one wood', () => {
    const session = setup()
    let response = acceptCarpentersAxe(session, session.takeAction(0, 'forest'))
    const target = expectStableChoice(response)

    response = session.commitSelectionChoice(0, { stables: [target] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(6)
    expect(response.state.players[0]!.stableTiles).toEqual([target])
  })

  it('A015 S2: the Carpenter Axe stable may be declined without paying wood', () => {
    const session = setup()
    const pending = session.takeAction(0, 'forest')
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })

    const response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(7)
    expect(response.state.players[0]!.stableTiles).toEqual([])
  })

  it('A015 S3: ending below seven wood offers no Carpenter Axe stable', () => {
    const response = setup({ wood: 3 }).takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(6)
    expect(response.interaction).not.toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    expect(response.state.players[0]!.stableTiles).toEqual([])
  })

  it('A015 S4: non-wood accumulation spaces do not trigger Carpenter Axe', () => {
    const session = setup({ wood: 7 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(7)
    expect(response.interaction).not.toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    expect(response.state.players[0]!.stableTiles).toEqual([])
  })
})
