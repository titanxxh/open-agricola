import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { type GameSession as SessionRuleOwner, GameSession, type SessionResponse } from '../game/authoritative-session'
import { describe, expect, it } from 'vitest'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { executeCardListener, getRegisteredCardListeners, type CardListenerDispatchInput } from '../../shared/cards/card-listeners'
import '../../shared/cards/C/C094_StableCleaner'
import '../../shared/cards/C/C088_CarpentersApprentice'

import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, expectFarmSelection, expectTileFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'C094_StableCleaner'
const LISTENER_ID = 'C94-stable-cleaner-anytime'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

const setupParity = ({ inHand = false, wood = 0, food = 0 } = {}) => {
  const session = evidence.track(createWorkSession({ seed: 42 }))
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
    if (selection.interaction.stateId !== 'wait' || expectFarmSelection(selection).farmType !== 'stable') return
    const response = session.commitSelectionChoice(0, {
      stables: expectTileFarmSelection(selection, 'stable').selectableTiles.slice(0, 2),
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
    if (selection.interaction.stateId !== 'wait' || expectFarmSelection(selection).farmType !== 'stable') return

    const response = session.commitSelectionChoice(0, {
      stables: [expectTileFarmSelection(selection, 'stable').selectableTiles[0]!],
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
    const session = evidence.track(createWorkSession({ seed: 42 }))
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
    return {
      session, context: {
        actionHooks: session.actionHooks,
        space: state.actionSpaces.find(space => space.id === 'farm-expansion')!,
        state,
        player,
        actionId: 'stables',
        phase: 'anytime',
      } satisfies CardListenerDispatchInput
    }
  }

  it('emits stables flow with exactCost { wood:1, food:1 } when player has 1 wood + 1 food', () => {


    const { session, context: ctx } = setupContext({ wood: 1, food: 1 })
    const listener = findListener(session, LISTENER_ID)
    expect(listener).toBeDefined()
    const result = session.withCtx(() => executeCardListener(listener!, ctx))
    expect(result?.flow).toBeDefined()
    const seq = result?.flow
    assert.ok(seq?.type === 'seq')

    const stablesLeaf = seq.children.find(
      (c) => c.type === 'leaf' && c.actionId === 'stables',
    )
    assert.ok(stablesLeaf?.type === 'leaf')
    expect(stablesLeaf.actionContext).toBeDefined()
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
    const session = evidence.track(createWorkSession({ seed: 42 }))
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

describe('C094 rule boundaries', () => {

  function wait(response: SessionResponse) {
    assert.equal(response.ok, true, response.error)
    assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction))
    return response.interaction
  }

  const CLEANER = 'C094_StableCleaner'

  function cleaner({ wood = 2, food = 2, played = true, supply = 4 } = {}) {
    return evidence.track(createWorkSession({
      seed: 2094, configure(state) {
        const p = state.players[0]!
        p.occupationPlayed = played ? [CLEANER] : []
        Object.assign(p.resources, { wood, food })
        p.stableTiles = [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }, { row: 1, col: 2 }].slice(0, 4 - supply)
      }
    }))
  }

  const cleanerObserved = (r: SessionResponse) => ({ wood: r.state.players[0]!.resources.wood, food: r.state.players[0]!.resources.food, stables: r.state.players[0]!.stableTiles.length, workers: r.state.actionSpaces.reduce((n, space) => n + space.takenBy.filter(w => w.playerId === r.state.players[0]!.id).length, 0) })

  function enterCleaner(s: GameSession) {
    const r = s.takeAnytimeAction(0, 'C94-stable-cleaner-anytime')
    assert.equal(wait(r).request.kind, 'farm-select')
    return r
  }

  it("builds in two completed activations for one wood and food each without a person", () => {
    const s = cleaner()
    enterCleaner(s)
    assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C94-stable-cleaner-anytime'))
    let r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(cleanerObserved(r), { wood: 1, food: 1, stables: 1, workers: 0 })
    assert.equal(r.interaction.stateId, 'idle')
    enterCleaner(s)
    r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 3 }] })
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(cleanerObserved(r), { wood: 0, food: 0, stables: 2, workers: 0 })
    assert.equal(r.interaction.stateId, 'idle')
    assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C94-stable-cleaner-anytime'))
  })

  it("missing payment unplayed card and exhausted supply cannot activate", () => {
    for (const settings of [{ wood: 0 }, { food: 0 }, { played: false }, { supply: 0 }]) {
      const s = cleaner(settings)
      assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C94-stable-cleaner-anytime'))
    }
  })

  it("illegal stable targets reject before a legal retry", () => {
    const s = cleaner()
    enterCleaner(s)
    for (const stables of [[s.state.players[0]!.roomTiles[0]!], [{ row: 99, col: 99 }]])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables }))
    const r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(cleanerObserved(r), { wood: 1, food: 1, stables: 1, workers: 0 })
    assert.equal(r.interaction.stateId, 'idle')
  })

  it("an unaffordable two-stable plan rejects before paying for one", () => {
    const s = cleaner({ wood: 1, food: 1 })
    enterCleaner(s)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }, { row: 0, col: 3 }] }))
    const r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(cleanerObserved(r), { wood: 0, food: 0, stables: 1, workers: 0 })
    assert.equal(r.interaction.stateId, 'idle')
  })

  it("undo restores stable payment and permits a different legal target", () => {
    const s = cleaner()
    enterCleaner(s)
    assert.equal(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] }).ok, true)
    const undone = s.undoStep()
    assert.equal(undone.ok, true, undone.error)
    assert.deepEqual(cleanerObserved(undone), { wood: 2, food: 2, stables: 0, workers: 0 })
    const r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 3 }] })
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(cleanerObserved(r), { wood: 1, food: 1, stables: 1, workers: 0 })
    assert.equal(r.interaction.stateId, 'idle')
  })

  it("duplicate stable positions must reject without paying or consuming supply", () => {
    const s = cleaner()
    enterCleaner(s)
    const supply = () => s.withCtx(() => getAvailableStableSupplyCount(s.state, s.state.players[0]!))
    assert.equal(supply(), 4)
    const r = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }, { row: 0, col: 2 }] }))
    const actual = { ok: r.ok, ...cleanerObserved(r), uniquePositions: new Set(r.state.players[0]!.stableTiles.map(t => `${t.row},${t.col}`)).size }
    assert.deepEqual(actual, { ok: false, wood: 2, food: 2, stables: 0, workers: 0, uniquePositions: 0 })
    assert.equal(supply(), 4)
    const retry = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    assert.equal(retry.ok, true, retry.error)
    assert.deepEqual(cleanerObserved(retry), { wood: 1, food: 1, stables: 1, workers: 0 })
    assert.deepEqual(retry.state.players[0]!.stableTiles, [{ row: 0, col: 2 }])
    assert.equal(supply(), 3)
    assert.equal(retry.interaction.stateId, 'idle')
  })
})
