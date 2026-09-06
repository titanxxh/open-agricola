import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { GameState } from '../../shared/contract/types'

import '../../shared/cards/B/B139_ForestScientist'
import '../../shared/cards/B/B158_DistrictManager'

const FILLER = '__test_placeholder__'

const setupOccupation = (cardId: 'B139_ForestScientist' | 'B158_DistrictManager', {
  played = true, playerCount, round = 5,
}: { played?: boolean; playerCount: number; round?: number }) => {
  const session = new GameSession(5300 + playerCount, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [cardId]
  owner.occupationPlayed = played ? [cardId] : []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const prepareRoundEnd = (state: GameState) => {
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 2)
    markAllWorkersUsed(state, player)
    player.resources.food = 20
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
}

const clearBoardWood = (state: GameState) => {
  state.actionSpaces.forEach((space) => { space.resources.wood = 0 })
}

const occupy = (state: GameState, spaceId: string, playerIndex: number, workerIndex: number) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  const player = state.players[playerIndex]!
  space.takenBy = [{ playerId: player.id, workerId: player.workers[workerIndex]!.id }]
}

describe('B139 Forest Scientist parity', () => {
  it('B139 S1: playing Forest Scientist through Lessons keeps it in play', () => {
    const response = playOccupation(
      setupOccupation('B139_ForestScientist', { played: false, playerCount: 3 }),
      'B139_ForestScientist',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('B139_ForestScientist')
  })

  for (const [scenario, round, gain] of [['S2', 3, 1], ['S3', 5, 2]] as const) {
    it(`B139 ${scenario}: returning home in round ${round} with no board wood gains ${gain} food`, () => {
      const session = setupOccupation('B139_ForestScientist', { playerCount: 3, round })
      const state = session.getState().state
      clearBoardWood(state)
      prepareRoundEnd(state)
      const before = state.players[0]!.resources.food
      session.loadState(state)

      const response = session.performRoundEnd()

      expect(response.state.players[0]!.resources.food).toBe(before + gain)
    })
  }

  it('B139 S4: wood remaining on any action space prevents the food gain', () => {
    const session = setupOccupation('B139_ForestScientist', { playerCount: 3, round: 5 })
    const state = session.getState().state
    clearBoardWood(state)
    state.actionSpaces.find((space) => space.id === 'grove')!.resources.wood = 1
    prepareRoundEnd(state)
    const before = state.players[0]!.resources.food
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.players[0]!.resources.food).toBe(before)
  })
})

const districtManagerSession = ({ ownerForest = true, ownerGrove = true } = {}) => {
  const session = setupOccupation('B158_DistrictManager', { playerCount: 4 })
  const state = session.getState().state
  prepareRoundEnd(state)
  occupy(state, 'forest', ownerForest ? 0 : 1, 0)
  occupy(state, 'grove', ownerGrove ? 0 : 1, 1)
  session.loadState(state)
  return session
}

describe('B158 District Manager parity', () => {
  it('B158 S1: playing District Manager through Lessons keeps it in play', () => {
    const response = playOccupation(
      setupOccupation('B158_DistrictManager', { played: false, playerCount: 4 }),
      'B158_DistrictManager',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('B158_DistrictManager')
  })

  it('B158 S2: using both Forest and Grove gains five food at work-phase end', () => {
    const session = districtManagerSession()
    const before = session.getState().state.players[0]!.resources.food

    const response = session.performRoundEnd()

    expect(response.state.players[0]!.resources.food).toBe(before + 5)
  })

  for (const [scenario, ownerForest, ownerGrove] of [
    ['S3', true, false],
    ['S4', false, true],
  ] as const) {
    it(`B158 ${scenario}: the owner using only one required space gains no food`, () => {
      const session = districtManagerSession({ ownerForest, ownerGrove })
      const before = session.getState().state.players[0]!.resources.food

      const response = session.performRoundEnd()

      expect(response.state.players[0]!.resources.food).toBe(before)
    })
  }
})
