import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/game/player'
import '../../shared/cards/C/C106_PotatoHarvester'
import type { ActionFlow } from '../../shared/game/types'

const CARD_ID = 'C106_PotatoHarvester'

describe('C106_PotatoHarvester session', () => {
  const setupForHarvest = (options: {
    vegetableFields?: { row: number; col: number; crop: 'vegetable'; remaining: number }[]
    grainFields?: { row: number; col: number; crop: 'grain'; remaining: number }[]
  }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    player.fields = [
      ...(options.vegetableFields ?? []),
      ...(options.grainFields ?? []),
    ]

    // Set workers to 0 for round end
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10 // enough to feed
    })

    session.loadState(state)
    return session
  }

  it('onBuy grants 3 food', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    const flow = runCardEffectHook(state, player, CARD_ID, 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ food: 3 })
  })

  it('onAfterReap grants 1 food per vegetable harvested', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 3 }, grainFields: 0, vegetableFields: 3 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(1)
    expect(children[0].actionId).toBe('gain')
    expect(children[0].params).toEqual({ food: 3 })
  })

  it('onAfterReap does not trigger when no vegetables harvested', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 2 }, grainFields: 2, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })


  it('integration: harvest with 2 vegetable fields gains 2 food', () => {
    const session = setupForHarvest({
      vegetableFields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ],
    })

    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.performRoundEnd()

    // Walk through pending states
    while (resp.pending.type === 'choice') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'ok')
    }
    while (resp.pending.type === 'harvestFeed') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
    }
    while (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones as any)
    }

    const player = resp.state.players[0]!
    // 2 veg harvested => +2 food from card, -2 food for feeding 1 family
    expect(player.resources.food).toBe(foodBefore + 2 - 2)
  })

  it('integration: harvest with only grain fields does not trigger', () => {
    const session = setupForHarvest({
      grainFields: [
        { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 1 }] },
      ],
    })

    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.performRoundEnd()

    while (resp.pending.type === 'harvestFeed') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', { selections: [] })
    }
    while (resp.pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'confirm', resp.interaction.zones as any)
    }

    const player = resp.state.players[0]!
    // Only grain harvested, no bonus food from card. -2 for feeding.
    expect(player.resources.food).toBe(foodBefore - 2)
  })
})
