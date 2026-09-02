import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C083_EarlyCattle'

const CARD_ID = 'C083_EarlyCattle'

const setup = (withPasture: boolean) => {
  const session = new GameSession(83, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.resources.cattle = 0
  player.pastures = withPasture ? [{
    id: 'pasture',
    size: 1,
    tiles: [{ row: 0, col: 2 }],
    stables: 0,
    animalType: null,
    animalCount: 0,
  }] : []
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

describe('C083 Early Cattle parity', () => {
  it('C083 S1: one pasture lets Early Cattle grant two cattle', () => {
    const session = setup(true)
    let response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.cattle).toBe(2)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })

    response = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'pasture', zoneType: 'pasture', animalType: 'cattle', animalCount: 2 }],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'cattle', animalCount: 2 })
  })

  it('C083 S2: no pasture keeps Early Cattle unavailable', () => {
    const response = playMinor(setup(false))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
  })
})
