import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertRuleOutcome, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Fields from './_helpers/audit/ae-negative-08-fields'

const CARD_ID = 'A058_AsparagusKnife'
const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = (round: number, crop: 'vegetable' | 'grain' = 'vegetable', remaining = 2) => {
  const session = createWorkSession({ seed: 2058, configure: state => {
    state.round = round
    for (const player of state.players) { player.resources.food = 60; markAllWorkersUsed(state, player) }
    state.players[0]!.minorPlayed = [CARD_ID]
    state.players[0]!.fields = [{ row: 0, col: 2, stacks: remaining ? [{ kind: crop, remaining }] : [] }]
  } })
  sessions.push(session)
  return session
}

describe('Asparagus Knife scheduled field exchange', () => {
  it.each([8, 10, 12])('round %i offers exactly one field vegetable for three food and one point', round => {
    const session = setup(round)
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Missing field exchange offer')
    expect(response.interaction.playerIndex).toBe(0)
    const accept = response.interaction.request.options?.find(option => option.value !== '__skip__')
    if (!accept) throw new Error('Missing acceptance')
    response = session.resolveChoice(0, accept.value)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'selection') response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(60)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Missing independent exchange')
    const exchange = response.interaction.request.options?.find(option => option.value !== '__skip__')
    if (!exchange) throw new Error('Missing exchange acceptance')
    response = session.resolveChoice(0, exchange.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(63)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.events.some(event => event.type === 'card.stateChanged')).toBe(true)
    expect(session.getState().scores).toBeDefined()
  })
  it('declining does not remove vegetables or add food or points', () => {
    const session = setup(8)
    const offered = session.performRoundEnd()
    if (offered.interaction.stateId !== 'wait') throw new Error('Missing field exchange offer')
    const response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(60)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
  it.each([[8, 'grain', 2], [8, 'vegetable', 0], [6, 'vegetable', 2]] as const)('round %i crop %s remaining %i has no offer', (round, crop, remaining) => {
    const response = setup(round, crop, remaining).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(60)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe('ae-negative-08-fields', () => {
  const { KNIFE, save, sessions, ok, setup, buy, deny, cardFlow, fields, phase, end, remaining, bonus, knifeResult, takeField } = audit08Fields
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A058 N4 taking one vegetable can decline the immediate exchange', () => {
   const s = phase(KNIFE); let r = takeField(s, end(s), { row: 0, col: 1 }, false); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value === '__skip__')) r = ok(s.resolveChoice(0, '__skip__'))
   assertRuleOutcome(knifeResult(r), { remaining: [1], vegetable: 1, food: 40, bonus: 0 })
  })
  it('A058 N5 accepted immediate exchange consumes the taken vegetable for three food and one point', () => {
   const s = phase(KNIFE); const r = takeField(s, end(s)); assert.deepEqual(knifeResult(r), { remaining: [1], vegetable: 0, food: 43, bonus: 1 })
  })
  it('A058 N1 actual printed one wood purchase has no immediate crop food or point', () => { deny(setup(KNIFE), KNIFE); const r = buy(setup(KNIFE, { resources: { wood: 1 } }), KNIFE); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.vegetable, 0); assert.equal(r.state.players[0]!.resources.food, 40); assert.equal(bonus(r), 0) })
  it('A058 N2 real return home of eight ten twelve triggers while seven nine and empty fields do not', () => {
   for (const round of [8, 10, 12]) { const s = phase(KNIFE, round); const r = takeField(s, end(s)); assert.deepEqual(knifeResult(r), { remaining: [1], vegetable: 0, food: 43, bonus: 1 }); assert.equal(r.state.round, round + 1) }
   for (const round of [7, 9]) { const s = phase(KNIFE, round); const r = end(s); assert.equal(bonus(r), 0); assert.equal(r.state.players[0]!.resources.food, 36); assert.deepEqual(remaining(r), [1]) }
   const empty = phase(KNIFE, 8, []); const r = end(empty); assert.equal(bonus(r), 0); assert.equal(r.state.players[0]!.resources.food, 40)
  })
  it('A058 N3 declining the entire take preserves crop stock food and point', () => { const s = phase(KNIFE); const r = cardFlow(s, end(s), KNIFE, false); assert.deepEqual(knifeResult(r), { remaining: [2], vegetable: 0, food: 40, bonus: 0 }) })
  it('A058 N6 only one selected vegetable field changes after invalid target and multi target rejection', () => {
   const s = phase(KNIFE, 8, [2, 1], 0, true, state => { state.players[0]!.fields.push({ row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] }, { row: 0, col: 4, stacks: [] }); fields(state, 'vegetable', [2], 1) }); let r = cardFlow(s, end(s), KNIFE)
   assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection'); assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { positions: [{ row: 0, col: 1 }] }))
   for (const positions of [[{ row: 0, col: 3 }], [{ row: 0, col: 4 }], [{ row: 2, col: 4 }], [{ row: 0, col: 1 }, { row: 0, col: 2 }]]) assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions }))
   r = cardFlow(s, ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })), KNIFE); assert.deepEqual(knifeResult(r), { remaining: [2, 0, 2, 0], vegetable: 0, food: 43, bonus: 1 }); assert.deepEqual(remaining(r, 1), [2])
  })
  it('A058 N7 unplayed card and only opponent vegetable field give no owner reward', () => {
   const unplayed = phase(KNIFE, 8, [2], 0, false); let r = end(unplayed); assert.deepEqual(knifeResult(r), { remaining: [2], vegetable: 0, food: 40, bonus: 0 })
   const s = phase(KNIFE, 8, [], 0, true, state => fields(state, 'vegetable', [2], 1)); r = end(s); assert.equal(bonus(r), 0); assert.equal(r.state.players[0]!.resources.food, 40); assert.deepEqual(remaining(r, 1), [2])
  })
  it('A058 N8 actual phase undo capability and stale selection are observed without invented restore', () => {
   const s = phase(KNIFE, 8, [2, 2]); const selection = cardFlow(s, end(s), KNIFE); assert.ok(selection.interaction.stateId === 'wait' && selection.interaction.request.kind === 'selection'); const before = undoRuleSnapshot(selection)
   const taken = cardFlow(s, ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] })), KNIFE); assert.equal(bonus(taken), 1); assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] })); const undone = s.undoStep(); save('A058-N8-undo', { selection, taken, undone })
   if (undone.ok && undone.interaction.stateId === 'wait' && undone.interaction.request.kind === 'selection') { assert.deepEqual(JSON.parse(undoRuleSnapshot(undone)), JSON.parse(before)); const retry = cardFlow(s, ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] })), KNIFE); assert.equal(bonus(retry), 1) } else { assert.ok(!undone.ok, JSON.stringify(undone.interaction)); assert.equal(bonus(s.getState()), 1) }
  })
  it('A058 N6G forged own grain field is rejected at the actual multi field selection', () => {
   const s = phase(KNIFE, 8, [2, 1], 0, true, state => { state.players[0]!.fields.push({ row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] }) }); const r = cardFlow(s, end(s), KNIFE); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection'); assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })); const legal = cardFlow(s, ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })), KNIFE); assert.deepEqual(remaining(legal), [2, 0, 2]); assert.equal(bonus(legal), 1)
  })
  it('A058 N6O forged opponent vegetable field is rejected at the actual multi field selection', () => {
   const s = phase(KNIFE, 8, [2, 1], 0, true, state => { state.players[1]!.fields = [{ row: 0, col: 4, stacks: [{ kind: 'vegetable', remaining: 2 }] }] }); const r = cardFlow(s, end(s), KNIFE); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection'); assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 4 }] })); const legal = cardFlow(s, ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })), KNIFE); assert.deepEqual(remaining(legal, 1), [2]); assert.equal(bonus(legal), 1)
  })
})
