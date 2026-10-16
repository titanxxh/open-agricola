import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A043_FarmyardManure'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectTileFarmSelection } from './_helpers/session-assertions'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A043_FarmyardManure'

describe('A043_FarmyardManure session', () => {
  const setup = () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // Give wood so we can afford stables (1 wood each).
    player.resources.wood = 5

    session.loadState(state)
    return session
  }

  it('queues 1 FOOD on next 3 round spaces after building a stable', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    // With wood only (no reed), farm-expansion auto-selects stables → farmSelect.
    expect(resp.interaction.stateId).toBe('wait')
    const farm = expectTileFarmSelection(resp, 'stable')

    const stable = farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    expect(resp.ok).toBe(true)

    // Expect 3 future-meeple entries owned by our player for the next 3 rounds.
    const playerId = resp.state.players[0]!.id
    const entries = resp.state.futureMeeples.filter(
      (e) => e.cardId === CARD_ID && e.playerId === playerId,
    )
    expect(entries).toHaveLength(3)
    const rounds = entries.map((e) => e.round).sort((a, b) => a - b)
    expect(rounds).toEqual([4, 5, 6])
    entries.forEach((entry) => {
      expect(entry.resources.food).toBe(1)
    })
  })

  it('fires only once per turn even if multiple stables are built', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    const farm = expectTileFarmSelection(resp, 'stable')

    const [t1, t2] = farm.selectableTiles
    resp = session.commitSelectionChoice(0, { stables: [t1!, t2!] })
    expect(resp.ok).toBe(true)

    const entries = resp.state.futureMeeples.filter((e) => e.cardId === CARD_ID)
    // still only 3 entries (not 6) because the card fires once per action
    expect(entries).toHaveLength(3)
  })

  it('does not trigger when card is not played', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.wood = 5

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    const farm = expectTileFarmSelection(resp, 'stable')

    const stable = farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    expect(resp.ok).toBe(true)
    const entries = resp.state.futureMeeples.filter((e) => e.cardId === CARD_ID)
    expect(entries).toHaveLength(0)
  })
})

describe("A043 command boundaries", () => {
  const MANURE = 'A043_FarmyardManure'
  function setup({ played = true, round = 5, resources = {}, configure = () => {
  } }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A054_Credit']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (played)
          p.minorPlayed = [MANURE]
        else
          p.minorHand.push(MANURE)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function pet(state: GameState, actor = 0) {
    const p = state.players[actor]!
    p.houseAnimals = { '2-0': 'sheep' }
    p.resources.sheep = 1
  }
  function confirmed(r: SessionResponse, actor = 0) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function newRound(r: SessionResponse) {
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'work')
    return r
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function choices(r: SessionResponse): import('../../shared/contract/types').ActionChoiceOption[] {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
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
    return ['forest', 'grain-seeds', 'clay-pit'].includes(space) ? confirmed(r, actor) : r
  }
  function enter(s: GameSession) {
    let r = turn(s, 0, 'meeting-place')
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function offered(r: SessionResponse, card: string) {
    return choices(r).some(o => o.value === card && !o.disabled)
  }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.equal(offered(r, card), true)
    const result = ok(s.resolveChoice(0, card))
    assert.equal(result.state.players[0]!.minorPlayed.includes(card), true)
    assert.equal(result.state.players[0]!.minorHand.includes(card), false)
    const events = result.state.events.filter(e => e.type === 'card.played' && e.cardId === card)
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.equal(event.actorPlayerId, result.state.players[0]!.id)
    assert.deepEqual(event.payment?.resources ?? {}, {})
    return confirmed(result)
  }
  function future(r: SessionResponse, card: string) {
    return r.state.futureMeeples.filter(m => m.cardId === card && m.playerId === r.state.players[0]!.id).flatMap(m => {
      assert.deepEqual(m.resources, { food: 1 })
      return [m.round]
    }).sort((a, b) => a - b)
  }
  function stableSelect(s: GameSession, actor = 0) {
    let r = turn(s, actor, 'farm-expansion')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const option = choices(r).find(o => o.value.includes('stables'))
      assert.ok(option)
      r = ok(s.resolveChoice(actor, option.value))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable', JSON.stringify(r.interaction))
    return r
  }
  function build(s: GameSession, count: number, actor = 0) {
    const r = stableSelect(s, actor)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable')
    const tiles = r.interaction.request.farm.selectableTiles.slice(0, count)
    assert.equal(tiles.length, count)
    const built = ok(s.commitSelectionChoice(actor, { stables: tiles }))
    assert.equal(built.state.players[actor]!.stableTiles.length, count)
    assert.equal(built.state.players[actor]!.resources.wood, 0)
    return confirmed(built, actor)
  }
  function room(s: GameSession, { stablesAvailable }: { stablesAvailable: boolean }) {
    let r = turn(s, 0, 'farm-expansion')
    if (stablesAvailable) {
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
      const options = choices(r)
      assert.deepEqual(options.map(option => option.labelKey).sort(), ['actions.construct.name', 'actions.stables.name'])
      assert.ok(options.every(option => !option.disabled))
      const option = options.find(option => option.labelKey === 'actions.construct.name')
      assert.ok(option)
      r = ok(s.resolveChoice(0, option.value))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'room', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    return r
  }
  function nextRound(s: GameSession) {
    turn(s, 1, 'forest')
    turn(s, 0, 'grain-seeds')
    const end = turn(s, 1, 'clay-pit')
    const r = confirmNext(s, end)
    assert.equal(r.state.round, 6)
    assert.equal(r.state.roundPhase, 'work')
    return newRound(r)
  }
  it("an owned accommodated animal permits the actual free purchase without a stable bonus", () => {
    const s = setup({ played: false, configure: pet })
    const r = buy(s, enter(s), MANURE)
    assert.deepEqual(future(r, MANURE), [])
    assert.equal(r.state.players[0]!.resources.sheep, 1)
  })
  it("no owned animal or only an opponent animal rejects purchase before a legal retry", () => {
    for (const other of [false, true]) {
      const s = setup({ played: false, configure(state) {
          if (other)
            pet(state, 1)
        } })
      const r = enter(s)
      assert.equal(offered(r, MANURE), false)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, MANURE))
      const done = buy(s, r, 'A054_Credit')
      assert.deepEqual(future(done, MANURE), [])
    }
  })
  it("one paid stable schedules one food on each of the next three rounds", () => {
    const s = setup({ resources: { wood: 2 } })
    const r = build(s, 1)
    assert.deepEqual(future(r, MANURE), [6, 7, 8])
    assert.equal(r.state.players[0]!.resources.food, 20)
  })
  it("two stables in one turn still schedule only three food", () => {
    const s = setup({ resources: { wood: 4 } })
    const r = build(s, 2)
    assert.deepEqual(future(r, MANURE), [6, 7, 8])
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 2)
  })
  it("four stables consume the finite four piece supply and still schedule only three food", () => {
    const s = setup({ resources: { wood: 8 } })
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(s.getState().state, s.getState().state.players[0]!)), 4)
    const r = build(s, 4)
    assert.deepEqual(future(r, MANURE), [6, 7, 8])
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 0)
  })
  it("one wood cannot pay for a stable or create a food schedule", () => {
    const s = setup({ resources: { wood: 1 } })
    assertRejectedUnchanged(s, () => s.takeAction(0, 'farm-expansion'))
    const r = turn(s, 0, 'grain-seeds')
    assert.equal(r.state.players[0]!.stableTiles.length, 0)
    assert.equal(r.state.players[0]!.resources.wood, 1)
    assert.deepEqual(future(r, MANURE), [])
  })
  it("exhausted stable supply offers rooms alone and permits a legal room retry", () => {
    const s = setup({ resources: { wood: 10, reed: 2 }, configure(state) {
        state.players[0]!.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }]
      } })
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(s.getState().state, s.getState().state.players[0]!)), 0)
    room(s, { stablesAvailable: false })
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: [], stables: [{ row: 1, col: 1 }] }))
    const r = confirmed(ok(s.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }], stables: [] })))
    assert.equal(r.state.players[0]!.stableTiles.length, 4)
    assert.equal(r.state.players[0]!.rooms, 3)
    assert.equal(r.state.players[0]!.resources.wood, 5)
    assert.deepEqual(future(r, MANURE), [])
  })
  it("a completed room construction with no stable schedules no food", () => {
    const s = setup({ resources: { wood: 5, reed: 2 } })
    room(s, { stablesAvailable: true })
    const r = confirmed(ok(s.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }], stables: [] })))
    assert.equal(r.state.players[0]!.rooms, 3)
    assert.equal(r.state.players[0]!.stableTiles.length, 0)
    assert.deepEqual(future(r, MANURE), [])
  })
  it("an opponent stable build cannot schedule owner food", () => {
    const s = setup({ configure(state) {
        state.players[1]!.resources.wood = 2
      } })
    turn(s, 0, 'grain-seeds')
    const r = build(s, 1, 1)
    assert.deepEqual(future(r, MANURE), [])
    assert.equal(r.state.players[0]!.stableTiles.length, 0)
  })
  it("a stable built while the card remains in hand creates no schedule", () => {
    const s = setup({ played: false, resources: { wood: 2 } })
    const r = build(s, 1)
    assert.deepEqual(future(r, MANURE), [])
    assert.equal(r.state.players[0]!.minorHand.includes(MANURE), true)
  })
  it("round thirteen and fourteen schedule only reachable future rounds", () => {
    for (const { round, expected } of [{ round: 13, expected: [14] }, { round: 14, expected: [] }]) {
      const s = setup({ round, resources: { wood: 2 } })
      const r = build(s, 1)
      assert.deepEqual(future(r, MANURE), expected)
    }
  })
  it("a natural next round delivers exactly one scheduled food once to the owner", () => {
    const s = setup({ resources: { wood: 2 } })
    build(s, 1)
    const r = nextRound(s)
    assert.equal(r.state.players[0]!.resources.food, 21)
    assert.equal(r.state.players[1]!.resources.food, 20)
    assert.deepEqual(future(r, MANURE), [7, 8])
    assertRejectedUnchanged(s, () => s.resolveChoice(0, '__forged_collect_again__'))
  })
  it("a controlled off turn free Stable Planner stable does not trigger food", () => {
    const s = setup({ configure(state) {
        state.players.forEach(p => markAllWorkersUsed(state, p))
        state.players[0]!.occupationPlayed = ['A089_StablePlanner']
        state.futureMeeples = [{ id: 'controlled-stable-planner-reservation', cardId: 'A089_StablePlanner', playerId: state.players[0]!.id, round: 6, actionId: null, resources: { stable: 1 } }]
      } })
    let r = ok(s.performRoundEnd())
    const option = choices(r).find(o => o.value !== '__skip__')
    assert.ok(option)
    assert.notEqual(option.disabled, true)
    r = ok(s.resolveChoice(0, option.value))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable')
    const tile = r.interaction.request.farm.selectableTiles[0]
    assert.ok(tile)
    r = newRound(ok(s.commitSelectionChoice(0, { stables: [tile] })))
    assert.equal(r.state.players[0]!.stableTiles.length, 1)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.deepEqual(future(r, MANURE), [])
  })
  it("undo after stable payment restores the public rule snapshot only where exposed", () => {
    const s = setup({ resources: { wood: 2 } })
    const beforeInteraction = JSON.stringify(s.getState().interaction)
    assert.equal(s.getState().interaction.stateId, 'idle')
    const before = undoRuleSnapshot(s.getState())
    const r = build(s, 1)
    assert.deepEqual(future(r, MANURE), [6, 7, 8])
    const beforeRestored = s.undoAction()
    assertUndoRestored(before, beforeRestored)
    assert.equal(JSON.stringify(beforeRestored.interaction), beforeInteraction)
    assert.equal(beforeRestored.state.currentPlayerIndex, 0)
    const retry = build(s, 1)
    assert.deepEqual(future(retry, MANURE), [6, 7, 8])
  })
  it("an empty Farm Expansion with no stables available cannot consume a worker turn", () => {
    const s = setup({ resources: { wood: 10, reed: 2 }, configure(state) {
        state.players[0]!.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }]
      } })
    room(s, { stablesAvailable: false })
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { rooms: [], stables: [] }))
    const r = confirmed(ok(s.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }], stables: [] })))
    assert.equal(r.state.players[0]!.rooms, 3)
    assert.equal(r.state.players[0]!.stableTiles.length, 4)
    assert.deepEqual(future(r, MANURE), [])
  })
})
