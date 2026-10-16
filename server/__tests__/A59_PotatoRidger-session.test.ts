import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import '../../shared/cards/A/A059_PotatoRidger'
import type { PlayerState } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { getChoiceOptions, confirmNext } from './_helpers/session-assertions'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A059_PotatoRidger'
const finishHarvest = (session: GameSession) => {
  let response = session.performRoundEnd()
  for (let step = 0; step < 20; step++) {
    assert.equal(response.ok, true, response.error)
    if (response.interaction.stateId !== 'wait') {
      assert.equal(response.state.round, 5)
      return response
    }
    const { request, playerIndex, sourceCard } = response.interaction
    if (request.kind === 'feed') response = session.resolveChoice(playerIndex, 'confirm', { selections: [] })
    else if (request.kind === 'confirm-next-player') response = confirmNext(session, response)
    else if (request.kind === 'confirm-player-switch') response = session.resolveChoice(playerIndex, 'confirm')
    else {
      assert.equal(request.kind, 'choice', JSON.stringify(response.interaction))
      const candidates = getChoiceOptions(response).filter(option => !option.disabled && (sourceCard === CARD_ID
        ? option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid?.vegetable === 1
        : option.value === '__skip__'))
      assert.equal(candidates.length, 1, JSON.stringify(response.interaction))
      const option = candidates[0]
      assert.ok(option)
      response = session.resolveChoice(playerIndex, option.value)
    }
  }
  assert.fail('Harvest did not finish')
}

describe('A059_PotatoRidger session', () => {
  const setup = (options: {
    vegetableFields?: PlayerState['fields']
    extraVegetable?: number
  }) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4 // harvest round
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
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
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 3
    // Simulate harvestReapSummary showing 1 vegetable field was harvested
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }
    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeDefined()
    expect(flow?.type).toBe('seq')
    if (flow?.type !== 'seq') throw new Error('Missing optional exchange sequence')
    expect(flow.optional).toBe(true); // 3 veg = optional
  })
  it('with 4 veg after harvest → mandatory exchange', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 4
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }
    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeDefined()
    expect(flow?.type).toBe('seq')
    if (flow?.type !== 'seq') throw new Error('Missing mandatory exchange sequence')
    expect(flow.optional).toBe(false); // 4 veg = mandatory
  })
  it('with 2 veg after harvest → no trigger', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 2
    state.harvestReapSummary = {
      [player.id]: { resources: { vegetable: 1 }, grainFields: 0, vegetableFields: 1 },
    }
    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
    expect(flow).toBeNull()
  })
  it('no vegetable harvested → no trigger even with 5 veg in supply', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.vegetable = 5
    state.harvestReapSummary = {
      [player.id]: { resources: {}, grainFields: 0, vegetableFields: 0 },
    }
    const flow = session.withCtx(() => runCardEffectHook(state, player, CARD_ID, 'onAfterReap'))
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

    const foodBefore = session.getState().state.players[0]!.resources.food

    finishHarvest(session)

    const player = session.getState().state.players[0]!
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

    finishHarvest(session)

    const player = session.getState().state.players[0]!
    expect(player.resources.vegetable).toBe(2) // 1 + 1 harvested, no exchange
  })
})
