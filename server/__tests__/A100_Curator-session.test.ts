import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A100_Curator'

const CARD_ID = 'A100_Curator'
const FILLER = '__test_placeholder__'
const ACCUMULATION = ['forest', 'clay-pit', 'reed-bank'] as const

const setup = ({
  played = true,
  food = 1,
  spaces = [...ACCUMULATION] as string[],
  remainingResources = false,
} = {}) => {
  const session = new GameSession(5100, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = played ? 3 : 14
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = index === 0 ? food : 20
    if (played || index !== 0) markAllWorkersUsed(state, player)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  if (!played) setWorkersAtHome(state, player, 2)
  if (played) {
    setActiveWorkerCount(player, spaces.length)
    state.actionSpaces.forEach((space) => {
      space.takenBy = space.takenBy.filter((worker) => worker.playerId !== player.id)
    })
    spaces.forEach((spaceId, index) => {
      const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
      const worker = player.workers.filter((candidate) => candidate.isActive)[index]
      if (!space || !worker) throw new Error(`missing Curator setup ${spaceId}`)
      space.takenBy.push({ playerId: player.id, workerId: worker.id })
    })
    const resourceBySpace = { forest: 'wood', 'clay-pit': 'clay', 'reed-bank': 'reed' } as const
    for (const spaceId of ACCUMULATION) {
      const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
      space.resources[resourceBySpace[spaceId]] = remainingResources ? 1 : 0
    }
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const acceptCurator = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    candidate.sourceCard === CARD_ID && candidate.value !== '__skip__')
    ?? response.interaction.request.options?.find((candidate) => candidate.value !== '__skip__')
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0

describe('A100 Curator parity', () => {
  it('A100 S1: Curator is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false, food: 0, spaces: [] }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A100 S2: characterize three used accumulation spaces after their resources were taken', () => {
    const response = setup({ food: 1, remainingResources: false }).performRoundEnd()

    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(bonusVp(response)).toBe(0)
    expect(response.interaction.stateId === 'wait'
      ? (response.interaction.request.options?.some((option) => option.sourceCard === CARD_ID) ?? false)
      : false).toBe(false)
  })

  it('A100 S3: with resources remaining on three used accumulation spaces the point can be bought', () => {
    const session = setup({ food: 1, remainingResources: true })

    const response = acceptCurator(session, session.performRoundEnd())

    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(bonusVp(response)).toBe(1)
  })

  it('A100 S4: the bonus-point purchase may be declined', () => {
    const session = setup({ food: 1, remainingResources: true })
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(bonusVp(response)).toBe(0)
  })

  it('A100 S5: two accumulation spaces plus one non-accumulation space do not qualify', () => {
    const response = setup({
      food: 1,
      spaces: ['forest', 'clay-pit', 'farmland'],
      remainingResources: true,
    }).performRoundEnd()

    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(bonusVp(response)).toBe(0)
  })

  it('A100 S6: with no food three accumulation spaces offer no purchase', () => {
    const response = setup({ food: 0, remainingResources: true }).performRoundEnd()

    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(bonusVp(response)).toBe(0)
    expect(response.interaction.stateId === 'wait'
      ? (response.interaction.request.options?.some((option) => option.sourceCard === CARD_ID) ?? false)
      : false).toBe(false)
  })
})
