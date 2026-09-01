import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { familySize, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D085_Reader'

const CARD_ID = 'D085_Reader'

const setup = (
  occupationCount: number,
  draftPoolSize?: 7 | 10,
  includeReader = true,
) => {
  const session = new GameSession(374, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 2
  state.roundPhase = 'work'
  state.phase = 'playing'
  state.draft = null
  state.draftMode = draftPoolSize ? 'simultaneous' : undefined
  state.draftPoolSize = draftPoolSize
  state.players.forEach((entry, index) => setWorkersAtHome(state, entry, index === 0 ? 2 : 0))

  const player = state.players[0]!
  player.rooms = 2
  player.resources.food = 20
  player.occupationPlayed = Array.from(
    { length: occupationCount - (includeReader ? 1 : 0) },
    (_, index) => `__reader_occupation_${index}__`,
  )
  if (includeReader) player.occupationHand = [CARD_ID]
  session.loadState(state)
  if (includeReader) {
    let response = session.takeAction(0, 'lessons')
    if (
      response.interaction.stateId === 'wait' &&
      response.interaction.request.options?.some((option) => option.value === CARD_ID)
    ) {
      response = session.resolveChoice(0, CARD_ID)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.occupationPlayed).toHaveLength(occupationCount)
    if (
      response.interaction.stateId === 'wait' &&
      response.interaction.request.kind === 'confirm-next-player'
    ) {
      response = session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
    }
    expect(response.interaction.stateId).toBe('idle')
  }
  return session
}

const farmersScore = (response: ReturnType<GameSession['getState']>) =>
  response.scores[0]!.categories.find((category) => category.key === 'farmers')!.total

const expectFamilyGrowth = (session: GameSession, grows: boolean) => {
  const beforeState = session.getState()
  const before = familySize(beforeState.state.players[0]!)
  const beforeScore = farmersScore(beforeState)
  const response = session.takeAction(0, 'wish-children')
  expect(response.ok, response.error).toBe(true)
  expect(familySize(response.state.players[0]!)).toBe(before + (grows ? 1 : 0))
  expect(response.state.players[0]!.rooms).toBe(2)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId === 'wait') {
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  }
  expect(response.state.events.filter((event) =>
    event.type === 'worker.placed' && event.sourceActionId === 'family-growth',
  )).toHaveLength(grows ? 1 : 0)
  const familyGrowthLogs = response.state.log.filter((entry) => entry.key === 'log.familyGrowth')
  expect(familyGrowthLogs).toHaveLength(grows ? 1 : 0)
  if (grows) {
    expect(familyGrowthLogs[0]!.params).toEqual({ player: beforeState.state.players[0]!.name })
  }
  expect(farmersScore(response)).toBe(beforeScore + (grows ? 3 : 0))
  if (
    response.interaction.stateId === 'wait' &&
    response.interaction.request.kind === 'confirm-next-player'
  ) {
    const confirmed = session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
    expect(confirmed.ok, confirmed.error).toBe(true)
    expect(confirmed.interaction.stateId).toBe('idle')
  }
}

describe('D085 Reader native session', () => {
  it.each([
    { occupationCount: 5, grows: false },
    { occupationCount: 6, grows: true },
  ])('normal game with $occupationCount occupations grows=$grows', ({ occupationCount, grows }) => {
    expectFamilyGrowth(setup(occupationCount), grows)
  })

  it.each([
    { draftPoolSize: 7 as const, occupationCount: 6, grows: false },
    { draftPoolSize: 7 as const, occupationCount: 7, grows: true },
    { draftPoolSize: 10 as const, occupationCount: 6, grows: false },
    { draftPoolSize: 10 as const, occupationCount: 7, grows: true },
  ])(
    '$draftPoolSize-card draft with $occupationCount occupations grows=$grows',
    ({ draftPoolSize, occupationCount, grows }) => {
      expectFamilyGrowth(setup(occupationCount, draftPoolSize), grows)
    },
  )

  it('does not provide room when Reader is absent', () => {
    expectFamilyGrowth(setup(7, 10, false), false)
  })
})
