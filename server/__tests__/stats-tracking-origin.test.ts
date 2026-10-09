import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

describe('PlayerStats resource origin tracking', () => {
  it('card-effect gains route to resourcesFromCards via applyCardGain helper', async () => {
    const { applyCardGain } = await import('../../shared/cards/helpers/card-gain')
    const { createInitialPlayerStats } = await import('../../shared/session/stats')
    const player = {
      id: 'p',
      resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
      cardStates: {},
      stats: createInitialPlayerStats({ isFirstPlayer: false }),
    } as unknown as Parameters<typeof applyCardGain>[0]
    applyCardGain(player, { wood: 2 }, 'A116_WoodCutter')
    expect(player.stats.resourcesFromCards.wood).toBe(2)
    expect(player.stats.resourcesFromBoard.wood ?? 0).toBe(0)
  })

  it('claims wood from Forest action space go to resourcesFromBoard', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    setWorkersAtHome(state, state.players[0]!, 2)
    setWorkersAtHome(state, state.players[1]!, 0)
    state.players[0]!.resources.wood = 0
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 3
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = session.getState().state.players[0]!
    expect(after.stats.resourcesFromBoard.wood).toBe(3)
    expect(after.stats.resourcesFromCards.wood ?? 0).toBe(0)
  })
})
