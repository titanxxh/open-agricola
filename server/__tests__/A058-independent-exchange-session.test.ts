import { describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { type SessionResponse, type GameSession } from '../game/authoritative-session'
import { type GameState, type Resource } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A058_AsparagusKnife'
const setup = (round = 8, configure?: (state: GameState) => void) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42, configure: state => {
      state.round = round
      for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 40
    }
      state.players[0]!.minorPlayed = [CARD_ID]
      state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] }]
      configure?.(state)
    } }))
  return session
}
const reachReturnHome = (session: ReturnType<typeof setup>) => {
  let response = session.getState()
  for (const [player, space] of [[0, 'forest'], [1, 'clay-pit'], [0, 'reed-bank'], [1, 'grain-seeds']] as const) {
    response = session.takeAction(player, space)
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      expect(response.ok, response.error).toBe(true)
    }
  }
  return response
}
const snapshot = ({ state, interaction, scores }: SessionResponse) => JSON.stringify({ state, interaction, scores })
const accept = (session: ReturnType<typeof setup>, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected choice')
  expect(response.interaction.playerIndex).toBe(0)
  const option = getChoiceOptions(response)?.find(candidate => candidate.value !== '__skip__')
  if (!option) throw new Error('Expected acceptance option')
  return session.resolveChoice(0, option.value)
}
describe('Asparagus Knife takes a vegetable before an independent exchange', () => {
  it('can keep the selected vegetable without earning food or a bonus point', () => {
    const session = setup()
    let response = accept(session, reachReturnHome(session))
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('selection')
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 40 })
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('choice')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected independent exchange')
    expect(response.interaction.playerIndex).toBe(0)
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 40 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
    expect(response.state.events.some(event => event.type === 'farm.cropRemoved' && (event.reason === 'harvest' || event.reason === 'reap'))).toBe(false)
  })

  it.each([8, 10, 12])('round %i can exchange the taken vegetable exactly once', round => {
    const session = setup(round)
    let response = accept(session, reachReturnHome(session))
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 40 })
    response = accept(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 43 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(response.state.events.filter(event => event.type === 'farm.cropRemoved' && event.sourceCardId === CARD_ID)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'card.stateChanged' && event.cardId === CARD_ID && event.key === 'bonusVp')).toHaveLength(1)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.total).toBe(1)
    const settled = structuredClone(response.state.players[0])
    const retry = session.resolveChoice(0, '__skip__')
    expect(retry.ok).toBe(false)
    expect(retry.state.players[0]).toEqual(settled)
  })

  it('declining the initial offer leaves the field and inventory untouched', () => {
    const session = setup()
    const offered = reachReturnHome(session)
    const response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toEqual(offered.state.players[0]!.fields)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 40 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('takes from only the selected field and rejects two targets atomically', () => {
    const session = setup(8, state => {
      state.players[0]!.fields.push({ row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 1 }] })
    })
    const selected = accept(session, reachReturnHome(session))
    const before = snapshot(selected)
    const rejected = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }, { row: 0, col: 3 }] })
    expect(rejected.ok).toBe(false)
    expect(snapshot(rejected)).toBe(before)
    let response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.map(field => field.stacks)).toEqual([[{ kind: 'vegetable', remaining: 2 }], []])
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 40 })
  })

  it.each([
    ['wrong round', 6, (state: GameState) => state],
    ['no vegetables', 8, (state: GameState) => { state.players[0]!.fields[0]!.stacks = [{ kind: 'grain', remaining: 2 }] }],
    ['empty field', 8, (state: GameState) => { state.players[0]!.fields[0]!.stacks = [] }],
    ['absent card', 8, (state: GameState) => { state.players[0]!.minorPlayed = [] }],
  ] as const)('%s does not offer a take or exchange', (_name, round, configure) => {
    const session = setup(round, configure)
    const response = reachReturnHome(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 40 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('a non-owner cannot accept the return-home offer', () => {
    const session = setup()
    const offered = reachReturnHome(session)
    const before = snapshot(offered)
    const rejected = session.resolveChoice(1, '__skip__')
    expect(rejected.ok).toBe(false)
    expect(snapshot(rejected)).toBe(before)
  })

  it('retains a Card Field owner continuation before offering the exchange', () => {
    const fieldCard = 'E070_CropRotationField'
    const session = setup(8, state => {
      const player = state.players[0]!
      player.fields = []
      player.resources.grain = 1
      player.minorPlayed.push(fieldCard)
      player.cardStates[fieldCard] = { extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 1 }] } }
    })
    let response = accept(session, reachReturnHome(session))
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'selection') throw new Error('Expected Card Field selection')
    if (response.interaction.request.selection.kind !== 'farm-position') throw new Error('Expected farm position')
    const tile = response.interaction.request.selection.selectablePositions[0]
    if (!tile) throw new Error('Missing Card Field tile')
    response = session.commitSelectionChoice(0, { positions: [tile] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 40 })
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).toBe(fieldCard)
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 0, food: 40 })
    expect(response.state.players[0]!.cardStates[fieldCard]?.extraData?.cardFieldStacks).toEqual([{ crop: 'vegetable', remaining: 1 }])
    response = session.commitSelectionChoice(0, { positions: [tile] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 40 })
    const cursor = session.createSessionPrivateCursor()
    session.loadState(JSON.parse(JSON.stringify(response.state)))
    session.restoreSessionPrivateCursor(cursor)
    response = session.getState()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).toBe(fieldCard)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 40 })
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 40 })
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1, food: 40 })
    expect(response.state.players[0]!.cardStates[fieldCard]?.extraData?.cardFieldStacks).toEqual([null])
  })

  it('restores the exchange pending without taking or awarding twice', () => {
    const session = setup()
    accept(session, reachReturnHome(session))
    let response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    const cursor = session.createSessionPrivateCursor()
    session.loadState(JSON.parse(JSON.stringify(response.state)))
    session.restoreSessionPrivateCursor(cursor)
    response = accept(session, session.getState())
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 43 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.total).toBe(1)
  })

  it('undoing the take returns to selection and retrying keeps exactly one vegetable', () => {
    const session = setup()
    accept(session, reachReturnHome(session))
    session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    let response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 40 })
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('selection')
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 40 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})
describe("A058 command boundaries", () => {
  const KNIFE = 'A058_AsparagusKnife'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function setup({ round = 5, played = false, occupations = 0, resources = {} }: {
    round?: number
    played?: boolean
    occupations?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => { }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : ["A058_AsparagusKnife", '__test_placeholder__']
        p.minorPlayed = played ? ["A058_AsparagusKnife"] : []
        p.occupationPlayed = ['D115_FodderPlanter', 'A111_WallBuilder', 'A125_Priest'].slice(0, occupations)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }





  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)); }
  function cardFlow(s: GameSession, r: SessionResponse, card: string, accept = true) {
    for (let n = 0; n < 8 && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'select-trigger') {
        const o = getChoiceOptions(r).find(o => o.value === card)
        assert.ok(o, JSON.stringify(r.interaction))
        r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
        continue
      }
      if (r.interaction.request.kind !== 'choice')
        break
      const opts = getChoiceOptions(r)
      const selected = opts.filter(o => accept ? o.value !== '__skip__' && !o.disabled : o.value === '__skip__' && !o.disabled)
      assert.equal(selected.length, 1, JSON.stringify(r.interaction))
      const o = selected[0]
      assert.ok(o, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(r.interaction.playerIndex, o.value))
    }
    return r
  }
  function fields(state: GameState, crop: 'vegetable' | 'grain', amounts: number[], owner = 0) { state.players[owner]!.fields = amounts.map((remaining, i) => ({ row: 0, col: 1 + i, stacks: remaining > 0 ? [{ kind: crop, remaining }] : [] })); }
  function phase(round = 8, amounts = [2], vegetable = 0, played = true, configure: (state: GameState) => void = () => { }) { return setup({ round, played, resources: { vegetable } }, state => { fields(state, 'vegetable', amounts); configure(state); }); }
  function end(s: GameSession) { turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest'); turn(s, 0, 'reed-bank'); return confirmNext(s, turn(s, 1, 'clay-pit')); }
  function remaining(r: SessionResponse, owner = 0) { return r.state.players[owner]!.fields.map(f => f.stacks.reduce((n, stack) => n + stack.remaining, 0)); }
  function bonus(r: SessionResponse) { const value = r.state.players[0]!.cardStates[KNIFE]?.counters?.bonusVp ?? 0; assert.ok(r.scores); assert.ok(r.scores[0]); assert.equal(r.scores[0].categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === KNIFE)?.score ?? 0, value); return value; }
  function knifeResult(r: SessionResponse) { return { remaining: remaining(r), vegetable: r.state.players[0]!.resources.vegetable, food: r.state.players[0]!.resources.food, bonus: bonus(r) }; }
  function takeField(s: GameSession, r: SessionResponse, target = { row: 0, col: 1 }, exchange = true) {
    r = cardFlow(s, r, KNIFE)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection')
      r = ok(s.commitSelectionChoice(r.interaction.playerIndex, { positions: [target] }))
    return exchange ? cardFlow(s, r, KNIFE) : r
  }
  it("real return home of eight ten twelve triggers while seven nine and empty fields do not", () => {
    for (const round of [8, 10, 12]) {
      const s = phase(round)
      const r = takeField(s, end(s))
      assert.deepEqual(knifeResult(r), { remaining: [1], vegetable: 0, food: 43, bonus: 1 })
      assert.equal(r.state.round, round + 1)
    }
    for (const round of [7, 9]) {
      const s = phase(round)
      const r = end(s)
      assert.equal(bonus(r), 0)
      assert.equal(r.state.players[0]!.resources.food, 36)
      assert.deepEqual(remaining(r), [1])
    }
    const empty = phase(8, [])
    const r = end(empty)
    assert.equal(bonus(r), 0)
    assert.equal(r.state.players[0]!.resources.food, 40)
  })
  it("only one selected vegetable field changes after invalid target and multi target rejection", () => {
    const s = phase(8, [2, 1], 0, true, state => { state.players[0]!.fields.push({ row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] }, { row: 0, col: 4, stacks: [] }); fields(state, 'vegetable', [2], 1); })
    let r = cardFlow(s, end(s), KNIFE)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { positions: [{ row: 0, col: 1 }] }))
    for (const positions of [[{ row: 0, col: 3 }], [{ row: 0, col: 4 }], [{ row: 2, col: 4 }], [{ row: 0, col: 1 }, { row: 0, col: 2 }]])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions }))
    r = cardFlow(s, ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })), KNIFE)
    assert.deepEqual(knifeResult(r), { remaining: [2, 0, 2, 0], vegetable: 0, food: 43, bonus: 1 })
    assert.deepEqual(remaining(r, 1), [2])
  })
  it("unplayed card and only opponent vegetable field give no owner reward", () => {
    const unplayed = phase(8, [2], 0, false)
    let r = end(unplayed)
    assert.deepEqual(knifeResult(r), { remaining: [2], vegetable: 0, food: 40, bonus: 0 })
    const s = phase(8, [], 0, true, state => fields(state, 'vegetable', [2], 1))
    r = end(s)
    assert.equal(bonus(r), 0)
    assert.equal(r.state.players[0]!.resources.food, 40)
    assert.deepEqual(remaining(r, 1), [2])
  })
  it("completed scheduled exchange rejects step undo and stale field selection without replaying rewards", () => {
    const s = phase(8, [2, 2])
    const selection = cardFlow(s, end(s), KNIFE)
    assert.ok(selection.interaction.stateId === 'wait' && selection.interaction.request.kind === 'selection')
    const taken = cardFlow(s, ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] })), KNIFE)
    assert.deepEqual(knifeResult(taken), { remaining: [1, 2], vegetable: 0, food: 43, bonus: 1 })
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] }))
    const undone = assertRejectedUnchanged(s, () => s.undoStep())
    sessionEvidence.record('A058-N8-undo', { selection, taken, undone })
    assert.equal(undone.error, 'no history to undo')
    assert.deepEqual(knifeResult(s.getState()), { remaining: [1, 2], vegetable: 0, food: 43, bonus: 1 })
  })
  it("forged own grain field is rejected at the actual multi field selection", () => {
    const s = phase(8, [2, 1], 0, true, state => { state.players[0]!.fields.push({ row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] }); })
    const r = cardFlow(s, end(s), KNIFE)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 3 }] }))
    const legal = cardFlow(s, ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })), KNIFE)
    assert.deepEqual(remaining(legal), [2, 0, 2])
    assert.equal(bonus(legal), 1)
  })
  it("forged opponent vegetable field is rejected at the actual multi field selection", () => {
    const s = phase(8, [2, 1], 0, true, state => { state.players[1]!.fields = [{ row: 0, col: 4, stacks: [{ kind: 'vegetable', remaining: 2 }] }]; })
    const r = cardFlow(s, end(s), KNIFE)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 4 }] }))
    const legal = cardFlow(s, ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })), KNIFE)
    assert.deepEqual(remaining(legal, 1), [2])
    assert.equal(bonus(legal), 1)
  })
})
