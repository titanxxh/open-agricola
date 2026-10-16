import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A071_ClearingSpade'
import '../../shared/cards/B/B068_Beanfield'
import '../../shared/cards/C/C070_LettucePatch'
import { type AnytimeAction, type Field, type GameState, type Resource } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A071_ClearingSpade session', () => {
  const setup = (fields?: Field[]) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push('A071_ClearingSpade')
    session.loadState(state)
    session.devPlayCard(0, 'A071_ClearingSpade')

    // Set up fields
    const s2 = session.getState().state
    const p = s2.players[0]!
    p.fields = fields ?? [
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },   // source: has grain >= 2
      { row: 0, col: 3, stacks: [] },       // target: empty plowed field
      { row: 1, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] }, // not eligible (only 1)
    ]
    session.loadState(s2)
    return session
  }

  /** Enter an active interaction so we can test anytime actions */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('anytime action available when source field (>=2 crops) AND empty field exist', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('A71-clearing-spade-anytime')
  })

  it('full flow: select source field then target field, crop is moved', () => {
    const session = setup()
    enterActiveInteraction(session)

    // Step 1: take anytime action — first selection choice
    let resp = session.takeAnytimeAction(0, 'A71-clearing-spade-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected choice')

    // Select the source field (0-2) which has grain remaining=3
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(resp.ok).toBe(true)

    // Step 2: second selection choice for target
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected choice')

    // Select the target field (0-3) which is empty
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })
    expect(resp.ok).toBe(true)

    // Verify results
    const player = resp.state.players[0]!
    const sourceField = player.fields.find(f => f.row === 0 && f.col === 2)!
    const targetField = player.fields.find(f => f.row === 0 && f.col === 3)!

    // Source: was grain remaining=3, now remaining=2
    expect(sourceField.stacks[0]?.kind).toBe('grain')
    expect(sourceField.stacks[0]?.remaining ?? 0).toBe(2)

    // Target: was empty, now has grain remaining=1
    expect(targetField.stacks[0]?.kind).toBe('grain')
    expect(targetField.stacks[0]?.remaining ?? 0).toBe(1)
  })

  it('NOT available when no field has >= 2 crops', () => {
    const session = setup([
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },   // only 1 crop
      { row: 0, col: 3, stacks: [] },       // empty field
    ])
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A71-clearing-spade-anytime')
  })

  it('NOT available when no empty plowed fields exist', () => {
    const session = setup([
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },     // source OK
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] }, // not empty
    ])
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A71-clearing-spade-anytime')
  })

  it('works with vegetable fields as source', () => {
    const session = setup([
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] }, // source
      { row: 0, col: 3, stacks: [] },         // target
    ])
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'A71-clearing-spade-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Select source
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Select target
    resp = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    const sourceField = player.fields.find(f => f.row === 0 && f.col === 2)!
    const targetField = player.fields.find(f => f.row === 0 && f.col === 3)!

    expect(sourceField.stacks[0]?.kind).toBe('vegetable')
    expect(sourceField.stacks[0]?.remaining ?? 0).toBe(1)
    expect(targetField.stacks[0]?.kind).toBe('vegetable')
    expect(targetField.stacks[0]?.remaining ?? 0).toBe(1)
  })

  it('moves a crop between compatible Card Fields', () => {
    const session = setup([])
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('B068_Beanfield', 'C070_LettucePatch')
    player.cardStates.B068_Beanfield = {
      extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
    }
    player.cardStates.C070_LettucePatch = {
      extraData: { cardFieldStacks: [null] },
    }
    session.loadState(state)
    enterActiveInteraction(session)

    let resp = session.takeAnytimeAction(0, 'A71-clearing-spade-anytime')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 2068 }] })
    expect(resp.ok).toBe(true)
    assert.ok(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'selection')
    assert.ok(resp.interaction.request.selection.kind === 'farm-position')
    expect(resp.interaction.request.selection.selectablePositions).toEqual([{
      row: -1,
      col: 3070,
      sourceCard: 'C070_LettucePatch',
      groupKey: 'C070_LettucePatch',
      cardFieldSlot: 0,
    }])
    resp = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 3070 }] })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates.B068_Beanfield?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 1 },
    ])
    expect(resp.state.players[0]!.cardStates.C070_LettucePatch?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 1 },
    ])
  })
})

describe("A071 command boundaries", () => {
  const SPADE = 'A071_ClearingSpade'
  function confirmed(r: SessionResponse, actor = 0) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(r.interaction.request.nextPlayerIndex, 1 - actor)
    return r
  }
  function idle(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'work')
    return r
  }
  function restoredInteraction(s: GameSession, r: SessionResponse, expected: string) {
    assert.equal(JSON.stringify(r.interaction), expected)
    assert.equal(JSON.stringify(s.getState().interaction), expected)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup({ played = true, round = 5, resources = {} }: {
    played?: boolean
    round?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [SPADE, '__test_placeholder__']
        p.minorPlayed = played ? [SPADE] : []
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    for (const p of s.getState().state.players) {
      assert.equal(p.workers.length, 5)
      assert.equal(p.workers.filter(w => w.isActive).length, 2)
      assert.equal(p.fenceSegments.length, 0)
      assert.equal(p.stableTiles.length, 0)
    }
    return s
  }
  function choices(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function buyMenu(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const o = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (o)
        r = ok(s.resolveChoice(0, o.value))
    }
    return r
  }
  function buy(s: GameSession, card: string) {
    // Each legal fixture has one playable minor, automatically selected after this entry.
    const r = buyMenu(s)
    assert.equal(r.state.players[0]!.minorHand.includes(card), false)
    assert.ok(r.state.players[0]!.minorPlayed.includes(card))
    return confirmed(r)
  }
  function deny(s: GameSession, card: string) {
    const r = buyMenu(s)
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    confirmed(s.getState())
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, confirmed(r, 1 - actor))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return ok(s.takeAction(actor, space))
  }
  function fields(state: GameState, crops: Array<{
    kind: 'grain' | 'vegetable'
    remaining: number
  } | null>, owner = 0, start = 1) {
    state.players[owner]!.fields = crops.map((crop, i) => ({ row: 0, col: start + i, stacks: crop ? [crop] : [] }))
  }
  function board(r: SessionResponse, owner = 0) {
    return r.state.players[owner]!.fields.map(f => f.stacks.reduce((n, v) => n + v.remaining, 0))
  }
  function plowPending(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow', JSON.stringify(r.interaction))
    assert.equal(r.interaction.promptKey, 'ui.interactionPlowSelect')
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    return r
  }
  function resumed(r: SessionResponse, expected: 'idle' | 'confirm-next-player' | 'farm-select') {
    if (expected === 'idle') return idle(r)
    if (expected === 'confirm-next-player') return confirmed(r)
    return plowPending(r)
  }
  function selection(s: GameSession, r: SessionResponse, position = { row: 0, col: 1 }) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection', JSON.stringify(r.interaction))
    assert.equal(r.interaction.sourceCard, SPADE)
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    return ok(s.commitSelectionChoice(0, { positions: [position] }))
  }
  const SPADE_ACTION = 'A71-clearing-spade-anytime'
  function spade(crop: 'grain' | 'vegetable' = 'grain', count = 2, empty = true, configure: (state: GameState) => void = () => {
  }) {
    return setup({}, state => {
      fields(state, [count ? { kind: crop, remaining: count } : null, empty ? null : { kind: 'vegetable', remaining: 1 }, null])
      configure(state)
    })
  }
  function openSpade(s: GameSession) {
    const r = ok(s.takeAnytimeAction(0, SPADE_ACTION))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection', JSON.stringify(r.interaction))
    assert.equal(r.interaction.sourceCard, SPADE)
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    return r
  }
  function move(s: GameSession, source = { row: 0, col: 1 }, target = { row: 0, col: 2 }, expected: 'idle' | 'confirm-next-player' | 'farm-select' = 'idle') {
    resumed(s.getState(), expected)
    return resumed(selection(s, selection(s, openSpade(s), source), target), expected)
  }
  function cropSupply(r: SessionResponse) {
    return { grain: r.state.players[0]!.resources.grain, vegetable: r.state.players[0]!.resources.vegetable }
  }
  it("actual one wood purchase permits grain and vegetable transfers without spending supply", () => {
    deny(setup({ played: false }), SPADE)
    for (const kind of ['grain', 'vegetable'] satisfies Array<'grain' | 'vegetable'>) {
      const s = setup({ played: false, resources: { wood: 1 } }, state => fields(state, [{ kind, remaining: 2 }, null]))
      buy(s, SPADE)
      const r = move(s, { row: 0, col: 1 }, { row: 0, col: 2 }, 'confirm-next-player')
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.deepEqual(board(r), [1, 1])
      assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 })
      sessionEvidence.record(`A071-N1-${kind}`, r)
    }
  })
  it("source below two and absence of an empty target leave no legal transfer", () => {
    for (const count of [0, 1]) {
      const s = spade('grain', count)
      assert.ok(!s.getState().interaction.anytimeActions.some(a => a.id === SPADE_ACTION))
      assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, SPADE_ACTION))
    }
    const s = setup({}, state => fields(state, [{ kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 1 }]))
    assert.ok(!s.getState().interaction.anytimeActions.some(a => a.id === SPADE_ACTION))
    assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, SPADE_ACTION))
  })
  it("genuine source and target selectors reject planted same foreign multi and wrong actor targets", () => {
    const s = spade('grain', 2, true, state => fields(state, [{ kind: 'grain', remaining: 2 }], 1, 4))
    let r = openSpade(s)
    for (const positions of [[{ row: 0, col: 2 }], [{ row: 0, col: 4 }], [{ row: 0, col: 1 }, { row: 0, col: 2 }]])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions }))
    r = selection(s, r)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { positions: [{ row: 0, col: 2 }] }))
    for (const col of [1, 4])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col }] }))
    r = idle(selection(s, r, { row: 0, col: 2 }))
    assert.deepEqual(board(r), [1, 1, 0])
    assert.deepEqual(board(r, 1), [2])
    assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 })
  })
  it("two separate legal anytime transfers stop only when the source falls below two", () => {
    const s = spade('grain', 3)
    move(s)
    const r = move(s, { row: 0, col: 1 }, { row: 0, col: 3 })
    assert.deepEqual(board(r), [1, 1, 1])
    assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 })
    assert.ok(!r.interaction.anytimeActions.some(a => a.id === SPADE_ACTION))
    sessionEvidence.record('A071-N3-two-transfers', r)
  })
  it("wood in Wood Field is not a crop eligible for Clearing Spade", () => {
    const s = spade('grain', 2, true, state => {
      const p = state.players[0]!
      p.minorPlayed.push('D075_WoodField')
      p.occupationPlayed = ['A125_Priest']
      p.cardStates.D075_WoodField = { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 2 }, null] } }
    })
    const r = openSpade(s)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection')
    const selector = r.interaction.request.selection
    assert.ok(selector?.kind === 'farm-position')
    const positions = selector.selectablePositions
    sessionEvidence.record('A071-N4-source-request', r)
    const wood = positions.find(p => p.row === -1 && p.col === 4075)
    assert.equal(wood, undefined)
    idle(selection(s, selection(s, r), { row: 0, col: 2 }))
    const p = s.getState().state.players[0]!
    const actual = { woodSourceOffered: Boolean(wood), farmWood: p.fields.flatMap(f => f.stacks).filter(v => v.kind === 'wood').reduce((n, v) => n + v.remaining, 0), woodCardStacks: p.cardStates.D075_WoodField?.extraData?.cardFieldStacks, woodSupply: p.resources.wood }
    sessionEvidence.record('A071-N4-outcome', actual)
    assert.deepEqual(actual, { woodSourceOffered: false, farmWood: 0, woodCardStacks: [{ crop: 'wood', remaining: 2 }, null], woodSupply: 0 })
  })
  it("moving a vegetable is not sowing and does not trigger Garden Hoe", () => {
    const s = spade('vegetable', 2, true, state => state.players[0]!.minorPlayed.push('A079_GardenHoe'))
    const r = move(s)
    assert.deepEqual(board(r), [1, 1, 0])
    assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 })
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.equal(r.state.players[0]!.resources.stone, 0)
  })
  it("actual completed transfer undo observes native capability and retries without duplicating crops", () => {
    const s = spade()
    const initial = idle(s.getState())
    const beforeInteraction = JSON.stringify(initial.interaction)
    const before = undoRuleSnapshot(initial)
    plowPending(turn(s, 0, 'farmland'))
    move(s, { row: 0, col: 1 }, { row: 0, col: 2 }, 'farm-select')
    const undone = s.undoAction()
    sessionEvidence.record('A071-N6-undo', { before: JSON.parse(before), response: undone })
    assertUndoRestored(before, undone)
    restoredInteraction(s, undone, beforeInteraction)
    plowPending(turn(s, 0, 'farmland'))
    const r = move(s, { row: 0, col: 1 }, { row: 0, col: 2 }, 'farm-select')
    assert.deepEqual(board(r), [1, 1, 0])
    assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 })
    sessionEvidence.record('A071-N6-retry', r)
  })
})
