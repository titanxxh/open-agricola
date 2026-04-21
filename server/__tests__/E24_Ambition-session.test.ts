import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'

import '../../shared/cards/E/E24_Ambition'
import '../../shared/cards/A/A55_JunkRoom'

const CARD_ID = 'E24_Ambition'

const setup = (options?: { minorHand?: string[] }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed.push(CARD_ID)
  player.minorHand = options?.minorHand ?? ['A55_JunkRoom']
  player.resources = {
    ...player.resources,
    wood: 10,
    clay: 10,
    reed: 10,
    stone: 10,
    food: 10,
  }

  session.loadState(state)
  return session
}

describe('E24_Ambition session', () => {
  it('preserves sourceCard after computeReplace swaps meeting-place minor-improvement to improvement-any', () => {
    const session = setup()

    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const enterImprovement = resp.pending.options.find((option) => option.value !== '__skip__')
    expect(enterImprovement).toBeDefined()

    resp = session.resolveChoice(0, enterImprovement!.value)
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    expect(resp.pending.promptKey).toBe('ui.interactionChooseImprovement')
    expect(resp.pending.sourceCard).toBe(CARD_ID)
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)
  })

  it('still offers the optional action when the player has no playable minor but Ambition unlocks major improvements', () => {
    const session = setup({ minorHand: [] })

    const resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const enterImprovement = resp.pending.options.find((option) => option.value !== '__skip__')
    expect(enterImprovement).toBeDefined()
  })
})
