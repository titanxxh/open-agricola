import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

describe('C60_SmallPottersOven server session', () => {
  it('logs returned oven and separate cardEffectGain on play', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.clay = 2
    player.resources.food = 0
    player.minorHand = ['C60_SmallPottersOven']
    player.improvements = ['Major_ClayOven']
    player.playedCards = ['major:Major_ClayOven']

    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const c60Option = resp.pending.options.find(
      (option) => option.value === 'minor:C60_SmallPottersOven',
    )
    expect(c60Option).toBeDefined()

    resp = session.resolveChoice(0, c60Option!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain('C60_SmallPottersOven')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(resp.state.availableMajorImprovements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)

    const playLog = resp.state.log.find(
      (entry) => entry.key === 'log.playMinorImprovement',
    )
    expect(playLog?.params?.improvements).toBe('C60_SmallPottersOven')
    expect(playLog?.params?.returnedCards).toEqual(['Major_ClayOven'])
    expect(playLog?.params?.costResources).toEqual({ clay: 2 })

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'C60_SmallPottersOven',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 5 })
  })
})
