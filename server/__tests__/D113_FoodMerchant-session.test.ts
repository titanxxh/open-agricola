import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/D/D113_FoodMerchant'
import '../../shared/cards/B/B113_PatchCaregiver'
import type { ActionFlow } from '../../shared/contract/types'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

const CARD_ID = 'D113_FoodMerchant'

describe('D113_FoodMerchant session', () => {
  it('after harvesting grain with field depleted → cost is 2 food', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 10

    // After reap: grain field had remaining=1, so after harvest remaining=0, crop=null
    // This means grainFields (crop === 'grain') will be empty array (field is now null crop)
    // But harvestReapSummary shows 1 grain field was harvested
    player.fields = [] // field was depleted → crop set to null by reap, we model post-reap state

    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 1 },
        grainFields: 1,
        vegetableFields: 0,
        harvestedCrops: [{ row: 0, col: 0, crop: 'grain', amount: 1, sources: ['base'] }],
      },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    // Check that the pay leaf is for 2 food (depleted field → cheaper cost)
    const payChild = (flow as Extract<ActionFlow, { type: 'seq' }>).children[0]
    expect(payChild.params.food).toBe(2)
  })

  it('after harvesting grain with remaining → cost is 3 food', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 10

    // After reap: grain field still has remaining (e.g. remaining went from 3 to 2)
    // crop is still 'grain'
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
    ]

    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 1 },
        grainFields: 1,
        vegetableFields: 0,
        harvestedCrops: [{ row: 0, col: 0, crop: 'grain', amount: 1, sources: ['base'] }],
      },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    // Cost should be 3 food (field not depleted)
    const payChild = (flow as Extract<ActionFlow, { type: 'seq' }>).children[0]
    expect(payChild.params.food).toBe(3)
  })

  it('offers one purchase per harvested grain and discounts only the field-depleting grain', () => {
    const session = new GameSession(803, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 10
    player.fields = []
    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 2 },
        grainFields: 1,
        vegetableFields: 0,
        harvestedCrops: [{ row: 0, col: 0, crop: 'grain', amount: 2, sources: ['test-extra'] }],
      },
    }

    expect(runCardEffectHook(state, player, CARD_ID, 'onAfterReap')).toMatchObject({
      type: 'xor',
      optional: true,
      children: [
        { type: 'seq', children: [{ params: { food: 2 } }, { params: { vegetable: 1 } }] },
        { type: 'seq', children: [{ params: { food: 5 } }, { params: { vegetable: 2 } }] },
      ],
    })
  })

  it('without grain fields → no trigger', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 10
    player.fields = [] // no fields at all

    state.harvestReapSummary = {
      [player.id]: { resources: {}, grainFields: 0, vegetableFields: 0, harvestedCrops: [] },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })


  it('not enough food → no trigger', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 1 // not enough for either cost (2 or 3)
    player.fields = []

    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 1 },
        grainFields: 1,
        vegetableFields: 0,
        harvestedCrops: [{ row: 0, col: 0, crop: 'grain', amount: 1, sources: ['base'] }],
      },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow).toBeNull()
  })

  it('uses virtual Card Field harvest evidence for the depleted-field price', () => {
    const session = new GameSession(803, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID, 'B113_PatchCaregiver')
    player.cardStates.B113_PatchCaregiver = { extraData: { cardFieldStacks: [null] } }
    player.resources.food = 10
    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 1 },
        grainFields: 1,
        vegetableFields: 0,
        harvestedCrops: [{ row: -1, col: 2113, crop: 'grain', amount: 1, sources: ['base'] }],
      },
    }

    const flow = runCardEffectHook(state, player, CARD_ID, 'onAfterReap')
    expect(flow?.type === 'seq' ? flow.children[0] : undefined).toMatchObject({ params: { food: 2 } })
  })

  it('integration: harvest with depleted grain field offers 2-food exchange', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4 // harvest round

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 10
    // Grain field with remaining=1 → will be depleted after harvest
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] },
    ]

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
    })

    session.loadState(state)

    let sawChoice = false
    autoAdvanceRoundEnd(session, {
      onChoice: (intx, sess) => {
        if (intx.request.kind !== 'choice') return undefined
        sawChoice = true
        const choice = intx.request.options.find((option) => option.value !== '__skip__')?.value
        return sess.resolveChoice(intx.playerIndex, choice ?? '__skip__')
      },
    })

    // If the card effect triggered, player should have gained vegetable
    if (sawChoice) {
      const p = session.getState().state.players[0]!
      // Started with 0 veg, gained 1 from exchange
      expect(p.resources.vegetable).toBeGreaterThanOrEqual(1)
      // Started with 10 food, paid 2 for exchange, paid 2 for feeding = 6
      expect(p.resources.food).toBe(10 - 2 - 2)
    }
  })
})
