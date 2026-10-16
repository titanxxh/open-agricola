import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getFenceCount, getPalisadeCount } from '../../shared/actions/effects/fencing'
import { getOwnOrdinaryFenceCount } from '../../shared/domain/fence-segments'
import { type FenceSegment, type GameState, type PlayerState } from '../../shared/contract/types'
import '../../shared/cards/B/B030_WoodPalisades'
import '../../shared/cards/B/B094_StockProtector'
import '../../shared/cards/C/C001_Overhaul'
import '../../shared/cards/E/E108_BlackberryFarmer'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot, getChoiceOptions, expectFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'C001_Overhaul'
const B030_ID = 'B030_WoodPalisades'
const B094_ID = 'B094_StockProtector'
const E108_ID = 'E108_BlackberryFarmer'

const TILE_00 = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1']
const TOP_ROW_15 = [
  'H-0-1',
  'H-0-2',
  'H-0-3',
  'H-0-4',
  'H-1-0',
  'H-1-1',
  'H-1-2',
  'H-1-3',
  'H-1-4',
  'V-0-1',
  'V-0-2',
  'V-0-3',
  'V-0-4',
  'V-0-5',
  'H-2-2',
]
const TOP_ROW_16 = [...TOP_ROW_15, 'H-2-3']

type SetupOptions = {
  wood?: number
  ownFenceEdges?: string[]
  ownFenceCount?: number
  consumedFences?: number
  palisadeEdges?: string[]
  borrowedFenceEdges?: string[]
  withB30?: boolean
  animals?: boolean
  playedOccupations?: string[]
}

const clone = <T>(value: T): T => structuredClone(value)

const ownFence = (player: PlayerState, edge: string): FenceSegment => ({
  edge,
  type: 'fence',
  source: { kind: 'own', ownerPlayerId: player.id },
})

const ownPalisade = (player: PlayerState, edge: string): FenceSegment => ({
  edge,
  type: 'palisade',
  source: { kind: 'own', ownerPlayerId: player.id },
})

const borrowedFence = (owner: PlayerState, edge: string): FenceSegment => ({
  edge,
  type: 'fence',
  source: { kind: 'borrowed', ownerPlayerId: owner.id },
})

const setup = (opts: SetupOptions = {}) => {
  const session = evidence.track(createWorkSession({ seed: 42 }))
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  const next = state.players[1]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: opts.wood ?? 1,
    food: 5,
  }
  player.minorHand = [CARD_ID]
  next.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  next.occupationHand = ['__test_placeholder__']
  player.occupationPlayed = ['__test_occ_a__', '__test_occ_b__', ...(opts.playedOccupations ?? [])]
  next.occupationPlayed = []
  player.minorPlayed = opts.withB30 ? [B030_ID] : []

  const generatedOwnEdges = Array.from(
    { length: opts.ownFenceCount ?? 0 },
    (_, i) => `__c1_own_${i}`,
  )
  player.fenceSegments = [
    ...(opts.ownFenceEdges ?? []).map((edge) => ownFence(player, edge)),
    ...generatedOwnEdges.map((edge) => ownFence(player, edge)),
    ...(opts.palisadeEdges ?? []).map((edge) => ownPalisade(player, edge)),
    ...(opts.borrowedFenceEdges ?? []).map((edge) => borrowedFence(next, edge)),
  ]
  player.supplyTokensConsumed = opts.consumedFences ? { fence: opts.consumedFences } : {}

  if (opts.animals) {
    player.resources.sheep = 2
    player.pastures = [
      {
        id: 'pasture-1',
        tiles: [{ row: 0, col: 0 }],
        animalType: 'sheep',
        animalCount: 2,
      },
    ]
  }

  session.loadState(state)
  return session
}

const buyC1 = (session: GameSession) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = getChoiceOptions(resp)?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }
  if (resp.interaction.stateId === 'wait' && resp.interaction.sourceCard === CARD_ID) return resp
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = getChoiceOptions(resp)?.find((option) => option.value === CARD_ID)
  if (!cardOption) return resp
  resp = session.resolveChoice(0, cardOption!.value)
  expect(resp.ok).toBe(true)
  return resp
}

const cloneInteraction = (resp: SessionResponse) => clone(resp.interaction)

const expectFarmSelect = (
  resp: SessionResponse,
  expected?: SessionResponse['interaction'],
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return
  expect(resp.interaction.playerIndex).toBe(0)
  expect(resp.interaction.sourceCard).toBe(CARD_ID)
  expect(resp.interaction.promptKey).toBe('ui.interactionFenceSelect')
  expect(resp.interaction.request.kind).toBe('farm-select')
  expect(getChoiceOptions(resp)).toEqual([
    { value: 'confirm', labelKey: 'ui.interactionFenceConfirm' },
  ])
  expect(expectFarmSelection(resp)?.farmType).toBe('fence')
  if (expected) {
    expect(resp.interaction).toEqual(expected)
  }
}

const snapshotAfterRaze = (state: GameState) => {
  const player = state.players[0]!
  return {
    fenceSegments: clone(player.fenceSegments),
    resources: clone(player.resources),
    cardStates: clone(player.cardStates),
    pastures: clone(player.pastures),
    events: clone(state.events),
    log: clone(state.log),
  }
}

const expectSnapshotUnchanged = (
  state: GameState,
  before: ReturnType<typeof snapshotAfterRaze>,
) => {
  const player = state.players[0]!
  expect(player.fenceSegments).toEqual(before.fenceSegments)
  expect(player.resources).toEqual(before.resources)
  expect(player.cardStates).toEqual(before.cardStates)
  expect(player.pastures).toEqual(before.pastures)
  expect(state.events).toEqual(before.events)
  expect(state.log).toEqual(before.log)
}

describe('C1 Overhaul session', () => {
  it('passes C1 away but rebuilds for the buyer for free after C1 cost is paid', () => {
    const session = setup({ wood: 1, ownFenceEdges: TILE_00 })
    const resp = buyC1(session)
    expectFarmSelect(resp)

    const afterBuy = resp.state.players[0]!
    expect(afterBuy.resources.wood).toBe(0)
    expect(afterBuy.minorPlayed).not.toContain(CARD_ID)
    expect(resp.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(getOwnOrdinaryFenceCount(afterBuy)).toBe(0)

    const rebuild = session.commitSelectionChoice(0, {
      edges: TILE_00,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(rebuild.ok).toBe(true)
    const buyer = rebuild.state.players[0]!
    expect(buyer.resources.wood).toBe(0)
    expect(getOwnOrdinaryFenceCount(buyer)).toBe(4)
    expect(buyer.pastures).toHaveLength(1)
    expect(buyer.minorPlayed).not.toContain(CARD_ID)
  })

  it('counts C1 rebuild as building fences for E108 Blackberry Farmer', () => {
    const session = setup({
      wood: 1,
      ownFenceEdges: TILE_00,
      playedOccupations: [E108_ID],
    })
    const pending = buyC1(session)
    expectFarmSelect(pending)

    const resp = session.commitSelectionChoice(0, {
      edges: TILE_00,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    const playerId = resp.state.players[0]!.id
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.fenceBuilt',
        actorPlayerId: playerId,
        newFenceEdges: TILE_00,
      }),
      expect.objectContaining({
        type: 'futureMeeple.queued',
        sourceCardId: E108_ID,
      }),
    ]))
    const futureForCard = resp.state.futureMeeples.filter(
      (entry) => entry.cardId === E108_ID && entry.playerId === playerId,
    )
    expect(futureForCard).toHaveLength(TILE_00.length)
    expect(futureForCard.map((entry) => entry.round).sort((a, b) => a - b)).toEqual([2, 3, 4, 5])
    futureForCard.forEach((entry) => {
      expect(entry.resources.food).toBe(1)
    })
  })

  it('does not treat C1 rebuild as using the Fencing action space for B94 Stock Protector', () => {
    const session = setup({
      wood: 1,
      ownFenceEdges: TILE_00,
      playedOccupations: [B094_ID],
    })
    const pending = buyC1(session)
    expectFarmSelect(pending)

    const resp = session.commitSelectionChoice(0, {
      edges: TILE_00,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)

    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionStockProtectorPlace')
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.gained',
        sourceCardId: B094_ID,
      }),
    ]))
  })

  it('does not start rebuild at n=0 and leaves palisades on board', () => {
    const session = setup({ wood: 1, palisadeEdges: ['H-0-0', 'V-0-0'] })
    const resp = buyC1(session)

    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).not.toBe('farm-select')
    }
    const player = resp.state.players[0]!
    expect(player.resources.wood).toBe(0)
    expect(player.minorPlayed).not.toContain(CARD_ID)
    expect(resp.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(getOwnOrdinaryFenceCount(player)).toBe(0)
    expect(getPalisadeCount(player)).toBe(2)
  })

  it('returns only own ordinary fences, not palisades or borrowed fences', () => {
    const session = setup({
      wood: 1,
      ownFenceCount: 2,
      palisadeEdges: ['H-0-0'],
      borrowedFenceEdges: ['V-0-0'],
    })
    const resp = buyC1(session)
    expectFarmSelect(resp)

    const player = resp.state.players[0]!
    expect(getOwnOrdinaryFenceCount(player)).toBe(0)
    expect(getFenceCount(player)).toBe(1)
    expect(getPalisadeCount(player)).toBe(1)
    expect(player.fenceSegments).toEqual([
      ownPalisade(player, 'H-0-0'),
      borrowedFence(resp.state.players[1]!, 'V-0-0'),
    ])
  })

  it('rejects cancel after raze and keeps pending state unchanged', () => {
    const session = setup({ wood: 1, ownFenceEdges: TILE_00, animals: true })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const cancel = session.commitSelectionChoice(0, { cancel: true })
    expect(cancel.ok).toBe(false)
    expect(cancel.error).toBe('action cancel is not allowed')
    expectFarmSelect(cancel, beforeInteraction)
    expectSnapshotUnchanged(cancel.state, before)
  })

  it('rejects rebuilding fewer than n fences and keeps pending state unchanged', () => {
    const session = setup({ wood: 1, ownFenceEdges: TILE_00, animals: true })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('TOO_FEW_FENCES')
    expectFarmSelect(resp, beforeInteraction)
    expectSnapshotUnchanged(resp.state, before)
  })

  it('rejects rebuilding more than effectiveMax and keeps pending state unchanged', () => {
    const session = setup({ wood: 1, ownFenceEdges: TILE_00, animals: true })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-0-1', 'H-0-2', 'H-0-3', 'H-1-0', 'H-1-1', 'H-1-2', 'H-1-3'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('TOO_MANY_FENCES')
    expectFarmSelect(resp, beforeInteraction)
    expectSnapshotUnchanged(resp.state, before)
  })

  it('caps n greater than 12 at own ordinary supply after return and ignores borrowed or palisade supply', () => {
    const session = setup({
      wood: 1,
      ownFenceCount: 13,
      palisadeEdges: ['H-0-0'],
      borrowedFenceEdges: ['V-0-0'],
    })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const tooMany = assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, {
      edges: TOP_ROW_16,
      palisadeEdges: [],
      extraWood: 0,
    }))
    expect(tooMany.ok).toBe(false)
    expect(tooMany.error).toBe('TOO_MANY_FENCES')
    expectFarmSelect(tooMany, beforeInteraction)
    expectSnapshotUnchanged(tooMany.state, before)

    const maxOk = session.commitSelectionChoice(0, {
      edges: TOP_ROW_15,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(maxOk.ok).toBe(true)
    const player = maxOk.state.players[0]!
    expect(getOwnOrdinaryFenceCount(player)).toBe(15)
    expect(getFenceCount(player)).toBe(16)
    expect(getPalisadeCount(player)).toBe(1)
    expect(player.resources.wood).toBe(0)

    expect(maxOk.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player' } })
  })

  it('caps rebuild at dynamic own ordinary build limit after consumed fence supply', () => {
    const session = setup({
      wood: 1,
      ownFenceCount: 13,
      consumedFences: 1,
    })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const tooMany = session.commitSelectionChoice(0, {
      edges: TOP_ROW_15,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(tooMany.ok).toBe(false)
    expect(tooMany.error).toBe('TOO_MANY_FENCES')
    expectFarmSelect(tooMany, beforeInteraction)
    expectSnapshotUnchanged(tooMany.state, before)

    const maxOk = session.commitSelectionChoice(0, {
      edges: TOP_ROW_15.slice(0, 14),
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(maxOk.ok).toBe(true)
    expect(getOwnOrdinaryFenceCount(maxOk.state.players[0]!)).toBe(14)
  })

  it('rejects B30 palisade input during C1 rebuild and keeps pending state unchanged', () => {
    const session = setup({
      wood: 1,
      ownFenceEdges: TILE_00,
      withB30: true,
      animals: true,
    })
    const pending = buyC1(session)
    expectFarmSelect(pending)
    const beforeInteraction = cloneInteraction(pending)
    const before = snapshotAfterRaze(session.getState().state)

    const resp = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('SEGMENT_TYPE_NOT_ALLOWED')
    expectFarmSelect(resp, beforeInteraction)
    expectSnapshotUnchanged(resp.state, before)
  })

  it('does not lose animals on successful rebuild', () => {
    const session = setup({ wood: 1, ownFenceEdges: TILE_00, animals: true })
    buyC1(session)

    const resp = session.commitSelectionChoice(0, {
      edges: TILE_00,
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.resources.sheep).toBe(2)
    expect(player.pastures).toEqual([
      {
        id: 'pasture-1',
        tiles: [{ row: 0, col: 0 }],
        animalType: 'sheep',
        animalCount: 2,
      },
    ])
  })
})

describe('C001 rule boundaries', () => {

  const OVERHAUL = 'C001_Overhaul'

  const one = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

  const two = [...one, 'H-0-2', 'H-1-2', 'V-0-3']

  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }

  function wait(r: SessionResponse) { ok(r); assert(r.interaction.stateId === 'wait'); return r.interaction }

  function options(r: SessionResponse) { const request = wait(r).request; assert(request.kind === 'choice'); return request.options }

  function play(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (!r.state.players[0]!.minorHand.includes(OVERHAUL))
      return r
    const improvement = options(r).find(o => o.value.startsWith('action-improvement-'))
    if (improvement)
      r = ok(s.resolveChoice(0, improvement.value))
    if (r.state.players[0]!.minorHand.includes(OVERHAUL))
      r = ok(s.resolveChoice(0, OVERHAUL))
    return r
  }

  function fenceSetup(edges = one, animals = false) {
    return evidence.track(createWorkSession({
      seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = 4
        for (const player of state.players)
          Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 })
        const owner = state.players[0]!
        owner.minorHand = [OVERHAUL]
        owner.occupationPlayed = ['A116_WoodCutter', 'A103_Portmonger']
        owner.resources.wood = 1
        owner.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id } }))
        owner.pastures = [{ id: 'one', tiles: [{ row: 0, col: 1 }], animalType: animals ? 'sheep' : null, animalCount: animals ? 2 : 0 }]
        if (edges.length === 7)
          owner.pastures.push({ id: 'two', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0 })
        if (edges.length === 13)
          for (const col of [2, 3, 4])
            owner.pastures.push({ id: `pasture-${col}`, tiles: [{ row: 0, col }], animalType: null, animalCount: 0 })
        owner.resources.sheep = animals ? 2 : 0
      }
    }))
  }

  it("raze cannot be canceled or add four fences and legal reconstruction keeps animals", () => {
    const s = fenceSetup(one, true)
    const before = undoRuleSnapshot(s.getState())
    let r = play(s)
    assert.equal(wait(r).request.kind, 'farm-select')
    assert.equal(r.state.players[0]!.fenceSegments.length, 0)
    assert.equal(r.state.players[0]!.resources.sheep, 2)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { cancel: true }))
    const eight = ['H-0-1', 'H-0-2', 'H-0-3', 'H-1-1', 'H-1-2', 'H-1-3', 'V-0-1', 'V-0-4']
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { edges: eight, palisadeEdges: [], extraWood: 0 }))
    r = ok(s.commitSelectionChoice(0, { edges: one, palisadeEdges: [], extraWood: 0 }))
    assert.equal(r.state.players[0]!.fenceSegments.length, 4)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.sheep, 2)
    assert(r.state.players[1]!.minorHand.includes(OVERHAUL))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    const undone = s.undoAction()
    assertUndoRestored(before, undone)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)

    play(s)
    const retry = ok(s.commitSelectionChoice(0, { edges: one, palisadeEdges: [], extraWood: 0 }))
    assert.equal(retry.state.players[0]!.fenceSegments.length, 4)
    assert.equal(retry.state.players[0]!.resources.wood, 0)
    assert.equal(retry.state.players[0]!.resources.sheep, 2)
    assert(retry.state.players[1]!.minorHand.includes(OVERHAUL))
    assert.ok(retry.interaction.stateId === 'wait' && retry.interaction.request.kind === 'confirm-next-player', JSON.stringify(retry.interaction))
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
  })

  it("valid four-edge enclosure cannot replace seven returned fences", () => {
    const s = fenceSetup(two)
    play(s)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { edges: one, palisadeEdges: [], extraWood: 0 }))
    const r = ok(s.commitSelectionChoice(0, { edges: two, palisadeEdges: [], extraWood: 0 }))
    assert.equal(r.state.players[0]!.fenceSegments.length, 7)
    assert.equal(r.state.players[0]!.resources.wood, 0)

    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
  })
})
