import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'

import '../../shared/cards/E/E74_AshTrees'

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('E74_AshTrees session flow', () => {
  it('lets fencing reach fence selection using stored free fences', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.wood = 0
    player.fields = [
      { row: 0, col: 0, crop: 'grain', remaining: 1 },
      { row: 0, col: 1, crop: 'grain', remaining: 1 },
    ]
    player.minorPlayed.push('E74_AshTrees')
    player.playedCards.push('minor:E74_AshTrees')
    player.cardStates = {
      ...player.cardStates,
      E74_AshTrees: { counters: { fences: 4, triggerCount: 0 } },
    }

    session.loadState(state)
    const listener = getRegisteredCardListeners().find((entry) => entry.id === 'E74-ash-trees-isdoable-fence')
    expect(listener).toBeDefined()
    const direct = executeCardListener(listener!, {
      state: session.getState().state,
      player: session.getState().state.players[0]!,
      space: session.getState().state.actionSpaces.find((space) => space.id === 'fencing')!,
      actionId: 'fence',
      phase: 'isDoable',
      doable: false,
    } as any)
    expect(direct?.doable).toBe(true)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionAshTrees')
    if (resp.pending.type !== 'choice') {
      throw new Error('expected Ash Trees choice')
    }
    const useAll = resp.pending.options.find(
      (option) =>
        option.labelKey === 'ui.interactionAshTreesUseCount' &&
        option.labelParams?.count === 4,
    )
    expect(useAll).toBeDefined()

    resp = session.resolveChoice(0, useAll!.value)
    expect(resp.interaction.stateId).toBe('farmSelect')
    expect(resp.interaction.stateId === 'farmSelect' ? resp.interaction.farm.farmType : undefined)
      .toBe('fence')

    resp = session.commitFarmChoice(0, 'fence', {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.cardStates?.E74_AshTrees?.counters?.fences).toBe(0)
    expect(resp.state.players[0]!.cardStates?.E74_AshTrees?.counters?.triggerCount).toBe(1)
  })
})
