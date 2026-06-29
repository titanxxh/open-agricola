import { describe, expect, it } from 'vitest'

import { GameSession } from '../game/authoritative-session'

describe('A055_JunkRoom session log dedupe', () => {
  it('logs Junk Room gain only once when playing a minor improvement', () => {
    const session = new GameSession()
    const state = session.getState().state

    state.players = state.players.slice(0, 2)
    state.round = 3
    state.roundPhase = 'work'
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 1
    state.players[0]!.familySize = 1
    state.players[1]!.workersAvailable = 0
    state.players[1]!.familySize = 1

    const player = state.players[0]!
    player.minorPlayed = ['A055_JunkRoom']
    player.minorPlayed.push('A055_JunkRoom')
    player.minorHand = ['A037_Bucksaw']
    player.resources.wood = 1
    player.resources.food = 0

    session.loadState(state)

    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    if (resp.interaction.stateId !== 'wait') return
    const improvementOption = resp.interaction.options?.find((option) => option.value.startsWith('action-improvement-'))
    expect(improvementOption).toBeDefined()
    resp = session.resolveChoice(0, improvementOption!.value)
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const bucksawOption = resp.interaction.options?.find((option) => option.value === 'A037_Bucksaw')
      if (bucksawOption) {
        resp = session.resolveChoice(0, bucksawOption.value)
        expect(resp.ok).toBe(true)
      }
    }

    const junkRoomLogs = resp.state.log.filter(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'A055_JunkRoom',
    )
    expect(junkRoomLogs).toHaveLength(1)
    expect(junkRoomLogs[0]?.params?.gain).toEqual({ food: 1 })
    expect(resp.state.players[0]!.resources.food).toBe(1)
  })
})
