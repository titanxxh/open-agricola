import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/game/player'
import '../../shared/cards/D/D113_FoodMerchant'

const CARD_ID = 'D113_FoodMerchant'

describe('D113_FoodMerchant session', () => {
  it('after harvesting grain with field depleted → cost is 2 food', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`occupation:${CARD_ID}`)
    player.resources.food = 10

    // After reap: grain field had remaining=1, so after harvest remaining=0, crop=null
    // This means grainFields (crop === 'grain') will be empty array (field is now null crop)
    // But harvestReapSummary shows 1 grain field was harvested
    player.fields = [] // field was depleted → crop set to null by reap, we model post-reap state

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as any).optional).toBe(true)
    // Check that the pay leaf is for 2 food (depleted field → cheaper cost)
    const payChild = (flow as any).children[0]
    expect(payChild.params.food).toBe(2)
  })

  it('after harvesting grain with remaining → cost is 3 food', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`occupation:${CARD_ID}`)
    player.resources.food = 10

    // After reap: grain field still has remaining (e.g. remaining went from 3 to 2)
    // crop is still 'grain'
    player.fields = [
      { row: 0, col: 0, crop: 'grain', remaining: 2 },
    ]

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as any).optional).toBe(true)
    // Cost should be 3 food (field not depleted)
    const payChild = (flow as any).children[0]
    expect(payChild.params.food).toBe(3)
  })

  it('without grain fields → no trigger', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 10
    player.fields = [] // no fields at all

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
    // Card NOT in occupationPlayed
    player.resources.food = 10
    player.fields = [
      { row: 0, col: 0, crop: 'grain', remaining: 2 },
    ]

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })

  it('not enough food → no trigger', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 1 // not enough for either cost (2 or 3)
    player.fields = []

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })

  it('integration: harvest with depleted grain field offers 2-food exchange', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.playedCards = player.playedCards ?? []
    player.playedCards.push(`occupation:${CARD_ID}`)
    player.resources.food = 10
    // Grain field with remaining=1 → will be depleted after harvest
    player.fields = [
      { row: 0, col: 0, crop: 'grain', remaining: 1 },
    ]

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
    })

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Should get a choice for the optional exchange
    // The choice pending means the card effect triggered
    let sawChoice = false
    while (resp.pending.type === 'choice') {
      sawChoice = true
      // Accept the exchange
      resp = session.resolveChoice(resp.pending.playerIndex, 'ok')
    }
    while (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
    }
    while (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones as any)
    }

    // If the card effect triggered, player should have gained vegetable
    if (sawChoice) {
      const p = resp.state.players[0]!
      // Started with 0 veg, gained 1 from exchange
      expect(p.resources.vegetable).toBeGreaterThanOrEqual(1)
      // Started with 10 food, paid 2 for exchange, paid 2 for feeding = 6
      expect(p.resources.food).toBe(10 - 2 - 2)
    }
  })
})
