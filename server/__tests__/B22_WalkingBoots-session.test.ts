import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  inactiveWorkersInSupply,
  markAllWorkersUsed,
  setActiveWorkerCount,
} from '../../shared/domain/player'

import '../../shared/cards/B/B022_WalkingBoots'

const CARD_ID = 'B022_WalkingBoots'
const FILLER = '__test_placeholder__'

const setup = (familySize = 4) => {
  const session = new GameSession(5022, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0,
    }
  })
  const player = state.players[0]!
  setActiveWorkerCount(player, familySize)
  player.minorHand = [CARD_ID]
  player.resources.food = 0
  session.loadState(state)
  return session
}

const enterImprovement = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

const play = (session: GameSession): SessionResponse => {
  let response = enterImprovement(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

describe('B022 Walking Boots parity', () => {
  it('B022 S1: with four people Walking Boots is played through an improvement action, gains two food, and requires a supply-person placement', () => {
    const session = setup()
    const before = session.getState().state.players[0]!
    expect(before.workers.filter((worker) => worker.isActive)).toHaveLength(4)
    expect(inactiveWorkersInSupply(before)).toHaveLength(1)

    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.map((option) => option.value)).toContain('forest')
  })

  it('B022 S2: choosing Forest activates the remaining supply person but places an existing family member there', () => {
    const session = setup()
    const supplyWorkerId = inactiveWorkersInSupply(session.state.players[0]!)[0]!.id
    play(session)

    const response = session.resolveChoice(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    const forestWorker = response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy
      .find((worker) => worker.playerId === response.state.players[0]!.id)
    expect(forestWorker).toBeDefined()
    expect(forestWorker!.workerId).not.toBe(supplyWorkerId)
    expect(response.state.players[0]!.workers.find((worker) => worker.id === supplyWorkerId))
      .toMatchObject({ isActive: true })
    expect(response.state.actionSpaces.flatMap((space) => space.takenBy))
      .not.toContainEqual(expect.objectContaining({ workerId: supplyWorkerId }))
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.markedSpaceId).toBe('forest')
  })

  it('B022 S3: the native returning-home flow removes the existing person placed on Forest and leaves the supply person active', () => {
    const session = setup()
    const supplyWorkerId = inactiveWorkersInSupply(session.state.players[0]!)[0]!.id
    play(session)
    const placed = session.resolveChoice(0, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    const forestWorkerId = placed.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy
      .find((worker) => worker.playerId === placed.state.players[0]!.id)!.workerId
    expect(forestWorkerId).not.toBe(supplyWorkerId)

    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    const response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.workers.find((worker) => worker.id === supplyWorkerId))
      .toMatchObject({ isActive: true })
    expect(response.state.players[0]!.workers.find((worker) => worker.id === forestWorkerId))
      .toMatchObject({ isActive: false, removedFromSupply: true })
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(4)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .not.toContainEqual(expect.objectContaining({ workerId: supplyWorkerId }))
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.markedSpaceId).toBeUndefined()
  })

  it('B022 S4: with five people Walking Boots remains unavailable and grants no food', () => {
    const response = enterImprovement(setup(5))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect((response.interaction.request.options ?? []).some((option) => option.value === CARD_ID)).toBe(false)
  })
})
