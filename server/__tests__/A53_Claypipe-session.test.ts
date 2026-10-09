import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { playImprovement } from '../../shared/actions/effects/improvement'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'
describe('A053_Claypipe session flow', () => {
  it('triggers Claypipe at round 7 round-end after being played mid-work phase', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state

    state.players = state.players.slice(0, 2)
    state.round = 7
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 2)
      player.resources.food = 10
    })

    const player = state.players[0]!
    player.minorHand = ['A053_Claypipe']
    player.resources.clay = 1
    state.workPhaseObtainedResources[player.id] = { clay: 8 }

    const playResult = playImprovement(state, player, 'minor:A053_Claypipe', 'any')
    expect(playResult.type).toBe('ok')
    expect(player.cardStates?.A053_Claypipe?.infobox).toBe('8 / 7')

    session.loadState(state)
    const resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(8)
    expect(resp.state.roundPhase).toBe('work')
    expect(resp.state.players[0]!.cardStates?.A053_Claypipe?.infobox).toBe('0 / 7')

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A053_Claypipe',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 2 })
  })

  it('triggers after taking Hollow and then playing Claypipe via Meeting Place in the same round', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state

    state.round = 7
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    setActiveWorkerCount(state.players[0]!, 2)
    state.players[0]!.resources.food = 10
    state.players[0]!.resources.clay = 1
    state.players[0]!.minorHand = ['A053_Claypipe']
    setActiveWorkerCount(state.players[1]!, 1)
    markAllWorkersUsed(state, state.players[1]!)
    state.players[1]!.resources.food = 10
    setActiveWorkerCount(state.players[2]!, 0)
    setActiveWorkerCount(state.players[3]!, 0)

    const hollow = state.actionSpaces.find((space) => space.id === 'hollow-4')
    expect(hollow).toBeDefined()
    hollow!.resources.clay = 8

    session.loadState(state)
    let resp = session.takeAction(0, 'hollow-4')

    expect(resp.ok).toBe(true)
    expect(resp.state.workPhaseObtainedResources[resp.state.players[0]!.id]).toEqual({ clay: 8 })
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')

    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
    expect(resp.state.currentPlayerIndex).toBe(0)

    resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    if (resp.interaction.stateId !== 'wait') return
    const improvementOption = resp.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
    expect(improvementOption).toBeDefined()
    resp = session.resolveChoice(0, improvementOption!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const claypipeOption = resp.interaction.request.options?.find((option) => option.value === 'A053_Claypipe')
      if (claypipeOption) {
        resp = session.resolveChoice(0, claypipeOption.value)
        expect(resp.ok).toBe(true)
      }
    }
    expect(resp.state.players[0]!.cardStates?.A053_Claypipe?.infobox).toBe('8 / 7')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')

    resp = confirmNextPlayer(session)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.round).toBe(8)
    expect(resp.state.roundPhase).toBe('work')

    const harvestLog = resp.state.log.find(
      (entry) => entry.key === 'log.harvest' && entry.params?.round === 7,
    )
    expect(harvestLog).toBeDefined()

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A053_Claypipe',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 2 })
  })
})
