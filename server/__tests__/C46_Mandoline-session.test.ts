import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/C/C46_Mandoline'

describe('C46_Mandoline session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3
    const player = state.players[0]!
    player.resources.wood = 1
    player.resources.vegetable = 3
    player.resources.food = 0
    // Directly place card (avoids catalog lookup issue in devPlayCard)
    player.minorPlayed.push('C46_Mandoline')
    session.loadState(state)
    return session
  }

  it('pay 1 veg → 1 VP + future food on next 2 rounds', () => {
    const session = setup()
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    // Anytime action should be available during plow interaction
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('C46-mandoline-anytime')
    const resp2 = session.takeAnytimeAction(0, 'C46-mandoline-anytime')
    expect(resp2.ok).toBe(true)
    const p = resp2.state.players[0]!
    expect(p.resources.vegetable).toBe(2)
    expect(p.cardStates?.['C46_Mandoline']?.counters?.bonusVp).toBe(1)
    expect(isCardFlagged(p, 'C46_Mandoline')).toBe(true)
    const fm = resp2.state.futureMeeples?.filter((m: any) => m.cardId === 'C46_Mandoline')
    expect(fm).toHaveLength(2)
    expect(fm![0].round).toBe(4)
    expect(fm![1].round).toBe(5)
  })

  it('not available without vegetable', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.resources.vegetable = 0
    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('C46-mandoline-anytime')
  })
})
