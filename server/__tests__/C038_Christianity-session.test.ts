import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/C/C038_Christianity'

const CARD_ID = 'C038_Christianity'

const setup = (sheep: number) => {
  const session = new GameSession(38, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.resources.food = 0
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.resources.sheep = sheep
  player.pastures = [{
    id: 'pasture',
    size: 1,
    tiles: [{ row: 0, col: 2 }],
    stables: 0,
    animalType: sheep === 0 ? null : 'sheep',
    animalCount: sheep,
  }]
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
  while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
  }
  return response
}

describe('C038 Christianity parity', () => {
  it('C038 S1: exactly one sheep lets Christianity give one food to every other player', () => {
    const response = playMinor(setup(1))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 1, 1])
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C038 S2: no sheep keeps Christianity unavailable', () => {
    const response = playMinor(setup(0))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 0, 0])
  })

  it('C038 S3: two sheep keep Christianity unavailable', () => {
    const response = playMinor(setup(2))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 0, 0])
  })
})
