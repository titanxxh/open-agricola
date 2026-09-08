import { describe, expect, it } from 'vitest'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { takeNormalWorkerTurn } from './_helpers/supply-worker-turn'
import type { GameState } from '../../shared/contract/types'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  inactiveWorkersInSupply,
  getFamilyTokenLimit,
  setActiveWorkerCount,
} from '../../shared/domain/player'

import '../../shared/cards/B/B022_WalkingBoots'

const CARD_ID = 'B022_WalkingBoots'
const FILLER = '__test_placeholder__'

const setup = (familySize = 4, configure?: (state: GameState) => void) => {
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
  configure?.(state)
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

  it('B022 S2: choosing Forest places the supply person without activating a family member', () => {
    const session = setup()
    const supplyWorkerId = inactiveWorkersInSupply(session.state.players[0]!)[0]!.id
    play(session)

    const response = session.resolveChoice(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    const forestWorker = response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy
      .find((worker) => worker.playerId === response.state.players[0]!.id)
    expect(forestWorker).toBeDefined()
    expect(forestWorker!.workerId).toBe(supplyWorkerId)
    expect(response.state.players[0]!.workers.find((worker) => worker.id === supplyWorkerId))
      .toMatchObject({ isActive: false })
    expect(response.state.actionSpaces.flatMap((space) => space.takenBy))
      .toContainEqual(expect.objectContaining({ workerId: supplyWorkerId }))
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(4)
  })

  it('B022 S3: returning home removes the same supply person and preserves the existing family', () => {
    const session = setup()
    const supplyWorkerId = inactiveWorkersInSupply(session.state.players[0]!)[0]!.id
    play(session)
    const placed = session.resolveChoice(0, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    const forestWorkerId = placed.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy
      .find((worker) => worker.playerId === placed.state.players[0]!.id)!.workerId
    expect(forestWorkerId).toBe(supplyWorkerId)

    expect(confirmNextPlayer(session).ok).toBe(true)
    for (const spaceId of ['day-laborer', 'clay-pit', 'reed-bank', 'grain-seeds', 'fishing']) {
      expect(takeNormalWorkerTurn(session, spaceId).ok).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }
    const response = session.getState()
    expect(response.state.round).toBe(4)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.workers.find((worker) => worker.id === supplyWorkerId))
      .toMatchObject({ isActive: false })
    expect(response.state.players[0]!.workers.find((worker) => worker.id === forestWorkerId))
      .toMatchObject({ isActive: false, removedFromSupply: true })
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(4)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .not.toContainEqual(expect.objectContaining({ workerId: supplyWorkerId }))
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.markedSpaceId).toBeUndefined()
    expect(getFamilyTokenLimit(response.state.players[0]!)).toBe(4)
    expect(response.scores[0]!.categories.find((category) => category.key === 'farmers')).toMatchObject({ quantity: 4, total: 12 })
  })

  it('B022 S4: with five people Walking Boots remains unavailable and grants no food', () => {
    const response = enterImprovement(setup(5))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy).toEqual([])
  })

  it('B022 follows the original supply person when Straw Hat moves it before removal', () => {
    const session = setup(4, (state) => { state.players[0]!.minorPlayed = ['E010_StrawHat'] })
    play(session)
    let response = session.resolveChoice(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(response.ok, response.error).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    for (const spaceId of ['day-laborer', 'forest', 'clay-pit', 'reed-bank', 'grain-seeds']) {
      expect(takeNormalWorkerTurn(session, spaceId).ok).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }
    const pending = session.getState()
    expect(pending.interaction.stateId).toBe('wait')
    if (pending.interaction.stateId !== 'wait') return
    expect(pending.state.actionSpaces.find((space) => space.id === 'farmland')!.takenBy)
      .toContainEqual({ playerId: pending.state.players[0]!.id, workerId: '5' })
    expect(pending.state.players[0]!.workers.find((worker) => worker.id === '5')?.supplyUse)
      .toMatchObject({ sourceCard: CARD_ID, disposition: 'remove-from-game' })
    const move = pending.interaction.request.options?.find((option) => option.labelKey === 'actions.move-farmer-to-space.name')
    expect(move, JSON.stringify(pending.interaction)).toBeDefined()
    response = session.resolveChoice(0, move!.value)
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, 'fishing')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.workers.find((worker) => worker.id === '5')?.removedFromSupply).toBe(true)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(4)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'worker.placed', workerId: '5', spaceId: 'fishing', viaCardId: 'E010_StrawHat',
    }))
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'worker.returned', to: 'removed', workers: [{ playerId: response.state.players[0]!.id, workerId: '5' }],
    }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.workerRemoved' }))
  })

  it.each(['M053_ForestHut', 'D022_WorkPermit'])('B022 stays blocked when %s reserves the only supply person and undo restores the two food', (sourceCard) => {
    const session = setup(4, (state) => {
      const player = state.players[0]!
      player.minorPlayed = [sourceCard]
      player.cardStates[sourceCard] = { extraData: sourceCard === 'M053_ForestHut'
        ? { temporaryWorkerId: '5', boundForest: { row: 0, col: 0 } }
        : { reservedWorkerId: '5', targetRound: 6 } }
      player.workers.find((worker) => worker.id === '5')!.supplyUse = {
        sourceCard, disposition: 'return-to-supply', status: 'reserved',
      }
    })
    const response = play(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'engine-blocked' } })
    expect(session.resolveChoice(0, '__skip__').ok).toBe(false)
    const undone = session.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.food).toBe(0)
    expect(undone.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(undone.state.players[0]!.workers.find((worker) => worker.id === '5')?.supplyUse?.status).toBe('reserved')
  })

})
