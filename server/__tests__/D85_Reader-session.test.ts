import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { familySize, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D085_Reader'

const CARD_ID = 'D085_Reader'

const setup = (occupationCount: number, draftMode = false, includeReader = true) => {
  const session = new GameSession(374)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 2
  state.roundPhase = 'work'
  state.phase = 'playing'
  state.draft = null
  state.draftMode = draftMode ? 'simultaneous' : undefined
  state.draftPoolSize = draftMode ? 7 : undefined
  state.players.forEach((entry, index) => setWorkersAtHome(state, entry, index === 0 ? 2 : 0))

  const player = state.players[0]!
  player.rooms = 2
  player.occupationPlayed = Array.from(
    { length: occupationCount - (includeReader ? 1 : 0) },
    (_, index) => `__reader_occupation_${index}__`,
  )
  if (includeReader) player.occupationPlayed.push(CARD_ID)
  session.loadState(state)
  return session
}

const takeFamilyGrowth = (session: GameSession) => {
  const before = familySize(session.state.players[0]!)
  const response = session.takeAction(0, 'wish-children')
  return { before, response }
}

describe('D085 Reader native session', () => {
  it('does not provide room with 5 occupations in a normal game', () => {
    const { before, response } = takeFamilyGrowth(setup(5))

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(before)
  })

  it('provides room with 6 occupations in a normal game', () => {
    const { before, response } = takeFamilyGrowth(setup(6))

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
  })

  it('currently provides room with 6 occupations after a 7-card draft', () => {
    const { before, response } = takeFamilyGrowth(setup(6, true))

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
  })

  it('provides room with 7 occupations after a 7-card draft', () => {
    const { before, response } = takeFamilyGrowth(setup(7, true))

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(before + 1)
  })

  it('does not provide room when Reader is absent', () => {
    const { before, response } = takeFamilyGrowth(setup(6, false, false))

    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(before)
  })
})
