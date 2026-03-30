import { describe, expect, it } from 'vitest'

import { GameSession } from '../game-session'
import { playImprovement } from '../../shared/actions/effects/improvement'

describe('A53_Claypipe session flow', () => {
  it('triggers Claypipe at round 7 round-end after being played mid-work phase', () => {
    const session = new GameSession()
    const state = session.getState().state

    state.players = state.players.slice(0, 2)
    state.round = 7
    state.phase = 'work'
    state.currentPlayerIndex = 0
    state.players.forEach((player) => {
      player.workersAvailable = 0
      player.familySize = 2
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorHand = ['A53_Claypipe']
    player.resources.clay = 1
    state.workPhaseObtainedResources[player.id] = { clay: 8 }

    const playResult = playImprovement(state, player, 'minor:A53_Claypipe', 'any')
    expect(playResult.type).toBe('ok')
    expect(player.cardStates?.A53_Claypipe?.infobox).toBe('8 / 7')

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('none')
    expect(resp.state.round).toBe(8)
    expect(resp.state.phase).toBe('work')
    expect(resp.state.players[0]!.cardStates?.A53_Claypipe?.infobox).toBe('0 / 7')

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A53_Claypipe',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 2 })
  })

  it('triggers after taking Hollow and then playing Claypipe via Meeting Place in the same round', () => {
    const session = new GameSession()
    const state = session.getState().state

    state.players = state.players.slice(0, 2)
    state.round = 7
    state.phase = 'work'
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 2
    state.players[0]!.familySize = 2
    state.players[0]!.resources.food = 10
    state.players[0]!.resources.clay = 1
    state.players[0]!.minorHand = ['A53_Claypipe']
    state.players[1]!.workersAvailable = 0
    state.players[1]!.familySize = 1
    state.players[1]!.resources.food = 10

    const hollow = state.actionSpaces.find((space) => space.id === 'hollow-4')
    expect(hollow).toBeDefined()
    hollow!.resources.clay = 8

    session.loadState(state)
    let resp = session.takeAction(0, 'hollow-4')

    expect(resp.ok).toBe(true)
    expect(resp.state.workPhaseObtainedResources[resp.state.players[0]!.id]).toEqual({ clay: 8 })
    expect(resp.pending.type).toBe('confirmNextPlayer')

    resp = session.confirmNextPlayer()
    expect(resp.ok).toBe(true)
    expect(resp.state.currentPlayerIndex).toBe(0)

    resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')

    resp = session.resolveChoice(0, 'minor:A53_Claypipe')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates?.A53_Claypipe?.infobox).toBe('8 / 7')
    expect(resp.pending.type).toBe('confirmNextPlayer')

    resp = session.confirmNextPlayer()

    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('none')
    expect(resp.state.round).toBe(8)
    expect(resp.state.phase).toBe('work')

    const harvestLog = resp.state.log.find(
      (entry) => entry.key === 'log.harvest' && entry.params?.round === 7,
    )
    expect(harvestLog).toBeDefined()

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A53_Claypipe',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 2 })
  })
})
