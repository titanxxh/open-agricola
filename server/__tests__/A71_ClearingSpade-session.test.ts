import { describe, expect, it, afterAll, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A071_ClearingSpade'
import '../../shared/cards/B/B068_Beanfield'
import '../../shared/cards/C/C070_LettucePatch'
import type { AnytimeAction } from '../../shared/contract/types';
import assert from 'node:assert/strict'
import fs from './_helpers/audit-evidence-fs'
import { assertRejectedUnchanged, assertRuleOutcome, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit10FieldSource from './_helpers/audit/ae-negative-10-field-source'

describe('A071_ClearingSpade session', () => {
  const setup = (fields?: { row: number; col: number; crop: string | null; remaining: number }[]) => {
    const session = new GameSession(42)
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
    expect(resp.interaction.stateId === 'wait'
      ? resp.interaction.request.selection?.selectablePositions
      : []).toEqual([{
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

describe('ae-negative-10-field-source', () => {
  const { SPADE, root, sessions, saved, save, setup, buy, deny, turn, fields, board, selection, SPADE_ACTION, spade, openSpade, move, cropSupply } = audit10FieldSource
  afterAll(() => { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(`${root}/manifest.json`, JSON.stringify({ raw: process.env.AGRICOLA_NEGATIVE_RAW === '1', files: saved }, null, 2)) })
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A071 N1 actual one wood purchase permits grain and vegetable transfers without spending supply', () => {
   deny(setup(SPADE, { played: false }), SPADE)
   for (const kind of ['grain', 'vegetable'] satisfies Array<'grain' | 'vegetable'>) { const s = setup(SPADE, { played: false, resources: { wood: 1 } }, state => fields(state, [{ kind, remaining: 2 }, null])); buy(s, SPADE); const r = move(s); assert.equal(r.state.players[0]!.resources.wood, 0); assert.deepEqual(board(r), [1, 1]); assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 }); save(`A071-N1-${kind}`, r) }
  })
  it('A071 N2 source below two and absence of an empty target leave no legal transfer', () => {
   for (const count of [0, 1]) { const s = spade('grain', count); assert.ok(!s.getState().interaction.anytimeActions.some(a => a.id === SPADE_ACTION)); assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, SPADE_ACTION)) }
   const s = setup(SPADE, {}, state => fields(state, [{ kind: 'grain', remaining: 2 }, { kind: 'vegetable', remaining: 1 }])); assert.ok(!s.getState().interaction.anytimeActions.some(a => a.id === SPADE_ACTION)); assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, SPADE_ACTION))
  })
  it('A071 N2T genuine source and target selectors reject planted same foreign multi and wrong actor targets', () => {
   const s = spade('grain', 2, true, state => fields(state, [{ kind: 'grain', remaining: 2 }], 1, 4)); let r = openSpade(s)
   for (const positions of [[{ row: 0, col: 2 }], [{ row: 0, col: 4 }], [{ row: 0, col: 1 }, { row: 0, col: 2 }]]) assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions }))
   r = selection(s, r); assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { positions: [{ row: 0, col: 2 }] })); for (const col of [1, 4]) assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col }] })); r = selection(s, r, { row: 0, col: 2 }); assert.deepEqual(board(r), [1, 1, 0]); assert.deepEqual(board(r, 1), [2]); assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 })
  })
  it('A071 N3 two separate legal anytime transfers stop only when the source falls below two', () => { const s = spade('grain', 3); move(s); const r = move(s, { row: 0, col: 1 }, { row: 0, col: 3 }); assert.deepEqual(board(r), [1, 1, 1]); assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 }); assert.ok(!r.interaction.anytimeActions.some(a => a.id === SPADE_ACTION)); save('A071-N3-two-transfers', r) })
  it('A071 N4 wood in Wood Field is not a crop eligible for Clearing Spade', () => {
   const s = spade('grain', 2, true, state => { const p = state.players[0]!; p.minorPlayed.push('D075_WoodField'); p.occupationPlayed = ['A125_Priest']; p.cardStates.D075_WoodField = { extraData: { cardFieldStacks: [{ crop: 'wood', remaining: 2 }, null] } } })
   const r = openSpade(s); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection'); const selector = r.interaction.request.selection; assert.ok(selector?.kind === 'farm-position'); const positions = selector.selectablePositions; save('A071-N4-source-request', r)
   const wood = positions.find(p => p.row === -1 && p.col === 4075)
   if (wood) { const moved = selection(s, selection(s, r, wood), { row: 0, col: 2 }); save('A071-N4-wood-completed', moved) }
   else { selection(s, selection(s, r), { row: 0, col: 2 }) }
   const p = s.getState().state.players[0]!; const actual = { woodSourceOffered: Boolean(wood), farmWood: p.fields.flatMap(f => f.stacks).filter(v => v.kind === 'wood').reduce((n, v) => n + v.remaining, 0), woodCardStacks: p.cardStates.D075_WoodField?.extraData?.cardFieldStacks, woodSupply: p.resources.wood }; save('A071-N4-outcome', actual); assertRuleOutcome(actual, { woodSourceOffered: false, farmWood: 0, woodCardStacks: [{ crop: 'wood', remaining: 2 }, null], woodSupply: 0 })
  })
  it('A071 N5 moving a vegetable is not sowing and does not trigger Garden Hoe', () => { const s = spade('vegetable', 2, true, state => state.players[0]!.minorPlayed.push('A079_GardenHoe')); const r = move(s); assert.deepEqual(board(r), [1, 1, 0]); assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 }); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.players[0]!.resources.stone, 0) })
  it('A071 N6 actual completed transfer undo observes native capability and retries without duplicating crops', () => {
   const s = spade(); const before = undoRuleSnapshot(s.getState()); turn(s, 0, 'farmland'); move(s); const undone = s.undoAction(); save('A071-N6-undo', { before: JSON.parse(before), response: undone }); if (undone.ok) { assertUndoRestored(before, undone); turn(s, 0, 'farmland'); const r = move(s); assert.deepEqual(board(r), [1, 1, 0]); assert.deepEqual(cropSupply(r), { grain: 0, vegetable: 0 }); save('A071-N6-retry', r) } else { assert.deepEqual(board(undone), [1, 1, 0]); assert.deepEqual(cropSupply(undone), { grain: 0, vegetable: 0 }) }
  })
})
