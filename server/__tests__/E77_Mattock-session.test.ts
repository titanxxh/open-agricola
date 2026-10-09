import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD_ID = 'E077_Mattock'
const sessions: GameSession[] = []

// #1063: a local migration to the existing after listener; no new card infrastructure.
// Session coverage is required because calling the handler directly hid the broken
// place-farmer dispatch. Resource Market is a four-player-only action space.
const setup = (played = true) => {
  const session = createWorkSession({
    seed: 1063,
    options: { playerCount: 4 },
    configure: (state) => {
      for (const player of state.players) {
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        Object.assign(player.resources, {
          wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
          vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
        })
      }
      if (played) state.players[0]!.minorPlayed = [CARD_ID]
    },
  })
  sessions.push(session)
  expect(session.state.players).toHaveLength(4)
  expect(session.state.players.every((player) =>
    player.minorHand[0] === '__test_placeholder__'
    && player.occupationHand[0] === '__test_placeholder__')).toBe(true)
  return session
}

const cardLogs = (response: SessionResponse, key: string) => response.state.log.filter((entry) =>
  entry.key === key && entry.params?.cardId === CARD_ID)

afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

describe('E077 Mattock resource-market placement', () => {
  it('grants exactly one clay with the market goods, and restores it on undo and redo', () => {
    const session = setup()
    const before = session.getState()
    const resourcesBefore = { ...before.state.players[0]!.resources }
    const logsBefore = structuredClone(before.state.log)
    const scoresBefore = structuredClone(before.scores)

    const expectMarket = (response: SessionResponse) => {
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1, food: 1, clay: 1 })
      expect(response.state.players.slice(1).map((player) => player.resources.clay)).toEqual([0, 0, 0])
      expect(response.state.actionSpaces.find((space) => space.id === 'resource-market-4')!.takenBy)
        .toEqual([expect.objectContaining({ playerId: response.state.players[0]!.id })])
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
      expect(cardLogs(response, 'log.cardEffectGain')).toEqual([
        expect.objectContaining({ params: expect.objectContaining({ gain: { clay: 1 } }) }),
      ])
      expect(cardLogs(response, 'log.cardTriggered')).toHaveLength(1)
      expect(response.scores).toEqual(scoresBefore)
    }

    expectMarket(session.takeAction(0, 'resource-market-4'))
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toEqual(resourcesBefore)
    expect(undone.state.actionSpaces.find((space) => space.id === 'resource-market-4')!.takenBy).toEqual([])
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.log).toEqual(logsBefore)
    expect(undone.scores).toEqual(scoresBefore)
    expectMarket(session.takeAction(0, 'resource-market-4'))
  })

  it.each([
    { played: false, actor: 0, spaceId: 'resource-market-4' },
    { played: true, actor: 1, spaceId: 'resource-market-4' },
    { played: true, actor: 0, spaceId: 'forest' },
  ])('does not reward a non-triggering placement: $played / $actor / $spaceId', ({ played, actor, spaceId }) => {
    const session = setup(played)
    session.state.currentPlayerIndex = actor
    session.loadState(session.state)
    const scoresBefore = session.getState().scores
    const response = session.takeAction(actor, spaceId)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.every((player) => player.resources.clay === 0)).toBe(true)
    expect(cardLogs(response, 'log.cardEffectGain')).toEqual([])
    expect(cardLogs(response, 'log.cardTriggered')).toEqual([])
    expect(response.scores).toEqual(scoresBefore)
  })
})
