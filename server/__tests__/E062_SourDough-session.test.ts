import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E062_SourDough'

const CARD_ID = 'E062_SourDough'
const ANYTIME_ID = 'E62-sour-dough-anytime'
const FIREPLACE = 'Major_Fireplace1'
const CLAY_OVEN = 'Major_ClayOven'

const setup = () => {
  const session = new GameSession(62062, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 1)
    setWorkersAtHome(state, player, 1)
  })
  const owner = state.players[0]!
  owner.minorPlayed = [CARD_ID]
  owner.improvements = [FIREPLACE, CLAY_OVEN]
  owner.resources.grain = 1
  owner.resources.food = 0
  session.loadState(state)
  return session
}

const offered = (response: SessionResponse) =>
  response.interaction.anytimeActions.some((entry) => entry.id === ANYTIME_ID)

const startReplacement = (session: GameSession) => {
  const response = session.takeAnytimeAction(0, ANYTIME_ID)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    playerIndex: 0,
    promptKey: 'ui.interactionBakeBreadChoice',
  })
  return response
}

const completeReplacement = (session: GameSession) => {
  startReplacement(session)
  return session.resolveChoice(0, FIREPLACE)
}

describe('E062 Sour Dough turn replacement', () => {
  it('is offered while idle and replaces the turn without placing a worker', () => {
    const session = setup()
    const before = session.getState()
    expect(before.interaction.stateId).toBe('idle')
    expect(offered(before)).toBe(true)
    expect(workersAvailable(before.state, before.state.players[0]!)).toBe(1)

    const response = completeReplacement(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.state.actionSpaces.every((space) =>
      space.takenBy.every((worker) => worker.playerId !== 'p1'),
    )).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'confirm-next-player', nextPlayerIndex: 1 },
    })
  })

  it('keeps the normal placement turn when the offered replacement is not selected', () => {
    const session = setup()
    expect(offered(session.getState())).toBe(true)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual(expect.objectContaining({ playerId: 'p1' }))
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })

  it('does not offer a second replacement in the same round', () => {
    const session = setup()
    const completed = completeReplacement(session)
    expect(completed.interaction.stateId).toBe('wait')
    session.resolveChoice(1, 'confirm')

    session.takeAction(1, 'forest')
    const backToOwner = session.resolveChoice(0, 'confirm')

    expect(backToOwner.state.currentPlayerIndex).toBe(0)
    expect(offered(backToOwner)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
  })

  it('is unavailable when another player has no person left to place', () => {
    const session = setup()
    const state = session.getState().state
    setWorkersAtHome(state, state.players[1]!, 0)
    session.loadState(state)

    expect(offered(session.getState())).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
  })

  it('cannot be inserted into an action or nested interaction', () => {
    const session = setup()
    const response = session.takeAction(0, 'farmland')

    expect(response.interaction.stateId).toBe('wait')
    expect(offered(response)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
  })

  it('undo restores the replacement opportunity and unspent resources', () => {
    const session = setup()
    completeReplacement(session)

    const undone = session.undoAction()

    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.currentPlayerIndex).toBe(0)
    expect(undone.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(undone.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(workersAvailable(undone.state, undone.state.players[0]!)).toBe(1)
    expect(offered(undone)).toBe(true)
  })

  it('keeps replacement identity and turn rotation across snapshot restore', () => {
    const session = setup()
    const pending = startReplacement(session)
    const restored = new GameSession(JSON.parse(JSON.stringify({
      state: pending.state,
      sessionCursor: session.createSessionPrivateCursor(),
    })))

    const response = restored.resolveChoice(0, FIREPLACE)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, food: 2 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'confirm-next-player', nextPlayerIndex: 1 },
    })
  })
})
