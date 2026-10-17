import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C094_StableCleaner'
import '../../shared/cards/C/C088_CarpentersApprentice'
import type { ActionFlow } from '../../shared/contract/types'
import '../../shared/cards/B/B157_Salter'
import '../../shared/cards/A/A143_Stonecutter'
import '../../shared/cards/E/E146_Reseller'
import '../../shared/cards/E/E047_SyrupTap'
import '../../shared/cards/E/E030_ChildsToy'
import '../../shared/cards/B/B007_Wage'
import '../../shared/cards/C/C054_MarketBooth'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertRuleOutcome } from './_helpers/negative-rule-audit'
import * as audit02Payments from './_helpers/audit/ae-negative-02-payments'

const CARD_ID = 'C094_StableCleaner'
const LISTENER_ID = 'C94-stable-cleaner-anytime'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

const setupParity = ({ inHand = false, wood = 0, food = 0 } = {}) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources = { ...player.resources, wood, food }
  session.loadState(state)
  return session
}

describe('C094 Stable Cleaner parity', () => {
  it('C094 S1: playing Stable Cleaner through Lessons keeps the occupation in play', () => {
    const response = setupParity({ inHand: true }).takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('C094 S2: the anytime action builds two stables for two wood and two food', () => {
    const session = setupParity({ wood: 2, food: 2 })
    const action = session.takeAction(0, 'farmland')
    expect(action.interaction.anytimeActions.some((entry) => entry.id === LISTENER_ID)).toBe(true)

    const selection = session.takeAnytimeAction(0, LISTENER_ID)
    expect(selection.interaction.stateId).toBe('wait')
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.farm.farmType !== 'stable') return
    const response = session.commitSelectionChoice(0, {
      stables: selection.interaction.request.farm.selectableTiles.slice(0, 2),
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(2)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
  })

  it('C094 S3: lacking either wood or food keeps the anytime action unavailable', () => {
    const noWood = setupParity({ food: 1 }).takeAction(0, 'farmland')
    const noFood = setupParity({ wood: 1 }).takeAction(0, 'farmland')

    expect(noWood.interaction.anytimeActions.some((entry) => entry.id === LISTENER_ID)).toBe(false)
    expect(noFood.interaction.anytimeActions.some((entry) => entry.id === LISTENER_ID)).toBe(false)
  })

  it('C094 S4: completing the stable action makes Stable Cleaner available again', () => {
    const session = setupParity({ wood: 2, food: 2 })
    session.takeAction(0, 'farmland')
    const selection = session.takeAnytimeAction(0, LISTENER_ID)
    expect(selection.interaction.stateId).toBe('wait')
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.farm.farmType !== 'stable') return

    const response = session.commitSelectionChoice(0, {
      stables: [selection.interaction.request.farm.selectableTiles[0]!],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.anytimeActions.some((entry) => entry.id === LISTENER_ID)).toBe(true)
  })
})

/**
 * C94 Stable Cleaner — At any time, you can take the Build Stables action
 * without placing a person. If you do, each stable costs you 1 wood + 1 food.
 *
 * Rule: anytime + flagCardNode + STABLES action with costs={WOOD=>1, FOOD=>1}.
 *
 */
describe('C094_StableCleaner — exact cost 1 wood + 1 food', () => {
  const setupContext = (
    resources: { wood?: number; food?: number },
    stableTilesLength = 0,
    consumedStables = 0,
  ) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources = {
      ...player.resources,
      wood: resources.wood ?? 0,
      food: resources.food ?? 0,
    }
    player.stableTiles = Array.from({ length: stableTilesLength }, (_, i) => ({
      row: 1,
      col: i + 1,
    }))
    player.supplyTokensConsumed = consumedStables > 0 ? { stable: consumedStables } : {}
    session.loadState(state)
    return { session, context: {
      actionHooks: session.actionHooks,
      state,
      player,
      actionId: 'stables',
      phase: 'anytime' as const,
    } as unknown as CardListenerContext }
  }

  it('emits stables flow with exactCost { wood:1, food:1 } when player has 1 wood + 1 food', () => {


    const { session, context: ctx } = setupContext({ wood: 1, food: 1 })
    const listener = findListener(session, LISTENER_ID)
    expect(listener).toBeDefined()
    const result = session.withCtx(() => executeCardListener(listener!, ctx))
    expect(result?.flow).toBeDefined()
    const seq = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')

    const stablesLeaf = seq.children.find(
      (c) => c.type === 'leaf' && c.actionId === 'stables',
    ) as Extract<ActionFlow, { type: 'leaf' }> | undefined
    expect(stablesLeaf).toBeDefined()
    expect(stablesLeaf!.actionContext).toBeDefined()
    expect(stablesLeaf!.actionContext!.exactCost).toEqual({ wood: 1, food: 1 })
    expect(stablesLeaf!.actionContext!.costOverride).toBeUndefined()
    expect(stablesLeaf!.actionContext!.trueAction).toBe(false)
    expect(stablesLeaf!.sourceCard).toBe(CARD_ID)
  })

  it('emits with no wood when a stables cost modifier covers the wood', () => {

    const { session, context: ctx } = setupContext({ wood: 0, food: 5 }, 2)
    const listener = findListener(session, LISTENER_ID)!
    ctx.player.occupationPlayed.push('C088_CarpentersApprentice')
    const result = session.withCtx(() => executeCardListener(listener, ctx))
    expect(result?.flow).toBeDefined()
  })

  it('does NOT emit when player lacks food (no 1 food)', () => {

    const { session, context: ctx } = setupContext({ wood: 5, food: 0 })
    const listener = findListener(session, LISTENER_ID)!
    const result = session.withCtx(() => executeCardListener(listener, ctx))
    expect(result).toBeUndefined()
  })

  it('does NOT emit when player already has 4 stables', () => {

    const { session, context: ctx } = setupContext({ wood: 5, food: 5 }, 4)
    const listener = findListener(session, LISTENER_ID)!
    const result = session.withCtx(() => executeCardListener(listener, ctx))
    expect(result).toBeUndefined()
  })

  it('does NOT emit when consumed stable tokens exhaust reserve', () => {

    const { session, context: ctx } = setupContext({ wood: 5, food: 5 }, 0, 4)
    const listener = findListener(session, LISTENER_ID)!
    const result = session.withCtx(() => executeCardListener(listener, ctx))
    expect(result).toBeUndefined()
  })

  it('emits when player has 3 stables and resources (room for 1 more)', () => {

    const { session, context: ctx } = setupContext({ wood: 1, food: 1 }, 3)
    const listener = findListener(session, LISTENER_ID)!
    const result = session.withCtx(() => executeCardListener(listener, ctx))
    expect(result?.flow).toBeDefined()
  })

  it('anytime stable can be built with C88 discount and no wood', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID, 'C088_CarpentersApprentice']
    player.resources.food = 1
    player.resources.wood = 0
    player.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
    session.loadState(state)

    const action = session.takeAction(0, 'farmland')
    expect(action.ok).toBe(true)
    expect(action.interaction.anytimeActions.some((entry) => entry.id === LISTENER_ID)).toBe(true)

    const prompt = session.takeAnytimeAction(0, LISTENER_ID)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.stateId).toBe('wait')
    if (prompt.interaction.stateId !== 'wait') return
    expect(prompt.interaction.request.kind).toBe('farm-select')

    const built = session.commitSelectionChoice(0, {
      stables: [{ row: 1, col: 4 }],
    })
    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.resources.food).toBe(0)
    expect(built.state.players[0]!.stableTiles).toHaveLength(3)
  })
})

describe('ae-negative-02-payments', () => {
  const { cleaner, cleanerObserved, enterCleaner } = audit02Payments
  describe('C094 negative payment and target rules', () => {
    it('C094 N1 OA builds in two completed activations for one wood and food each without a person', () => {
      const s = cleaner()
      try {
        enterCleaner(s)
        assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C94-stable-cleaner-anytime'))
        let r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
        assert.equal(r.ok, true, r.error)
        assert.deepEqual(cleanerObserved(r), { wood: 1, food: 1, stables: 1, workers: 0 })
        enterCleaner(s)
        r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 3 }] })
        assert.equal(r.ok, true, r.error)
        assert.deepEqual(cleanerObserved(r), { wood: 0, food: 0, stables: 2, workers: 0 })
        assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C94-stable-cleaner-anytime'))
      } finally { s.dispose() }
    })
    it('C094 N2 OA missing payment unplayed card and exhausted supply cannot activate', () => {
      for (const settings of [{ wood: 0 }, { food: 0 }, { played: false }, { supply: 0 }]) {
        const s = cleaner(settings)
        try { assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C94-stable-cleaner-anytime')) } finally { s.dispose() }
      }
    })
    it('C094 N3 OA illegal stable targets reject before a legal retry', () => {
      const s = cleaner()
      try {
        enterCleaner(s)
        for (const stables of [[s.state.players[0]!.roomTiles[0]!], [{ row: 99, col: 99 }]]) assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables }))
        const r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
        assert.equal(r.ok, true, r.error)
        assert.deepEqual(cleanerObserved(r), { wood: 1, food: 1, stables: 1, workers: 0 })
      } finally { s.dispose() }
    })
    it('C094 N4 OA an unaffordable two-stable plan rejects before paying for one', () => {
      const s = cleaner({ wood: 1, food: 1 })
      try {
        enterCleaner(s)
        assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }, { row: 0, col: 3 }] }))
        const r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
        assert.equal(r.ok, true, r.error)
        assert.deepEqual(cleanerObserved(r), { wood: 0, food: 0, stables: 1, workers: 0 })
      } finally { s.dispose() }
    })
    it('C094 N5 OA undo restores stable payment and permits a different legal target', () => {
      const s = cleaner()
      try {
        enterCleaner(s)
        assert.equal(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] }).ok, true)
        const undone = s.undoStep()
        assert.equal(undone.ok, true, undone.error)
        assert.deepEqual(cleanerObserved(undone), { wood: 2, food: 2, stables: 0, workers: 0 })
        const r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 3 }] })
        assert.equal(r.ok, true, r.error)
        assert.deepEqual(cleanerObserved(r), { wood: 1, food: 1, stables: 1, workers: 0 })
      } finally { s.dispose() }
    })
  })
  describe('C094 duplicate position boundary', () => {
    it('C094 N6 OA duplicate stable positions must reject without paying or consuming supply', () => {
      const s = cleaner()
      try {
        enterCleaner(s)
        const r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }, { row: 0, col: 2 }] })
        const actual = { ok: r.ok, ...cleanerObserved(r), uniquePositions: new Set(r.state.players[0]!.stableTiles.map(t => `${t.row},${t.col}`)).size }
        assertRuleOutcome(actual, { ok: false, wood: 2, food: 2, stables: 0, workers: 0, uniquePositions: 0 })
      } finally { s.dispose() }
    })
  })
})
