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
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')

    resp = session.resolveChoice(0, CARD_ID)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(8)
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionStockProtectorPlace')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)
  })

  it('blocks after gaining 2 wood if fencing is still not doable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources = { ...player.resources, wood: 0 }

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.options?.find((option) => option.value === '__pass__')?.disabled).toBe(true)

    resp = session.resolveChoice(0, CARD_ID)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    expect(resp.interaction.allowedCommands).toEqual(['undoStep', 'undoAction'])
  })
})
