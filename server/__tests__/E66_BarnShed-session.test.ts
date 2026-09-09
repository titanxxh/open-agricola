import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/E/E066_BarnShed'

const CARD_ID = 'E066_BarnShed'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, occupations = 3, wood = 2, actor = 0, playerCount = 2,
}: {
  played?: boolean
  occupations?: number
  wood?: number
  actor?: number
  playerCount?: number
} = {}) => {
  const session = new GameSession(7066, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.occupationPlayed = Array.from({ length: occupations }, (_, index) => 'STUB_OCC_' + index)
  owner.resources.wood = wood
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && options(response).some((option) => option.value === CARD_ID)

const setSpaceWood = (session: GameSession, spaceId: string, wood: number) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
  space.resources.wood = wood
  session.loadState(state)
}

const settlePlayerSwitches = (session: GameSession, response: SessionResponse) => {
  let settled = response
  while (
    settled.interaction.stateId === 'wait'
    && settled.interaction.request.kind === 'confirm-player-switch'
  ) {
    settled = confirmPlayerSwitch(session)
  }
  return settled
}

describe('E066 Barn Shed parity', () => {
  it('E066 S1: three occupations and two wood play Barn Shed', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('E066 S2: two occupations keep Barn Shed unavailable', () => {
    const response = enterMinor(setup({ occupations: 2 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('E066 S3: one wood keeps Barn Shed unavailable despite satisfying its prerequisite', () => {
    const response = enterMinor(setup({ wood: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('E066 S4: another player using Forest gives the Barn Shed owner one grain', () => {
    const session = setup({ played: true, wood: 0, actor: 1 })
    setSpaceWood(session, 'forest', 3)

    const response = settlePlayerSwitches(session, session.takeAction(1, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[1]!.resources.wood).toBe(3)
  })

  it('E066 S5: the owner using Forest in a multiplayer game gains no grain', () => {
    const session = setup({ played: true, wood: 0 })
    setSpaceWood(session, 'forest', 3)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, wood: 3 })
  })

  it('E066 S6: another player using Copse gains the wood but gives no Barn Shed grain', () => {
    const session = setup({ played: true, wood: 0, actor: 1, playerCount: 4 })
    setSpaceWood(session, 'copse', 2)

    const response = session.takeAction(1, 'copse')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[1]!.resources.wood).toBe(2)
  })

  it('E066 S7: solo Forest grants its accumulated wood and Barn Shed grain', () => {
    const session = setup({ played: true, wood: 0, playerCount: 1 })
    const forest = session.getState().state.actionSpaces.find((space) => space.id === 'forest')
    expect(forest).toBeDefined()
    expect(forest).toMatchObject({ gainPerRound: { wood: 2 }, descriptionKey: 'actions.forest.soloDescription' })
    const wood = forest!.resources.wood
    expect(wood).toBeGreaterThan(0)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, wood })
  })

  it('E066 S8: another player using an unrelated space gives no Barn Shed grain', () => {
    const session = setup({ played: true, wood: 0, actor: 1 })

    const response = session.takeAction(1, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})
