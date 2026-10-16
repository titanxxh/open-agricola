import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A088_HedgeKeeper'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A088_HedgeKeeper'
const FILLER = '__test_placeholder__'
const ONE_CELL = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
const TWO_CELL = [
  'H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3',
]
const setup = ({ wood = 0, played = true, existingFence = false } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5088, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    player.resources.wood = 0
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.wood = wood
  if (existingFence) {
    owner.fenceSegments = [{
      edge: ONE_CELL[0]!, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id },
    }]
  }
  session.loadState(state)
  return session
}
const playOccupation = (session: GameSession, cardId: string) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}
const buildFences = (session: GameSession, edges: string[]) => {
  const pending = session.takeAction(0, 'fencing')
  expect(pending.ok, pending.error).toBe(true)
  expect(pending.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
  })
  return session.commitSelectionChoice(0, { edges, palisadeEdges: [], extraWood: 0 })
}
describe('A088 Hedge Keeper session', () => {
  it('A088 S1: Hedge Keeper is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A088 S2: completes an existing edge with three free fences and no wood', () => {
    const session = setup({ existingFence: true })
    expect(session.getActionAvailability(0).fencing).toBe(true)
    const response = buildFences(session, ONE_CELL)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(session.withCtx(() => getOwnOrdinaryFenceReserveCount(response.state.players[0]!))).toBe(11)
  })

  it('A088 S3: building four fences with Hedge Keeper costs one wood', () => {
    const session = setup({ wood: 1 })
    const response = buildFences(session, ONE_CELL)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('A088 S4: building six fences with Hedge Keeper costs three wood', () => {
    const session = setup({ wood: 3 })
    const response = buildFences(session, TWO_CELL)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(6)
  })

  it('A088 S5: the three-fence discount does not make six fences affordable with only two wood', () => {
    const session = setup({ wood: 2 })
    const response = buildFences(session, TWO_CELL)

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
  })

})
describe("A088 command boundaries", () => {
  const HEDGE = 'A088_HedgeKeeper'
  function artifact(name: string, data: object) {
    sessionEvidence.record(name, data)
  }
  type Setup = {
    played?: boolean
    round?: number
    house?: PlayerState['houseType']
    rooms?: number
    resources?: Partial<PlayerState['resources']>
    occupations?: number
    opponent?: boolean
    configure?: (state: GameState) => void
  }
  function setup({ played = true, round = 6, house = 'wood', rooms = 2, resources = {}, occupations = 0, opponent = false, configure = () => {
  } }: Setup = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        p.houseType = house
        p.rooms = rooms
        p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, ...Array.from({ length: rooms - 2 }, (_, n) => ({ row: 2, col: n + 1 }))]
        p.occupationPlayed = ['A116_WoodCutter'].slice(0, occupations)
        if (played && !opponent)
          p.occupationPlayed.push("A088_HedgeKeeper")
        else
          p.occupationHand.push("A088_HedgeKeeper")
        if (opponent)
          state.players[1]!.occupationPlayed = ["A088_HedgeKeeper"]
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    assert.equal(s.getState().interaction.stateId, 'idle')
    assert.equal(s.getState().state.players.length, 2)
    for (const p of s.getState().state.players) {
      assert.equal(p.workers.length, 5)
      assert.equal(p.workers.filter(w => w.isActive).length, 2)
      assert.equal(p.stableTiles.length, 0)
      assert.ok(s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)) >= 0)
      if (p.fenceSegments.length)
        s.withCtx(() => assert.equal(getOwnOrdinaryFenceReserveCount(p), 15 - p.fenceSegments.length))
    }
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
    artifact('place', { space, actor, response: r })
    return r
  }
  function complete(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    return r
  }
  function lessons(s: GameSession, card: string) {
    let r = turn(s, 0, 'lessons')
    if (r.state.players[0]!.occupationHand.includes(card)) {
      assert.ok(opts(r).some(o => o.value === card && !o.disabled))
      r = ok(s.resolveChoice(0, card))
    }
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'prompt.selectPayment')
      r = ok(s.resolveChoice(0, opts(r).find(o => o.value !== 'cancel')!.value))
    assert.ok(r.state.players[0]!.occupationPlayed.includes(card))
    return complete(r)
  }
  function denyHost(s: GameSession, space: string) {
    assertRejectedUnchanged(s, () => s.takeAction(0, space))
    complete(turn(s, 0, 'day-laborer'))
    return { hostRejected: true, legalRetryCompleted: true }
  }
  const FOUR = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'], SIX = ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3']
  function boundary(tiles: {
    row: number
    col: number
  }[]) {
    const edges = new Map<string, number>()
    for (const { row, col } of tiles)
      for (const edge of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`])
        edges.set(edge, (edges.get(edge) ?? 0) + 1)
    return [...edges].filter(([, n]) => n === 1).map(([e]) => e)
  }
  function closed(state: GameState, tiles: {
    row: number
    col: number
  }[], individual = false) {
    const p = state.players[0]!
    const edges = individual ? [...new Set(tiles.flatMap(t => boundary([t])))] : boundary(tiles)
    p.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
    p.pastures = individual ? tiles.map((t, i) => ({ id: `closed-${i}`, tiles: [t], animalType: null, animalCount: 0 })) : [{ id: 'closed', tiles, animalType: null, animalCount: 0 }]
  }
  function fenceEntry(s: GameSession) {
    const r = turn(s, 0, 'fencing')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'fence', JSON.stringify(r.interaction))
    return r
  }
  function fenceCommit(s: GameSession, edges: string[]) {
    return complete(ok(s.commitSelectionChoice(0, { edges, palisadeEdges: [], extraWood: 0 })))
  }
  function fence(s: GameSession, edges = FOUR) {
    fenceEntry(s)
    return fenceCommit(s, edges)
  }
  function fields(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.fields.length
  }
  it("real first and later Lessons pay zero and one food without an immediate ability", () => {
    for (const prior of [0, 1]) {
      const s = setup({ played: false, occupations: prior, resources: { food: prior }, house: 'stone' })
      const r = lessons(s, HEDGE)
      assert.equal(res(r).food, 0)
      assert.equal(fields(r), 0)
      assert.equal(r.state.players[0]!.fenceSegments.length, 0)
    }
    return { firstFee: 0, laterFee: 1, immediateFields: 0, immediateFences: 0 }
  })
  it("missing the later Lessons food rejects a real forged entry before a legal action", () => {
    return denyHost(setup({ played: false, occupations: 1 }), 'lessons')
  })
  it("legal closed pasture geometry permits 1 new free fences at zero wood", () => {
    const s = setup({ configure(state) {
        closed(state, [{ "row": 1, "col": 2 }, { "row": 1, "col": 3 }])
      } })
    const r = fence(s, ["V-1-3"])
    assert.equal(res(r).wood, 0)
    assert.equal(r.state.players[0]!.fenceSegments.length, 7)
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)), 8)
    return { newFences: 1, woodPaid: 0, totalFences: 7, reserve: 8 }
  })
  it("legal closed pasture geometry permits 2 new free fences at zero wood", () => {
    const s = setup({ configure(state) {
        closed(state, [{ "row": 1, "col": 2 }, { "row": 1, "col": 3 }, { "row": 2, "col": 2 }])
      } })
    const r = fence(s, ["H-3-3", "V-2-4"])
    assert.equal(res(r).wood, 0)
    assert.equal(r.state.players[0]!.fenceSegments.length, 10)
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)), 5)
    return { newFences: 2, woodPaid: 0, totalFences: 10, reserve: 5 }
  })
  it("legal closed pasture geometry permits 3 new free fences at zero wood", () => {
    const s = setup({ configure(state) {
        closed(state, [{ "row": 1, "col": 3 }])
      } })
    const r = fence(s, ["H-1-4", "H-2-4", "V-1-5"])
    assert.equal(res(r).wood, 0)
    assert.equal(r.state.players[0]!.fenceSegments.length, 7)
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)), 8)
    return { newFences: 3, woodPaid: 0, totalFences: 7, reserve: 8 }
  })
  it("4 actual new fences still pay 1 wood after the discount", () => {
    const s = setup({ resources: { wood: 1 } }), r = fence(s, FOUR)
    assert.equal(res(r).wood, 0)
    assert.equal(r.state.players[0]!.fenceSegments.length, 4)
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)), 11)
    return { newFences: 4, woodPaid: 1, reserve: 11 }
  })
  it("6 actual new fences still pay 3 wood after the discount", () => {
    const s = setup({ resources: { wood: 3 } }), r = fence(s, SIX)
    assert.equal(res(r).wood, 0)
    assert.equal(r.state.players[0]!.fenceSegments.length, 6)
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)), 9)
    return { newFences: 6, woodPaid: 3, reserve: 9 }
  })
  it("six fences with two wood reject before four legal fences pay one wood", () => {
    const s = setup({ resources: { wood: 2 } })
    fenceEntry(s)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { edges: SIX, extraWood: 0 }))
    const r = fenceCommit(s, FOUR)
    assert.equal(res(r).wood, 1)
    return { underpaidRejected: true, retryFences: 4, retryWood: 1 }
  })
  it("fifteen real placed fence pieces cannot be exceeded by the discount", () => {
    const s = setup({ resources: { wood: 10 }, configure(state) {
        closed(state, [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 2 }, { row: 1, col: 3 }, { row: 1, col: 4 }], true)
      } })
    assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(s.getState().state.players[0]!)), 0)
    const result = denyHost(s, 'fencing')
    return { ...result, fences: 15, reserve: 0 }
  })
  it("open room field and outside farm fence targets reject before a closed legal pasture", () => {
    const s = setup({ resources: { wood: 5 }, configure(state) {
        state.players[0]!.fields = [{ row: 0, col: 3, stacks: [] }]
      } })
    fenceEntry(s)
    for (const edges of [['H-0-1'], ['H-1-0', 'H-2-0', 'V-1-0', 'V-1-1'], ['H-0-3', 'H-1-3', 'V-0-3', 'V-0-4'], ['H-3-5']])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { edges, extraWood: 0 }))
    const r = fenceCommit(s, FOUR)
    assert.equal(res(r).wood, 4)
    return { rejected: [true, true, true, true], retryFences: 4, retryWood: 4 }
  })
  it("Hedge Keeper in hand cannot discount owner fences", () => {
    const r = fence(setup({ played: false, resources: { wood: 4 } }))
    assert.equal(res(r).wood, 0)
    return { newFences: 4, woodPaid: 4, discount: 0 }
  })
  it("only the opponent Hedge Keeper cannot discount owner fences", () => {
    const r = fence(setup({ opponent: true, resources: { wood: 4 } }))
    assert.equal(res(r).wood, 0)
    return { newFences: 4, woodPaid: 4, discount: 0 }
  })
  it("a later natural round grants three free fences again without accumulating a quota", () => {
    const s = setup({ round: 5, resources: { wood: 1 } })
    fence(s)
    turn(s, 1, 'forest')
    turn(s, 0, 'day-laborer')
    let r = confirmNext(s, turn(s, 1, 'grain-seeds'))
    assert.equal(r.state.round, 6)
    ready(s, 0)
    r = fence(s, ['H-0-2', 'H-1-2', 'V-0-3'])
    assert.equal(res(r).wood, 0)
    assert.equal(r.state.players[0]!.fenceSegments.length, 7)
    return { round: 6, totalFences: 7, totalWoodPaid: 1, secondFreeFences: 3 }
  })
  it("actual discounted fence undo probes full restoration before one retry", () => {
    const s = setup({ resources: { wood: 1 } })
    const before = undoRuleSnapshot(s.getState())
    fence(s)
    assertUndoRestored(before, s.undoAction())
    const r = fence(s)
    assert.equal(res(r).wood, 0)
    assert.equal(r.state.players[0]!.fenceSegments.length, 4)
    return { restored: true, retryFences: 4, retryWood: 0 }
  })
  it("the opponent actual four fence action pays full wood despite the owner Hedge Keeper", () => {
    const s = setup({ configure(state) {
        state.players[1]!.resources.wood = 4
      } })
    complete(turn(s, 0, 'day-laborer'))
    turn(s, 1, 'fencing')
    const r = complete(ok(s.commitSelectionChoice(1, { edges: FOUR, palisadeEdges: [], extraWood: 0 })))
    assert.equal(res(r, 1).wood, 0)
    assert.equal(r.state.players[1]!.fenceSegments.length, 4)
    assert.equal(r.state.players[0]!.fenceSegments.length, 0)
    return { opponentWoodPaid: 4, opponentFences: 4, ownerFences: 0 }
  })
})
