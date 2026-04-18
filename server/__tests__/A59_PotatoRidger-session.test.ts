import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/game/player'
import '../../shared/cards/A/A59_PotatoRidger'

const CARD_ID = 'A59_PotatoRidger'

describe('A59_PotatoRidger session', () => {
  const setup = (options: {
    vegetableFields?: { row: number; col: number; crop: 'vegetable'; remaining: number }[]
    extraVegetable?: number
  }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`minor:${CARD_ID}`)

    // Set up vegetable fields
    if (options.vegetableFields) {
      player.fields = options.vegetableFields
    }

    // Set extra vegetable in supply (on top of what will be harvested)
    player.resources.vegetable = options.extraVegetable ?? 0

    // Set workers to 0 for round end
    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10 // enough to feed
    })

    session.loadState(state)
    return session
  }

  it('with 3 veg after harvest → optional exchange available (direct hook test)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 3

    // Simulate harvestReapSummary showing 1 vegetable field was harvested
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as any).optional).toBe(true) // 3 veg = optional
  })

  it('with 4 veg after harvest → mandatory exchange', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 4

    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as any).optional).toBe(false) // 4 veg = mandatory
  })

  it('with 2 veg after harvest → no trigger', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 2

    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })

  it('no vegetable harvested → no trigger even with 5 veg in supply', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 5

    state.harvestReapSummary = {
      [player.id]: { resources: {}, grainFields: 0, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })

  it('card not played → no trigger', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    // Card NOT in minorPlayed
    player.resources.vegetable = 5

    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })

  it('integration: mandatory exchange triggers during harvest with 4+ veg', () => {
    // 3 veg fields with remaining=1 each → after harvest: 3 veg harvested
    // Plus 1 extra in supply → total 4 veg after harvest → mandatory
    const session = setup({
      vegetableFields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ],
      extraVegetable: 1, // 1 already in supply + 3 harvested = 4 total
    })

    const vegBefore = session.getState().state.players[0]!.resources.vegetable
    const foodBefore = session.getState().state.players[0]!.resources.food

    let resp = session.performRoundEnd()

    // Walk through any pending states
    while (resp.pending.type === 'choice') {
      // Mandatory flow — should auto-execute or we accept it
      resp = session.resolveChoice(resp.pending.playerIndex, 'ok')
    }
    while (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
    }
    while (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones as any)
    }

    const player = resp.state.players[0]!
    // Started with 1 veg + harvested 3 = 4 veg, then -1 from exchange = 3 veg
    // But food cost was paid: -2 for feeding 1 family, +6 from exchange
    expect(player.resources.vegetable).toBe(3) // 4 - 1 = 3
    expect(player.resources.food).toBe(foodBefore + 6 - 2) // +6 from exchange, -2 for feeding
  })

  it('integration: no trigger with 2 veg after harvest', () => {
    const session = setup({
      vegetableFields: [
        { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 1 }] },
      ],
      extraVegetable: 1, // 1 already + 1 harvested = 2 total → no trigger
    })

    let resp = session.performRoundEnd()

    // Should NOT get a choice for this card since 2 < 3
    while (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
    }
    while (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones as any)
    }

    const player = resp.state.players[0]!
    expect(player.resources.vegetable).toBe(2) // 1 + 1 harvested, no exchange
  })
})
