import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/D/D65_GrainSieve'

const CARD_ID = 'D65_GrainSieve'

describe('D65_GrainSieve session', () => {
  const setupForHarvest = (options: {
    grainFields?: { row: number; col: number; crop: 'grain'; remaining: number }[]
    vegetableFields?: { row: number; col: number; crop: 'vegetable'; remaining: number }[]
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

    player.fields = [
      ...(options.grainFields ?? []),
      ...(options.vegetableFields ?? []),
    ]

    // Set workers to 0 for round end
    state.players.forEach((p) => {
      p.workersAvailable = 0
      p.familySize = 1
      p.resources.food = 10 // enough to feed
    })

    session.loadState(state)
    return session
  }

  it('onAfterReap grants 1 grain when 2+ grain harvested', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 3 }, grainFields: 3, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const children = (flow as any).children
    expect(children).toHaveLength(1)
    expect(children[0].actionId).toBe('gain')
    expect(children[0].params).toEqual({ grain: 1 })
  })

  it('onAfterReap does not trigger when only 1 grain harvested', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 1 }, grainFields: 1, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })

  it('onAfterReap does not trigger when no grain harvested', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 2 }, grainFields: 0, vegetableFields: 2 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })

  it('onAfterReap does not trigger when card not played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    // Card NOT in minorPlayed

    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 3 }, grainFields: 3, vegetableFields: 0 },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })

  it('integration: harvest with 2 grain fields gains 1 bonus grain', () => {
    const session = setupForHarvest({
      grainFields: [
        { row: 0, col: 0, crop: 'grain', remaining: 2 },
        { row: 0, col: 1, crop: 'grain', remaining: 1 },
      ],
    })

    const grainBefore = session.getState().state.players[0]!.resources.grain

    let resp = session.performRoundEnd()

    while (resp.pending.type === 'choice') {
      resp = session.resolveChoice(resp.pending.playerIndex, 'ok')
    }
    while (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
    }
    while (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones as any)
    }

    const player = resp.state.players[0]!
    // 2 grain fields harvested (1 each = 2 grain) + 1 bonus grain from sieve = grainBefore + 3
    expect(player.resources.grain).toBe(grainBefore + 2 + 1)
  })

  it('integration: harvest with 1 grain field does not trigger bonus', () => {
    const session = setupForHarvest({
      grainFields: [
        { row: 0, col: 0, crop: 'grain', remaining: 2 },
      ],
    })

    const grainBefore = session.getState().state.players[0]!.resources.grain

    let resp = session.performRoundEnd()

    while (resp.pending.type === 'harvestFeed') {
      resp = session.confirmHarvestFeed(resp.pending.playerIndex, [])
    }
    while (resp.pending.type === 'animalReorg') {
      resp = session.confirmAnimalReorg(resp.pending.playerIndex, resp.interaction.zones as any)
    }

    const player = resp.state.players[0]!
    // Only 1 grain field (remaining: 2 yields 1 grain) => +1 grain from harvest, no bonus
    expect(player.resources.grain).toBe(grainBefore + 1)
  })
})
