import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/C/C068_Bookcase'
import '../../shared/cards/B/B121_Geologist'

const CARD_ID = 'C068_Bookcase'
const OCCUPATION_ID = 'B121_Geologist'

const setupPlay = (withOccupation = true) => {
  const session = new GameSession(68, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationPlayed = withOccupation ? ['A116_WoodCutter'] : []
  player.resources = { ...player.resources, wood: 2, vegetable: 0 }
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response: SessionResponse = session.takeAction(0, 'major-improvement')
  for (let step = 0; step < 3 && response.state.players[0]!.minorHand.includes(CARD_ID); step++) {
    if (response.interaction.stateId !== 'wait') break
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-'),
    )
    if (!option) break
    response = session.resolveChoice(0, option.value)
  }
  return response
}

const setupTrigger = (activePlayerIndex: number) => {
  const session = new GameSession(680, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = activePlayerIndex
  state.round = 14
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['__test_placeholder__']
    player.resources.vegetable = 0
    player.resources.food = 2
  })
  state.players[0]!.minorPlayed = [CARD_ID]
  state.players[activePlayerIndex]!.occupationHand = [OCCUPATION_ID]
  session.loadState(state)
  return session
}

describe('C068 Bookcase parity', () => {
  it('C068 S1: one occupation lets Bookcase cost two wood and stay in play', () => {
    const response = playMinor(setupPlay())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, vegetable: 0 })
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C068 S2: playing a later occupation grants one vegetable', () => {
    const session = setupTrigger(0)
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('C068 S3: another player playing an occupation grants the owner no vegetable', () => {
    const response = setupTrigger(1).takeAction(1, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players.map((player) => player.resources.vegetable)).toEqual([0, 0])
  })

  it('C068 S4: no occupation keeps Bookcase unavailable', () => {
    const response = playMinor(setupPlay(false))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })
})
