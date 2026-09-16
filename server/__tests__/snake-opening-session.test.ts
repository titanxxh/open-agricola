import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { EngineStack } from '../../shared/engine'
import { rehydrateState, serializeState } from '../../shared/session/serialization'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

const PLACEHOLDER = '__test_placeholder__'
const REVERSED_EVENT = 'snakeOpening.reversed'
const REVERSED_LOG = 'log.snakeOpeningReversed'

const setup = (playerCount: 2 | 3, enableSnakeOpening = true) => {
  const session = new GameSession(9061, undefined, { playerCount, enableSnakeOpening })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  for (const player of state.players) {
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
  }
  session.loadState(state)
  return session
}

const skipOptionalChoices = (session: GameSession, response: SessionResponse): SessionResponse => {
  for (let guard = 0; guard < 4; guard += 1) {
    if (response.interaction.stateId !== 'wait') return response
    if (response.interaction.request.kind === 'confirm-next-player') return response
    const skip = response.interaction.request.options?.find((option) => option.value === '__skip__')
    if (!skip) return response
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
  }
  return response
}

/** Place one person, assert the pending confirm, return who the server says is next. */
const place = (session: GameSession, playerIndex: number, spaceId: string) => {
  let response = session.takeAction(playerIndex, spaceId)
  expect(response.ok, response.error).toBe(true)
  response = skipOptionalChoices(session, response)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  const next = response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player'
    ? response.interaction.request.nextPlayerIndex
    : -1
  return { next, response }
}

const placeAndConfirm = (session: GameSession, playerIndex: number, spaceId: string) => {
  const { next, response } = place(session, playerIndex, spaceId)
  const confirmed = confirmNextPlayer(session)
  expect(confirmed.ok, confirmed.error).toBe(true)
  return { next, placed: response, confirmed }
}

const reversedEvents = (response: SessionResponse) =>
  response.state.events.filter((event) => event.type === REVERSED_EVENT)

describe('Snake Opening variant', () => {
  it('2p: the second person of round 1 is placed in reverse order, round 2 is forward again', () => {
    const session = setup(2)
    expect(session.state.players.map((player) => player.resources.food)).toEqual([3, 3])
    expect(session.state.snakeOpening).toEqual({ reversed: false })

    const first = placeAndConfirm(session, 0, 'forest')
    expect(first.next).toBe(1)
    expect(first.confirmed.state.snakeOpening).toEqual({ reversed: false })

    const second = placeAndConfirm(session, 1, 'clay-pit')
    expect(second.next).toBe(1)
    expect(second.placed.state.snakeOpening).toEqual({ reversed: true })
    expect(reversedEvents(second.placed)).toHaveLength(1)
    expect(second.placed.state.log.some((entry) => entry.key === REVERSED_LOG)).toBe(true)
    expect(second.confirmed.state.currentPlayerIndex).toBe(1)

    const third = placeAndConfirm(session, 1, 'reed-bank')
    expect(third.next).toBe(0)
    expect(third.confirmed.state.currentPlayerIndex).toBe(0)

    const fourth = placeAndConfirm(session, 0, 'fishing')
    expect(fourth.next).toBe(0)
    expect(fourth.confirmed.state.round).toBe(2)
    expect(fourth.confirmed.state.roundPhase).toBe('work')
    expect(fourth.confirmed.state.currentPlayerIndex).toBe(0)
    expect(fourth.confirmed.state.snakeOpening).toEqual({ reversed: false })
    expect(reversedEvents(fourth.confirmed)).toHaveLength(1)

    expect(placeAndConfirm(session, 0, 'forest').next).toBe(1)
    expect(placeAndConfirm(session, 1, 'clay-pit').next).toBe(0)
    const lastOfRoundTwo = place(session, 0, 'reed-bank')
    expect(lastOfRoundTwo.next).toBe(1)
    expect(lastOfRoundTwo.response.state.snakeOpening).toEqual({ reversed: false })
    expect(reversedEvents(lastOfRoundTwo.response)).toHaveLength(1)
  })

  it('3p: placements run 1-2-3 then 3-2-1 and the last seat places twice in a row', () => {
    const session = setup(3)
    expect(session.state.players.map((player) => player.resources.food)).toEqual([3, 3, 3])

    const sequence = [
      placeAndConfirm(session, 0, 'forest').next,
      placeAndConfirm(session, 1, 'clay-pit').next,
      placeAndConfirm(session, 2, 'reed-bank').next,
      placeAndConfirm(session, 2, 'fishing').next,
      placeAndConfirm(session, 1, 'day-laborer').next,
    ]
    expect(sequence).toEqual([1, 2, 2, 1, 0])
    expect(session.state.snakeOpening).toEqual({ reversed: true })

    const last = placeAndConfirm(session, 0, 'grain-seeds')
    expect(last.next).toBe(0)
    expect(last.confirmed.state.round).toBe(2)
    expect(last.confirmed.state.currentPlayerIndex).toBe(0)
    expect(last.confirmed.state.snakeOpening).toEqual({ reversed: false })
  })

  it('a Start Player Marker transfer in round 1 does not change the reversed order until round 2', () => {
    const session = setup(2)

    expect(placeAndConfirm(session, 0, 'forest').next).toBe(1)
    const marker = placeAndConfirm(session, 1, 'meeting-place')
    expect(marker.placed.state.players[1]!.startPlayer).toBe(true)
    expect(marker.next).toBe(1)
    expect(marker.placed.state.snakeOpening).toEqual({ reversed: true })

    expect(placeAndConfirm(session, 1, 'clay-pit').next).toBe(0)
    const last = placeAndConfirm(session, 0, 'reed-bank')
    expect(last.next).toBe(1)
    expect(last.confirmed.state.round).toBe(2)
    expect(last.confirmed.state.roundFirstPlayerId).toBe('p2')
    expect(last.confirmed.state.currentPlayerIndex).toBe(1)
    expect(last.confirmed.state.snakeOpening).toEqual({ reversed: false })

    expect(placeAndConfirm(session, 1, 'forest').next).toBe(0)
    expect(placeAndConfirm(session, 0, 'clay-pit').next).toBe(1)
    expect(place(session, 1, 'reed-bank').next).toBe(0)
  })

  it('keeps the reversed marker through snapshot rehydration and loadState', () => {
    const session = setup(2)
    placeAndConfirm(session, 0, 'forest')
    placeAndConfirm(session, 1, 'clay-pit')
    expect(session.state.snakeOpening).toEqual({ reversed: true })

    const serialized = serializeState(session.getState().state, { engineStack: new EngineStack() })
    expect(serialized.enableSnakeOpening).toBe(true)
    expect(serialized.snakeOpening).toEqual({ reversed: true })
    const restored = rehydrateState(JSON.parse(JSON.stringify(serialized))).state
    expect(restored.snakeOpening).toEqual({ reversed: true })

    session.loadState(JSON.parse(JSON.stringify(session.getState().state)))
    expect(session.state.snakeOpening).toEqual({ reversed: true })
    expect(place(session, 1, 'reed-bank').next).toBe(0)
  })

  it('undoing the placement that flipped the order restores the forward marker', () => {
    const session = setup(2)
    placeAndConfirm(session, 0, 'forest')

    const flipped = place(session, 1, 'clay-pit')
    expect(flipped.response.state.snakeOpening).toEqual({ reversed: true })

    const undone = session.undoStep(1)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.snakeOpening).toEqual({ reversed: false })
    expect(reversedEvents(undone)).toHaveLength(0)

    const again = place(session, 1, 'clay-pit')
    expect(again.next).toBe(1)
    expect(again.response.state.snakeOpening).toEqual({ reversed: true })
    expect(reversedEvents(again.response)).toHaveLength(1)
  })

  it('does nothing when the variant is off', () => {
    const session = setup(2, false)
    expect(session.state.players.map((player) => player.resources.food)).toEqual([2, 3])
    expect(session.state.enableSnakeOpening).toBe(false)
    expect(session.state.snakeOpening).toBeNull()

    const sequence = [
      placeAndConfirm(session, 0, 'forest').next,
      placeAndConfirm(session, 1, 'clay-pit').next,
      placeAndConfirm(session, 0, 'reed-bank').next,
    ]
    expect(sequence).toEqual([1, 0, 1])
    const last = place(session, 1, 'fishing')
    expect(last.next).toBe(0)
    expect(last.response.state.snakeOpening).toBeNull()
    expect(reversedEvents(last.response)).toHaveLength(0)
  })
})
