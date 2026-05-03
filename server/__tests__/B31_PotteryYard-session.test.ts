import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { B31_PotteryYard } from '../../shared/cards/B/B31_PotteryYard'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

describe('B31_PotteryYard prerequisite', () => {
  it('blocks when player has neither Pottery nor LargePottery', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.improvements = []
    player.minorPlayed = []
    expect(meetsCardPrerequisites(player, B31_PotteryYard, state.round, state)).toBe(false)
  })

  it('allows when player owns Major_Pottery', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.improvements = ['Major_Pottery']
    expect(meetsCardPrerequisites(player, B31_PotteryYard, state.round, state)).toBe(true)
  })
})
