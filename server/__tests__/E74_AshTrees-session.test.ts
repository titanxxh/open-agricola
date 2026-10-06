import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/E/E074_AshTrees'
import '../../shared/cards/B/B030_WoodPalisades'

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('E074_AshTrees session flow', () => {
  it('lets fencing reach fence selection using stored free fences', () => {
    const session = new GameSession(42, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.wood = 0
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]
    player.minorPlayed.push('E074_AshTrees')
    player.cardStates = {
      ...player.cardStates,
      E074_AshTrees: { counters: { fences: 4 } },
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
    } as unknown as CardListenerContext)
    expect(direct?.doable).toBe(true)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionAshTrees')
    if (resp.interaction.stateId !== 'wait') {
      throw new Error('expected Ash Trees choice')
    }
    const useAll = resp.interaction.request.options?.find(
      (option) =>
        option.labelKey === 'ui.interactionAshTreesUseCount' &&
        option.labelParams?.count === 4,
    )
    expect(useAll).toBeDefined()

    resp = session.resolveChoice(0, useAll!.value)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.farm.farmType : undefined)
      .toBe('fence')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.cardStates?.E074_AshTrees?.counters?.fences).toBe(0)
  })

  it('freeFences only discount fences, palisades still cost full wood (with B30)', () => {
    const session = new GameSession(42, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // 3 fence edges * 1 wood = 3, minus 3 freeFences = 0
    // 2 palisade edges * 2 wood = 4
    // total = 4 wood
    player.resources.wood = 4
    player.minorPlayed.push('E074_AshTrees', 'B030_WoodPalisades')
    player.cardStates = {
      ...player.cardStates,
      E074_AshTrees: { counters: { fences: 5 } },
    }

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Select "use 3" to reserve freeFences=3
    if (resp.interaction.stateId !== 'wait') throw new Error('expected choice')
    const useThree = resp.interaction.request.options?.find(
      (o) => o.labelParams?.count === 3,
    )
    expect(useThree).toBeDefined()
    resp = session.resolveChoice(0, useThree!.value)

    // Enclose tile (0,0) with 2 fences + 2 palisades.
    // Palisades must be on border: H-0-0 (top), V-0-0 (left).
    // Fences on internal edges: H-1-0, V-0-1.
    // Cost: 2 fences × 1 = 2, minus 2 freeFences = 0; 2 palisades × 2 = 4. Total = 4 wood.
    resp = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    const result = resp.state.players[0]!
    expect(result.resources.wood).toBe(0)
    // counter decrements by 2 (newFenceEdges.length), not 5 — palisades do NOT decrement E74 counter
    expect(result.cardStates?.E074_AshTrees?.counters?.fences).toBe(3)
  })
})
