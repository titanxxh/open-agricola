import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getStoredResource, setStoredResource } from '../../shared/cards/helpers/card-storage'
import '../../shared/cards/A/A144_Sequestrator'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions , expectTileFarmSelection , undoRuleSnapshot , assertUndoRestored } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A144_Sequestrator'

const FILLER = '__test_placeholder__'

const THREE_PASTURES = [
  'H-0-2', 'H-1-2', 'V-0-2', 'V-0-3',
  'H-2-2', 'V-1-2', 'V-1-3',
  'H-3-2', 'V-2-2', 'V-2-3',
]

const TWO_PASTURES = THREE_PASTURES.slice(0, 7)

const setup = ({ played = true, actor = 0 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7144, options: { playerCount: 3 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = []
    player.fenceSegments = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (played) {
    setStoredResource(owner, CARD_ID, 'reed', 3)
    setStoredResource(owner, CARD_ID, 'clay', 4)
  }
  session.loadState(state)
  return session
}

const chooseCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  if (!response.state.players[0]!.occupationHand.includes(cardId)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('A144 Sequestrator parity', () => {
  it('A144 S1: playing Sequestrator stores three reed and four clay', () => {
    const session = setup({ played: false })
    const response = chooseCard(session, session.takeAction(0, 'lessons'), CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'reed')).toBe(3)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'clay')).toBe(4)
  })

  it('A144 S2: the next player to reach five fields by plowing receives all four clay', () => {
    const session = setup({ actor: 1 })
    const state = session.getState().state
    const actor = state.players[1]!
    actor.fields = Array.from({ length: 4 }, (_, col) => ({ row: 0, col, stacks: [] }))
    session.loadState(state)
    let response = session.takeAction(1, 'farmland')
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    assert.ok(!(response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select'), JSON.stringify(response.interaction))
    response = session.commitSelectionChoice(1, { tile: expectTileFarmSelection(response, 'plow').selectableTiles[0]! })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.fields).toHaveLength(5)
    expect(response.state.players[1]!.resources.clay).toBe(4)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'clay')).toBe(0)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'reed')).toBe(3)
  })

  it('A144 S3: the next player to reach three pastures by fencing receives all three reed', () => {
    const session = setup({ actor: 1 })
    const state = session.getState().state
    const actor = state.players[1]!
    actor.resources.wood = 3
    actor.fenceSegments = TWO_PASTURES.map((edge) => ({
      edge, type: 'fence' as const, source: { kind: 'own' as const, ownerPlayerId: actor.id },
    }))
    session.loadState(state)
    const pending = session.takeAction(1, 'fencing')
    expect(pending.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
    })
    const response = session.commitSelectionChoice(1, {
      edges: THREE_PASTURES, palisadeEdges: [], extraWood: 0,
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.pastures).toHaveLength(3)
    expect(response.state.players[1]!.resources.reed).toBe(3)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'reed')).toBe(0)
  })

  it('A144 S4: existing five fields do not receive stored clay retroactively', () => {
    const session = setup({ played: false })
    const state = session.getState().state
    state.players[0]!.fields = Array.from({ length: 5 }, (_, col) => ({ row: 0, col, stacks: [] }))
    session.loadState(state)
    const response = chooseCard(session, session.takeAction(0, 'lessons'), CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'clay')).toBe(4)
  })

  it('A144 S5: an emptied clay store cannot award clay again', () => {
    const session = setup()
    const state = session.getState().state
    const owner = state.players[0]!
    owner.fields = Array.from({ length: 5 }, (_, col) => ({ row: 0, col, stacks: [] }))
    setStoredResource(owner, CARD_ID, 'clay', 0)
    session.loadState(state)
    let response = session.takeAction(0, 'farmland')
    assert.ok(!(response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select'), JSON.stringify(response.interaction))
    response = session.commitSelectionChoice(0, { tile: expectTileFarmSelection(response, 'plow').selectableTiles[0]! })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })
})

describe("A144 command boundaries", () => {
  const CARD = 'A144_Sequestrator'
  const TWO = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3', 'H-2-2', 'V-1-2', 'V-1-3']
  const THREE = [...TWO, 'H-3-2', 'V-2-2', 'V-2-3']
  function save(id: string, value: unknown) {
    sessionEvidence.record(id, value)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function fields(state: GameState, actor: number, count: number) {
    state.players[actor]!.fields = Array.from({ length: count }, (_, n) => ({ row: n < 5 ? 0 : 1, col: n % 5, stacks: [] }))
  }
  function fences(state: GameState, actor: number, edges: string[]) {
    const p = state.players[actor]!
    p.fenceSegments = edges.map(edge => ({ edge, type: 'fence' as const, source: { kind: 'own' as const, ownerPlayerId: p.id } }))
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 3 }, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 15, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.occupationPlayed = played ? [CARD] : []
        p.occupationHand = played ? ['__test_placeholder__'] : [CARD, 'A110_Roughcaster']
        if (played) {
          setStoredResource(p, CARD, 'reed', 3)
          setStoredResource(p, CARD, 'clay', 4)
        }
        configure(state)
      } }))
    return s
  }
  const beforeAction = new WeakMap<GameSession, { rules: string; interaction: string; actor: number }>()
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    beforeAction.set(s, { rules: undoRuleSnapshot(r), interaction: JSON.stringify(r.interaction), actor })
    return ok(s.takeAction(actor, space))
  }
  function undo(s: GameSession) {
    const before = beforeAction.get(s)
    assert.ok(before)
    const undone = s.undoAction()
    assertUndoRestored(before.rules, undone)
    assertUndoRestored(before.rules, s.getState())
    assert.equal(JSON.stringify(undone.interaction), before.interaction)
    assert.equal(JSON.stringify(s.getState().interaction), before.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, before.actor)
    return undone
  }
  function close(s: GameSession, r: SessionResponse, actor = 0) {
    for (let n = 0; n < 10 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'confirm-next-player'; n++) {
      const i = r.interaction
      if (i.request.kind === 'confirm-player-switch')
        r = ok(s.resolveChoice(i.request.fromPlayerIndex, 'confirm'))
      else
        assert.fail(JSON.stringify(i))
    }
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: (actor + 1) % 3 })
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(r.state.roundPhase, 'work')
    return r
  }
  function plow(s: GameSession, actor: number, space = 'farmland') {
    let r = turn(s, actor, space)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow')
    const tile = r.interaction.request.farm.selectableTiles[0]
    assert.ok(tile)
    r = ok(s.commitSelectionChoice(actor, { tile }))
    return close(s, r, actor)
  }
  function fence(s: GameSession, actor: number, edges = THREE) {
    const r = turn(s, actor, 'fencing')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    return close(s, ok(s.commitSelectionChoice(actor, { edges, palisadeEdges: [], extraWood: 0 })), actor)
  }
  function store(r: SessionResponse) {
    return (['reed', 'clay'] as const).map(t => getStoredResource(r.state.players[0]!, CARD, t))
  }
  it("actual Lessons stores three reed and four clay without retroactive fields or pastures", () => {
    for (const farm of ['fields', 'pastures']) {
      const s = setup(state => farm === 'fields' ? fields(state, 0, 5) : fences(state, 0, THREE), false)
      let r = turn(s, 0, 'lessons')
      if (!r.state.players[0]!.occupationPlayed.includes(CARD))
        r = ok(s.resolveChoice(0, CARD))
      r = close(s, r)
      assert.ok(r.state.players[0]!.occupationPlayed.includes(CARD))
      assert.deepEqual(store(r), [3, 4])
      assert.equal(r.state.players[0]!.resources.reed, 0)
      assert.equal(r.state.players[0]!.resources.clay, 0)
      save(`A144-N1-${farm}`, r)
    }
  })
  it("real owner and opponent fifth plow award recipient four clay and empty owner storage", () => {
    for (const actor of [0, 1]) {
      const s = setup(state => fields(state, actor, 4))
      if (actor === 1)
        turn(s, 0, 'day-laborer')
      const r = plow(s, actor)
      assert.equal(r.state.players[actor]!.fields.length, 5)
      assert.equal(r.state.players[actor]!.resources.clay, 4)
      if (actor === 1)
        assert.equal(r.state.players[0]!.resources.clay, 0)
      assert.deepEqual(store(r), [3, 0])
      save(`A144-N2-${actor}`, r)
    }
  })
  it("real owner and opponent third pasture award three reed and empty only reed storage", () => {
    for (const actor of [0, 1]) {
      const s = setup(state => fences(state, actor, TWO))
      if (actor === 1)
        turn(s, 0, 'day-laborer')
      const r = fence(s, actor)
      assert.equal(r.state.players[actor]!.pastures.length, 3)
      assert.equal(r.state.players[actor]!.resources.reed, 3)
      r.state.players.forEach((player, index) => assert.equal(player.resources.reed, index === actor ? 3 : 0))
      assert.equal(r.state.players[actor]!.resources.wood, 12)
      assert.deepEqual(store(r), [0, 4])
      save(`A144-N3-${actor}`, r)
    }
  })
  it("below threshold empty stock and hand cannot award resources on real plow", () => {
    for (const [count, played, empty] of [[3, true, false], [4, false, false], [4, true, true]] as const) {
      const s = setup(state => {
        fields(state, 0, count)
        if (empty)
          setStoredResource(state.players[0]!, CARD, 'clay', 0)
      }, played)
      const r = plow(s, 0)
      assert.equal(r.state.players[0]!.resources.clay, 0)
      assert.equal(r.state.players[0]!.resources.reed, 0)
      save(`A144-N4-${count}-${played}-${empty}`, r)
    }
  })
  it("invalid plow rejects and own undo restores full stock before a single legal retry", () => {
    const s = setup(state => fields(state, 0, 4))
    let r = turn(s, 0, 'farmland')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 99, col: 99 } }))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow')
    r = close(s, ok(s.commitSelectionChoice(0, { tile: r.interaction.request.farm.selectableTiles[0]! })))
    assert.equal(r.state.players[0]!.fields.length, 5)
    assert.equal(r.state.players[0]!.resources.clay, 4)
    assert.deepEqual(store(r), [3, 0])
    const undone = undo(s)
    assert.equal(undone.state.players[0]!.fields.length, 4)
    assert.equal(undone.state.players[0]!.resources.clay, 0)
    assert.deepEqual(store(undone), [3, 4])
    const retry = plow(s, 0)
    assert.equal(retry.state.players[0]!.resources.clay, 4)
    assert.deepEqual(store(retry), [3, 0])
    save('A144-N5', { r, undone, retry })
  })
  it("next real sixth field cannot award emptied clay a second time", () => {
    const s = setup(state => fields(state, 0, 4))
    const first = plow(s, 0)
    turn(s, 1, 'day-laborer')
    turn(s, 2, 'grain-seeds')
    const second = plow(s, 0, 'cultivation')
    assert.equal(second.state.players[0]!.fields.length, 6)
    assert.equal(second.state.players[0]!.resources.clay, 4)
    assert.equal(second.state.players[0]!.resources.reed, 0)
    assert.deepEqual(store(second), [3, 0])
    save('A144-N6', { first, second })
  })
})
