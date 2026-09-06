import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C076_WoodCart'

const CARD_ID = 'C076_WoodCart'
const FILLER = '__test_placeholder__'

const setup = ({ played = false, wood = 3, occupations = 3, actor = 0 } = {}) => {
  const session = new GameSession(5076, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    player.resources.wood = 0
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.occupationPlayed = Array.from({ length: occupations }, (_, index) => `STUB_OCC_${index}`)
  player.resources.wood = wood
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)

const setSpaceResource = (session: GameSession, spaceId: string, resource: 'wood' | 'clay', count: number) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
  space.resources[resource] = count
  session.loadState(state)
}

describe('C076 Wood Cart parity', () => {
  it('C076 S1: three occupations and three wood play Wood Cart', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C076 S2: two occupations keep Wood Cart unavailable without spending wood', () => {
    const response = enterMinor(setup({ occupations: 2 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(3)
  })

  it('C076 S3: using a wood accumulation space grants two wood beyond the collected pile', () => {
    const session = setup({ played: true, wood: 0 })
    setSpaceResource(session, 'forest', 'wood', 3)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(5)
  })

  it('C076 S4: using a non-wood accumulation space grants no bonus wood', () => {
    const session = setup({ played: true, wood: 0 })
    setSpaceResource(session, 'clay-pit', 'clay', 2)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, wood: 0 })
  })

  it('C076 S5: another player using a wood accumulation space grants the owner no wood', () => {
    const session = setup({ played: true, wood: 0, actor: 1 })
    setSpaceResource(session, 'forest', 'wood', 3)

    const response = session.takeAction(1, 'forest')

    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[1]!.resources.wood).toBe(3)
  })
})
