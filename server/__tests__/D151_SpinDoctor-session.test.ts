import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D024_BrotherlyLove'
import '../../shared/cards/D/D151_SpinDoctor'

const CARD_ID = 'D151_SpinDoctor'
const BROTHERLY_LOVE_ID = 'D024_BrotherlyLove'

const setup = (workers = 2) => {
  const session = new GameSession(42, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.phase = 'playing'
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((entry, index) => {
    entry.startPlayer = index === 1
  })
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  setWorkersAtHome(state, player, workers)
  session.loadState(state)
  return session
}

const chooseSpinDoctor = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const options = response.interaction.request.options ?? []
  const choice = options.find((option) => option.sourceCard === CARD_ID && option.value !== '__skip__')
    ?? (response.interaction.sourceCard === CARD_ID
      ? options.find((option) => option.value !== '__skip__')
      : undefined)
  expect(choice).toBeDefined()
  return session.resolveChoice(0, choice!.value)
}

const advanceToSpinDoctorPlacement = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 3; step += 1) {
    const choices = choicesOf(response)
    if (choices.some((choice) =>
      choice.startsWith('allow-occupied:')
      || response.state.actionSpaces.some((space) => space.id === choice),
    )) break
    response = chooseSpinDoctor(session, response)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  return response
}

const enterExtraPlacement = (session: GameSession) =>
  advanceToSpinDoctorPlacement(session, session.takeAction(0, 'traveling-players'))

const choicesOf = (response: SessionResponse) =>
  response.interaction.stateId === 'wait'
    ? response.interaction.request.options?.map((option) => option.value) ?? []
    : []

const triggerOptionFor = (response: SessionResponse, sourceCard: string) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(response.interaction.request.kind).toBe('select-trigger')
  const option = response.interaction.request.options?.find((entry) => entry.sourceCard === sourceCard)
  expect(option).toBeDefined()
  return option!
}

const setupWithBrotherlyLove = () => {
  const session = setup()
  const state = session.getState().state
  const player = state.players[0]!
  setActiveWorkerCount(player, 4)
  player.minorPlayed.push(BROTHERLY_LOVE_ID)
  const meetingWorkerId = player.workers[0]!.id
  const forestWorkerId = player.workers[1]!.id
  state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy = [{
    playerId: player.id,
    workerId: meetingWorkerId,
  }]
  state.actionSpaces.find((space) => space.id === 'forest')!.takenBy = [{
    playerId: player.id,
    workerId: forestWorkerId,
  }]
  recordRoundPlacement(player, 'meeting-place', meetingWorkerId)
  recordRoundPlacement(player, 'forest', forestWorkerId)
  session.loadState(state)
  return { session, meetingWorkerId, forestWorkerId }
}

const finishTurn = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId === 'wait') {
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    if (response.interaction.request.kind === 'confirm-next-player') {
      response = session.resolveChoice(response.interaction.request.nextPlayerIndex, 'confirm')
    }
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('idle')
}

const snapshot = (response: SessionResponse) => ({
  eventCount: response.state.events.length,
  logCount: response.state.log.length,
  score: response.scores[0]!.total,
})

const newEvents = (before: ReturnType<typeof snapshot>, after: SessionResponse) =>
  after.state.events.slice(before.eventCount)

const newLogs = (before: ReturnType<typeof snapshot>, after: SessionResponse) =>
  after.state.log.slice(0, after.state.log.length - before.logCount)

describe('D151 Spin Doctor native session', () => {
  it('offers an empty Meeting Place and resolves its normal action', () => {
    const session = setup()
    const before = snapshot(session.getState())

    let response = enterExtraPlacement(session)
    expect(choicesOf(response)).toContain('meeting-place')
    expect(choicesOf(response)).not.toContain('allow-occupied:meeting-place')

    response = session.resolveChoice(0, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'traveling-players')?.takenBy)
      .toEqual([expect.objectContaining({ playerId: response.state.players[0]!.id })])
    expect(response.state.actionSpaces.find((space) => space.id === 'meeting-place')?.takenBy)
      .toEqual([expect.objectContaining({ playerId: response.state.players[0]!.id })])
    expect(response.state.players[0]!.startPlayer).toBe(true)
    expect(response.state.players[1]!.startPlayer).toBe(false)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(newEvents(before, response).filter((event) => event.type === 'worker.placed'))
      .toEqual([
        expect.objectContaining({ spaceId: 'traveling-players' }),
        expect.objectContaining({ spaceId: 'meeting-place', viaCardId: CARD_ID }),
      ])
    expect(newEvents(before, response)).toContainEqual(expect.objectContaining({
      type: 'startPlayer.changed',
      playerId: response.state.players[0]!.id,
    }))
    expect(newLogs(before, response).filter((entry) => entry.key === 'log.placeFarmer'))
      .toEqual([
        expect.objectContaining({
          params: {
            action: 'actions.place-farmer.name',
            player: response.state.players[0]!.name,
          },
        }),
        expect.objectContaining({
          params: {
            action: 'actions.traveling-players.name',
            player: response.state.players[0]!.name,
          },
        }),
      ])
    expect(response.scores[0]!.total).toBe(before.score)
    finishTurn(session, response)
  })

  it('excludes an occupied Meeting Place but allows an occupied ordinary space', () => {
    const session = setup()
    const state = session.getState().state
    const opponent = state.players[1]!
    const otherOpponent = state.players[2]!
    state.actionSpaces.find((space) => space.id === 'meeting-place')!.takenBy = [{
      playerId: opponent.id,
      workerId: opponent.workers[0]!.id,
    }]
    state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy = [{
      playerId: otherOpponent.id,
      workerId: otherOpponent.workers[0]!.id,
    }]
    session.loadState(state)
    const before = snapshot(session.getState())

    let response = enterExtraPlacement(session)

    expect(choicesOf(response)).not.toContain('meeting-place')
    expect(choicesOf(response)).not.toContain('allow-occupied:meeting-place')
    expect(choicesOf(response)).not.toContain('day-laborer')
    expect(choicesOf(response)).toContain('allow-occupied:day-laborer')

    const foodBefore = response.state.players[0]!.resources.food
    response = session.resolveChoice(0, 'allow-occupied:day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(foodBefore + 2)
    expect(response.state.actionSpaces.find((space) => space.id === 'day-laborer')?.takenBy)
      .toEqual([
        expect.objectContaining({ playerId: otherOpponent.id }),
        expect.objectContaining({ playerId: response.state.players[0]!.id }),
      ])
    expect(response.state.actionSpaces.find((space) => space.id === 'meeting-place')?.takenBy)
      .toEqual([expect.objectContaining({ playerId: opponent.id })])
    expect(response.state.players[1]!.startPlayer).toBe(true)
    expect(newEvents(before, response)).toContainEqual(expect.objectContaining({
      type: 'worker.placed',
      spaceId: 'day-laborer',
      viaCardId: CARD_ID,
    }))
    expect(newEvents(before, response).some((event) =>
      event.type === 'worker.placed' && event.spaceId === 'meeting-place',
    )).toBe(false)
    expect(newLogs(before, response).filter((entry) => entry.key === 'log.placeFarmer'))
      .toHaveLength(2)
    expect(newLogs(before, response).some((entry) => entry.key === 'log.startPlayer')).toBe(false)
    expect(response.scores[0]!.total).toBe(before.score)
    finishTurn(session, response)
  })

  it('selects Spin Doctor alongside Brotherly Love and rederives both triggers after undo', () => {
    const { session, meetingWorkerId, forestWorkerId } = setupWithBrotherlyLove()
    const before = snapshot(session.getState())
    let response = session.takeAction(0, 'traveling-players')
    expect(triggerOptionFor(response, CARD_ID)).toBeDefined()
    expect(triggerOptionFor(response, BROTHERLY_LOVE_ID)).toBeDefined()

    response = session.resolveChoice(0, triggerOptionFor(response, CARD_ID).value)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe(CARD_ID)

    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(triggerOptionFor(undone, CARD_ID)).toBeDefined()
    expect(triggerOptionFor(undone, BROTHERLY_LOVE_ID)).toBeDefined()

    response = session.resolveChoice(0, triggerOptionFor(undone, CARD_ID).value)
    response = advanceToSpinDoctorPlacement(session, response)
    expect(response.state.actionSpaces.find((space) => space.id === 'meeting-place')?.takenBy)
      .toHaveLength(1)
    expect(choicesOf(response)).toContain('allow-occupied:forest')
    expect(choicesOf(response)).not.toContain('allow-occupied:meeting-place')

    const rejected = session.resolveChoice(0, 'allow-occupied:meeting-place')
    expect(rejected.ok).toBe(false)
    response = session.resolveChoice(0, 'allow-occupied:forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'meeting-place')?.takenBy)
      .toEqual([{ playerId: response.state.players[0]!.id, workerId: meetingWorkerId }])
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
      .toHaveLength(2)
    expect(newEvents(before, response)).toContainEqual(expect.objectContaining({
      type: 'worker.placed',
      spaceId: 'forest',
      viaCardId: CARD_ID,
    }))
    expect(newLogs(before, response).filter((entry) => entry.key === 'log.placeFarmer'))
      .toHaveLength(2)
    finishTurn(session, response)
  })

  it('selects Brotherly Love alongside Spin Doctor and limits its occupied choice to the third space', () => {
    const { session, meetingWorkerId, forestWorkerId } = setupWithBrotherlyLove()
    const before = snapshot(session.getState())
    let response = session.takeAction(0, 'traveling-players')
    expect(triggerOptionFor(response, CARD_ID)).toBeDefined()
    expect(triggerOptionFor(response, BROTHERLY_LOVE_ID)).toBeDefined()

    response = session.resolveChoice(0, triggerOptionFor(response, BROTHERLY_LOVE_ID).value)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .toBe(BROTHERLY_LOVE_ID)
    const accept = response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.find((option) => option.value !== '__skip__')
      : undefined
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(choicesOf(response)).toContain('allow-occupied:traveling-players')
    expect(choicesOf(response)).not.toContain('allow-occupied:meeting-place')
    expect(choicesOf(response)).not.toContain('allow-occupied:forest')

    response = session.resolveChoice(0, 'allow-occupied:traveling-players')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'meeting-place')?.takenBy)
      .toEqual([{ playerId: response.state.players[0]!.id, workerId: meetingWorkerId }])
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy)
      .toEqual([{ playerId: response.state.players[0]!.id, workerId: forestWorkerId }])
    expect(response.state.actionSpaces.find((space) => space.id === 'traveling-players')?.takenBy)
      .toHaveLength(2)
    expect(newEvents(before, response)).toContainEqual(expect.objectContaining({
      type: 'worker.placed',
      spaceId: 'traveling-players',
      viaCardId: BROTHERLY_LOVE_ID,
    }))
    expect(newLogs(before, response).filter((entry) => entry.key === 'log.placeFarmer'))
      .toHaveLength(2)
    finishTurn(session, response)
  })

  it('allows declining the extra placement', () => {
    const session = setup()
    const before = snapshot(session.getState())
    let response = chooseSpinDoctor(session, session.takeAction(0, 'traveling-players'))
    expect(choicesOf(response)).toContain('__skip__')

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(newEvents(before, response).filter((event) => event.type === 'worker.placed'))
      .toEqual([expect.objectContaining({ spaceId: 'traveling-players' })])
    expect(newEvents(before, response).some((event) =>
      event.type === 'worker.placed' && event.viaCardId === CARD_ID,
    )).toBe(false)
    expect(newLogs(before, response).filter((entry) => entry.key === 'log.placeFarmer'))
      .toHaveLength(1)
    expect(response.scores[0]!.total).toBe(before.score)
    finishTurn(session, response)
  })

  it('does not offer an extra placement after another action space', () => {
    const session = setup()
    const before = snapshot(session.getState())

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(choicesOf(response)).not.toContain('flow-0')
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(newEvents(before, response).filter((event) => event.type === 'worker.placed'))
      .toEqual([expect.objectContaining({ spaceId: 'day-laborer' })])
    expect(newLogs(before, response).filter((entry) => entry.key === 'log.placeFarmer'))
      .toHaveLength(1)
    expect(response.scores[0]!.total).toBe(before.score)
    finishTurn(session, response)
  })

  it('does not offer an extra placement without another worker', () => {
    const session = setup(1)
    const before = snapshot(session.getState())

    const response = session.takeAction(0, 'traveling-players')

    expect(response.ok, response.error).toBe(true)
    expect(choicesOf(response)).not.toContain('flow-0')
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(newEvents(before, response).filter((event) => event.type === 'worker.placed'))
      .toEqual([expect.objectContaining({ spaceId: 'traveling-players' })])
    expect(newLogs(before, response).filter((entry) => entry.key === 'log.placeFarmer'))
      .toHaveLength(1)
    expect(response.scores[0]!.total).toBe(before.score)
    finishTurn(session, response)
  })
})
