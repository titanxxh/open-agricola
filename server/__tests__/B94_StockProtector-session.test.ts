import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/B/B94_StockProtector'

const CARD_ID = 'B94_StockProtector'

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('B94_StockProtector session', () => {
  it('preserves sourceCard on the granted post-fencing place-farmer choice', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources = {
      ...player.resources,
      wood: 6,
    }

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('farmSelect')

    resp = session.commitFarmChoice(0, 'fence', {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('ui.interactionStockProtectorPlace')
    expect((resp.pending as any).sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('choice')
    expect((resp.interaction as any).sourceCard).toBe(CARD_ID)
  })
})
