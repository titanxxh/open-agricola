import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionSpace, Resource } from '../../shared/contract/types'

const emptyResources = (): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
})

describe('action detail events', () => {
  it('records legacy action detail deltas as public events and UI log entries', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    state.actionSpaces.push({
      id: '__test_legacy_gain',
      nameKey: 'actions.testLegacyGain.name',
      descriptionKey: 'actions.testLegacyGain.description',
      roundAvailable: 1,
      gainPerRound: {},
      resources: emptyResources(),
      takenBy: [],
      canBeExecutedByPlayer: () => true,
      execute: ({ player }) => {
        player.resources.food += 2
        return { type: 'ok', resourcesGained: { food: 2 } }
      },
    } as ActionSpace)
    session.loadState(state)

    const resp = session.takeAction(0, '__test_legacy_gain')

    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'action.detailLogged',
        playerId: 'p1',
        actionId: '__test_legacy_gain',
        detailParts: expect.objectContaining({
          gains: expect.objectContaining({ food: 2 }),
        }),
      }),
    ]))
    expect(resp.state.log).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'log.actionDetail',
        params: expect.objectContaining({
          action: 'actions.testLegacyGain.name',
          detailParts: expect.objectContaining({
            gains: expect.objectContaining({ food: 2 }),
          }),
        }),
      }),
    ]))
  })
})
