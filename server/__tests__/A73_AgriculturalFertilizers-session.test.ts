import { setWorkersAtHome } from '../../shared/domain/player'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A073_AgriculturalFertilizers'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState, type FarmTilePosition } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectTileFarmSelection } from './_helpers/session-assertions'
import { getAvailableStableSupplyCount, getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { getUsedFarmyardTileKeys } from '../../shared/domain/farmyard-usage'

import '../../shared/cards/A/A020_DoubleTurnPlow'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A073_AgriculturalFertilizers'

const edgesForTwoTiles = [
  'H-1-1',
  'H-1-2',
  'H-2-1',
  'H-2-2',
  'V-1-1',
  'V-1-3',
]

const edgesForOneTile = [
  'H-1-1',
  'H-2-1',
  'V-1-1',
  'V-1-2',
]

describe('A073_AgriculturalFertilizers session', () => {
  const setupFencing = () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 20
    player.resources.grain = 3
    player.resources.vegetable = 1
    // Add empty fields for sow
    player.fields = [
      { row: 0, col: 3, stacks: [] },
      { row: 0, col: 4, stacks: [] },
    ]

    session.loadState(state)
    return session
  }

  it('grants optional sow after fencing 2+ tiles', () => {
    const session = setupFencing()

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTwoTiles,
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    // After fencing 2 tiles, optional sow should be offered
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(getChoiceOptions(resp)?.some((o) => o.labelKey === 'actions.sow.name')).toBe(true)
    expect(getChoiceOptions(resp)?.some((o) => o.labelKey === 'ui.interactionOptionalSkip')).toBe(true)
  })

  it('does NOT grant sow after fencing only 1 tile', () => {
    const session = setupFencing()

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: edgesForOneTile,
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    // Only 1 tile fenced, no sow offered
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('grants optional sow after building 2 stables via farm-expansion', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.wood = 20
    player.resources.grain = 2
    player.resources.vegetable = 1
    player.fields = [
      { row: 0, col: 3, stacks: [] },
    ]

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    if (resp.interaction.request.kind === 'choice') {
      const stables = getChoiceOptions(resp)!.find((option) => option.labelKey === 'actions.stables.name')
      expect(stables).toBeDefined()
      resp = session.resolveChoice(0, stables!.value)
    }
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const farm = expectTileFarmSelection(resp, 'stable')
    const tiles = farm.selectableTiles
    expect(tiles.length).toBeGreaterThanOrEqual(2)
    const [s1, s2] = tiles

    resp = session.commitSelectionChoice(0, { stables: [s1!, s2!] })
    expect(resp.ok).toBe(true)
    // 2 stables built => 2 new used spaces => optional sow offered
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(getChoiceOptions(resp)?.some((o) => o.labelKey === 'actions.sow.name')).toBe(true)
  })

  it('cannot play A73 without at least 1 pasture (prerequisite)', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    // No pastures
    player.pastures = []
    // Deterministic hand: A25 (free, no prerequisite) + A73 (needs pasture).
    // `new GameSession()` deals a random hand from RNG (Math.random seed),
    // so the default hand occasionally contained 7 cards where none were
    // playable — skipping the choice prompt and making this test flaky.
    // Pinning the hand to a known-playable card plus A73 removes the RNG
    // dependency.
    player.minorHand = ['A025_Bassinet', CARD_ID]

    session.loadState(state)

    const resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // A73 should not be in the playable options (no pasture)
    const a73Option = getChoiceOptions(resp)?.find(
      (option) => option.value === CARD_ID,
    )
    expect(a73Option).toBeUndefined()
  })
})

describe('A073_AgriculturalFertilizers session', () => {
  const CARD_ID = 'A073_AgriculturalFertilizers'

  it('A073 S1: a pasture allows playing Agricultural Fertilizers for free', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6073, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    player.pastures = [{
      id: 'prerequisite', tiles: [{ row: 2, col: 4 }],
      animalType: null, animalCount: 0,
    }]
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)
      && resp.interaction.stateId === 'wait'
      && !getChoiceOptions(resp)?.some((option) => option.value === CARD_ID)) {
      const enter = getChoiceOptions(resp)?.find((option) => option.value.startsWith('action-improvement-'))
      if (enter) resp = session.resolveChoice(0, enter.value)
    }
    if (resp.state.players[0]!.minorHand.includes(CARD_ID)) {
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
      const card = getChoiceOptions(resp)?.find((option) => option.value === CARD_ID)
      expect(card).toBeDefined()
      resp = session.resolveChoice(0, card!.value)
    }

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A073 S2: without a pasture Agricultural Fertilizers is not offered', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!

    player.pastures = []




    player.minorHand = ['A025_Bassinet', CARD_ID]

    session.loadState(state)

    const resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const a73Option = getChoiceOptions(resp)?.find(
      (option) => option.value === CARD_ID,
    )
    expect(a73Option).toBeUndefined()
  })
})

describe("A073 command boundaries", () => {
  const FERT = 'A073_AgriculturalFertilizers', PLOW = 'A020_DoubleTurnPlow'
  function pasture(state: GameState, cols = [4]) {
    const p = state.players[0]!
    p.pastures = [{ id: 'actual-pasture', tiles: cols.map(col => ({ row: 2, col })), animalType: null, animalCount: 0 }]
    const edges = cols.flatMap(col => [`H-2-${col}`, `H-3-${col}`]).concat([`V-2-${Math.min(...cols)}`, `V-2-${Math.max(...cols) + 1}`])
    p.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  }
  function setup({ played = true, round = 5, resources = {}, fields = 2, pastureCols = [], configure = () => {
  } }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    fields?: number
    pastureCols?: number[]
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A016_RammedClay', 'A054_Credit']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        p.minorPlayed = played ? [FERT] : []
        if (!played)
          p.minorHand.push(FERT)
        p.fields = Array.from({ length: fields }, (_, n) => ({ row: 0, col: n + 1, stacks: [] }))
        Object.assign(p.resources, resources)
        if (pastureCols.length)
          pasture(state, pastureCols)
        configure(state)
      } }))
    assert.equal(s.getState().interaction.stateId, 'idle')
    if (pastureCols.length)
      s.withCtx(() => assert.equal(getOwnOrdinaryFenceReserveCount(s.state.players[0]!), 15 - (2 * pastureCols.length + 2)))
    return s
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function res(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.resources
  }
  function opts(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    const r = ok(s.takeAction(actor, space))
    assert.ok(r.state.actionSpaces.find(a => a.id === space)!.takenBy.some(w => w.playerId === r.state.players[actor]!.id))
    return r
  }
  function close(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.promptKey === 'ui.interactionFarmExpansionSelect' && opts(r).some(o => o.value === '__done__'))
      return ok(s.resolveChoice(r.interaction.playerIndex, '__done__'))
    return r
  }
  function complete(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    return r
  }
  function enter(s: GameSession, actor = 0, space = 'meeting-place') {
    let r = turn(s, actor, space)
    const branch = opts(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(actor, branch.value))
    return r
  }
  function purchase(s: GameSession, r: SessionResponse, card: string, actor = 0) {
    assert.ok(opts(r).some(o => o.value === card && !o.disabled))
    r = ok(s.resolveChoice(actor, card))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.promptKey === 'prompt.selectPayment') {
      const choices = opts(r).filter(o => o.value !== 'cancel' && !o.disabled)
      assert.equal(choices.length, 1, JSON.stringify(r.interaction))
      const choice = choices[0]!
      r = ok(s.resolveChoice(actor, choice.value))
    }
    assert.ok(r.state.players[actor]!.minorPlayed.includes(card) || r.state.players[actor]!.improvements.includes(card))
    const events = r.state.events.filter(e => 'cardId' in e && e.cardId === card && 'payment' in e)
    if (card !== PLOW)
      assert.equal(events.length, 1)
    return r
  }
  function buy(s: GameSession, card: string) {
    return complete(purchase(s, enter(s), card))
  }
  function deny(s: GameSession, card: string, space = 'meeting-place') {
    const r = enter(s, 0, space)
    assert.equal(opts(r).some(o => o.value === card && !o.disabled), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    const retry = complete(purchase(s, r, 'A016_RammedClay'))
    assert.ok(retry.state.players[0]!.minorHand.includes(card) || card.startsWith('Major_'))
    return retry
  }
  function farm(s: GameSession, kind: 'stable' | 'room', actor = 0) {
    let r = turn(s, actor, 'farm-expansion')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const choice = opts(r).find(o => o.value.includes(kind === 'stable' ? 'stables' : 'construct'))
      assert.ok(choice, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(actor, choice.value))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === kind, JSON.stringify(r.interaction))
    return r
  }
  function stable(s: GameSession, tiles: FarmTilePosition[] = [{ row: 1, col: 1 }, { row: 1, col: 2 }], actor = 0) {
    farm(s, 'stable', actor)
    const r = ok(s.commitSelectionChoice(actor, { stables: tiles }))
    assert.equal(r.state.players[actor]!.stableTiles.length, tiles.length)
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[actor]!)), 4 - tiles.length)
    return close(s, r)
  }
  const TWO = ['H-1-3', 'H-1-4', 'H-2-3', 'V-1-3', 'V-1-5'], ONE = ['H-1-4', 'V-1-4', 'V-1-5']
  function fence(s: GameSession, two = true) {
    turn(s, 0, 'fencing')
    const r = ok(s.commitSelectionChoice(0, { edges: two ? TWO : ONE, extraWood: 0 }))
    assert.equal(r.state.players[0]!.fenceSegments.length, two ? 9 : 7)
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)), two ? 6 : 8)
    return r
  }
  function offeredSow(r: SessionResponse) {
    return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.sourceCard === FERT && getChoiceOptions(r).some(o => o.labelKey === 'actions.sow.name' && !o.disabled)
  }
  function sowSelect(s: GameSession, r: SessionResponse, actor = 0) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const choices = opts(r).filter(o => o.labelKey === 'actions.sow.name' && !o.disabled)
      assert.equal(choices.length, 1, JSON.stringify(r.interaction))
      const choice = choices[0]!
      r = ok(s.resolveChoice(actor, choice.value))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'sow', JSON.stringify(r.interaction))
    return r
  }
  function sow(s: GameSession, r: SessionResponse, crops: {
    row: number
    col: number
    crop: 'grain' | 'vegetable'
  }[], actor = 0) {
    sowSelect(s, r, actor)
    return complete(close(s, ok(s.commitSelectionChoice(actor, { crops }))))
  }
  function stack(r: SessionResponse, col: number, actor = 0) {
    return r.state.players[actor]!.fields.find(f => f.row === 0 && f.col === col)?.stacks?.[0]?.remaining ?? 0
  }
  function undo(s: GameSession, before: string, retry: () => SessionResponse) {
    assertUndoRestored(before, s.undoAction())
    return retry()
  }
  it("a real pasture permits the free actual purchase", () => {
    const r = buy(setup({ played: false, pastureCols: [4] }), FERT)
    assert.equal(res(r).wood, 0)
  })
  it("no pasture rejects the forged purchase before a legal retry", () => {
    const r = deny(setup({ played: false }), FERT)
    assert.equal(res(r).wood, 0)
  })
  it("two new stable spaces grant one additional Sow paying both crop seeds", () => {
    const s = setup({ pastureCols: [4], resources: { wood: 4, grain: 1, vegetable: 1 } })
    const before = getUsedFarmyardTileKeys(s.getState().state.players[0]!).size
    let r = stable(s)
    assert.equal(getUsedFarmyardTileKeys(r.state.players[0]!).size - before, 2)
    assert.equal(offeredSow(r), true)
    r = sow(s, r, [{ row: 0, col: 1, crop: 'grain' }, { row: 0, col: 2, crop: 'vegetable' }])
    assert.equal(res(r).wood, 0)
    assert.equal(res(r).grain, 0)
    assert.equal(res(r).vegetable, 0)
    assert.equal(stack(r, 1), 3)
    assert.equal(stack(r, 2), 2)
  })
  it("one new stable space gives no additional Sow", () => {
    const r = complete(stable(setup({ pastureCols: [4], resources: { wood: 2, grain: 1 } }), [{ row: 1, col: 1 }]))
    assert.equal(offeredSow(r), false)
    assert.equal(res(r).wood, 0)
    assert.equal(res(r).grain, 1)
  })
  it("two stables inside already used pasture give no additional Sow", () => {
    const s = setup({ pastureCols: [3, 4], resources: { wood: 4, grain: 1 } })
    const before = getUsedFarmyardTileKeys(s.getState().state.players[0]!).size
    const r = complete(stable(s, [{ row: 2, col: 3 }, { row: 2, col: 4 }]))
    assert.equal(getUsedFarmyardTileKeys(r.state.players[0]!).size - before, 0)
    assert.equal(offeredSow(r), false)
    assert.equal(res(r).wood, 0)
  })
  it("declining the granted Sow preserves both seeds", () => {
    const s = setup({ pastureCols: [4], resources: { wood: 4, grain: 1, vegetable: 1 } })
    let r = stable(s)
    assert.equal(offeredSow(r), true)
    const skip = opts(r).find(o => o.value === '__skip__')
    assert.ok(skip)
    r = complete(close(s, ok(s.resolveChoice(0, skip.value))))
    assert.equal(res(r).grain, 1)
    assert.equal(res(r).vegetable, 1)
    assert.equal(stack(r, 1), 0)
  })
  it("fencing two adjacent new spaces grants one additional Sow", () => {
    const s = setup({ pastureCols: [4], resources: { wood: 5, grain: 1 } })
    let r = fence(s)
    assert.equal(offeredSow(r), true)
    r = sow(s, r, [{ row: 0, col: 1, crop: 'grain' }])
    assert.equal(res(r).wood, 0)
    assert.equal(stack(r, 1), 3)
  })
  it("fencing one adjacent new space gives no additional Sow", () => {
    const r = complete(fence(setup({ pastureCols: [4], resources: { wood: 3, grain: 1 } }), false))
    assert.equal(offeredSow(r), false)
    assert.equal(res(r).wood, 0)
    assert.equal(res(r).grain, 1)
  })
  it("two actual wooden rooms grant one additional Sow after full payment", () => {
    const s = setup({ pastureCols: [4], resources: { wood: 10, reed: 4, grain: 1 } })
    farm(s, 'room')
    let r = ok(s.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }, { row: 2, col: 1 }] }))
    assert.equal(r.state.players[0]!.rooms, 4)
    assert.equal(res(r).wood, 0)
    assert.equal(res(r).reed, 0)
    assert.equal(offeredSow(r), true)
    r = sow(s, r, [{ row: 0, col: 1, crop: 'grain' }])
    assert.equal(res(r).grain, 0)
    assert.equal(stack(r, 1), 3)
  })
  it("separate one-space actions do not accumulate a two-space trigger", () => {
    const s = setup({ pastureCols: [4], resources: { wood: 5, grain: 1 } })
    complete(fence(s, false))
    turn(s, 1, 'grain-seeds')
    const r = complete(stable(s, [{ row: 1, col: 1 }]))
    assert.equal(offeredSow(r), false)
    assert.equal(res(r).grain, 1)
    assert.equal(res(r).wood, 0)
  })
  it("opponent two-stable construction cannot grant owner Sow", () => {
    const s = setup({ pastureCols: [4], resources: { grain: 1 }, configure(state) {
        state.players[1]!.resources.wood = 4
      } })
    turn(s, 0, 'grain-seeds')
    const r = complete(stable(s, undefined, 1))
    assert.equal(offeredSow(r), false)
    assert.equal(res(r).grain, 2)
    assert.equal(res(r, 1).wood, 0)
  })
  it("unplayed Fertilizers cannot grant Sow after construction", () => {
    const r = complete(stable(setup({ played: false, pastureCols: [4], resources: { wood: 4, grain: 1 } })))
    assert.equal(offeredSow(r), false)
    assert.equal(res(r).grain, 1)
  })
  it("Double Turn Plow exposes its real two-field action granularity without a resolved rule oracle", () => {
    const s = setup({ round: 3, fields: 0, pastureCols: [4], resources: { grain: 2 }, configure(state) {
        state.players[0]!.minorHand.push(PLOW)
      } })
    let r = purchase(s, enter(s), PLOW)
    const acceptPlow = (response: SessionResponse) => {
      assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice')
      assert.equal(response.interaction.sourceCard, PLOW)
      const choices = opts(response).filter(o => !o.disabled && o.sourceCard === PLOW && o.labelKey === 'actions.plow.name')
      assert.equal(choices.length, 1, JSON.stringify(response.interaction))
      return ok(s.resolveChoice(0, choices[0]!.value))
    }
    r = acceptPlow(r); // Accept the card's optional sequence before its two independent plow steps.
    for (const expectedFieldCount of [1, 2]) {
      r = acceptPlow(r)
      const farm = expectTileFarmSelection(r, 'plow')
      const tile = farm.selectableTiles[0]
      assert.ok(tile)
      r = ok(s.commitSelectionChoice(0, { tile }))
      assert.equal(r.state.players[0]!.fields.length, expectedFieldCount)
    }
    assert.equal(r.state.players[0]!.fields.length, 2)
    assert.equal(res(r).grain, 1)
    const extra = offeredSow(r)
    // Extra Sow after A020 remains unadjudicated; only observe and close this optional pending.
    sessionEvidence.record('unresolved-A020-extra-Sow', { additionalSowObserved: extra, ruleUnresolved: true })
    if (extra) {
      const skip = opts(r).find(o => o.value === '__skip__' && !o.disabled)
      assert.ok(skip)
      r = ok(s.resolveChoice(0, skip.value))
    }
    complete(r)
  })
  it("undo qualifying construction and Sow restores the real farm before one retry", () => {
    const s = setup({ pastureCols: [4], resources: { wood: 4, vegetable: 1 } })
    const before = undoRuleSnapshot(s.getState())
    let r = sow(s, stable(s), [{ row: 0, col: 1, crop: 'vegetable' }])
    assert.equal(res(r).wood, 0)
    assert.equal(stack(r, 1), 2)
    r = undo(s, before, () => sow(s, stable(s), [{ row: 0, col: 1, crop: 'vegetable' }]))
    assert.equal(res(r).wood, 0)
    assert.equal(res(r).vegetable, 0)
    assert.equal(stack(r, 1), 2)
  })
  it("illegal stable targets reject before a legal qualifying construction", () => {
    const s = setup({ pastureCols: [4], resources: { wood: 4, vegetable: 1 } })
    farm(s, 'stable')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }, { row: 0, col: 2 }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 3, col: 0 }] }))
    let r = ok(s.commitSelectionChoice(0, { stables: [{ row: 1, col: 1 }, { row: 1, col: 2 }] }))
    assert.equal(offeredSow(r), true)
    r = sow(s, r, [{ row: 0, col: 1, crop: 'vegetable' }])
    assert.equal(r.state.players[0]!.stableTiles.length, 2)
    assert.equal(res(r).wood, 0)
  })
})
