import { captureStateWithHistory } from '../../shared/session/history-streams'
import { assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { type GameState } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { createWorkSession } from './_helpers/session-fixtures'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const FORESTER = 'A115_ChiefForester'
const HOE = 'A079_GardenHoe'
const PELLETS = 'A065_SeedPellets'
const PUBLICAN = 'A132_Publican'
const WOOD_FIELD = 'D075_WoodField'
type RewardCard = typeof HOE | typeof PELLETS | typeof PUBLICAN
const REWARDS: RewardCard[] = [PELLETS, HOE, PUBLICAN]

// Confirmed Session seam (#1134): a new work game uses Forest's before Sow,
// rejects two Logical Fields atomically, then completes one field and collects.
const setup = (reward: RewardCard = HOE, configure?: (state: GameState) => void) => {
  const session = sessionEvidence.track(createWorkSession({ options: { playerCount: reward === PUBLICAN ? 4 : 2 }, configure: (state) => {
    state.round = 5
    const player = state.players[0]!
    player.occupationPlayed = [FORESTER]
    player.minorPlayed = reward === PUBLICAN ? [] : [reward]
    if (reward === PUBLICAN) {
      state.players[1]!.occupationPlayed = [PUBLICAN]
      state.players[1]!.resources.grain = 1
    }
    Object.assign(player.resources, { wood: 0, grain: 2, vegetable: 1, food: 20 })
    player.fields = [{ row: 0, col: 2, stacks: [] }, { row: 0, col: 3, stacks: [] }]
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    state.roundActionOrder[0] = 'grain-utilization'
    configure?.(state)
  } }))
  return session
}

const waiting = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected pending interaction')
  return response.interaction
}

const startForesterSow = (session: GameSession) => {
  let response = session.takeAction(0, 'forest')
  for (let step = 0; step < 4 && waiting(response).request.kind !== 'farm-select'; step++) {
    const request = waiting(response).request
    if (request.kind !== 'choice' && request.kind !== 'select-trigger') throw new Error('Expected optional Sow choice')
    const accept = request.options.find((option) => option.value !== '__skip__')
    if (!accept) throw new Error('Expected optional Sow acceptance')
    response = session.resolveChoice(0, accept.value)
  }
  const request = waiting(response).request
  expect(request.kind).toBe('farm-select')
  if (request.kind !== 'farm-select' || request.farm.farmType !== 'sow') throw new Error('Expected Sow selection')
  return response
}

const farmSelection = (response: SessionResponse) => {
  const request = waiting(response).request
  if (request.kind !== 'farm-select' || request.farm.farmType !== 'sow') throw new Error('Expected Sow selection')
  return request.farm
}

const startNormalSow = (session: GameSession, reward: RewardCard) => {
  let response = session.takeAction(0, 'grain-utilization')
  for (let step = 0; step < 8 && waiting(response).request.kind !== 'farm-select'; step++) {
    const interaction = waiting(response)
    const request = interaction.request
    if (request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
      continue
    }
    if (request.kind !== 'choice' && request.kind !== 'select-trigger') throw new Error('Expected normal Sow or reward choice')
    const accept = request.options.find((option) => option.labelKey === 'actions.sow.name')
      ?? request.options.find((option) => option.value !== '__skip__' && option.value !== '__done__')
    if (!accept) throw new Error('Expected normal Sow acceptance')
    if (reward === PUBLICAN && interaction.sourceCard === PUBLICAN) expect(interaction.playerIndex).toBe(1)
    response = session.resolveChoice(interaction.playerIndex, accept.value)
  }
  expect(farmSelection(response).maxSelections).toBeUndefined()
  return response
}

const expectNoReward = (response: SessionResponse, reward: RewardCard) => {
  expect(response.state.events.some((event) => event.type === 'resource.moved' && event.sourceCardId === reward)).toBe(false)
  expect(response.state.log.some((entry) => entry.key === 'log.cardTriggered' && entry.params?.cardId === reward)).toBe(false)
  if (reward === PUBLICAN) {
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[1]!.cardStates[PUBLICAN]?.counters?.bonusVp ?? 0).toBe(0)
    expect(response.scores?.[1]?.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
  }
}

describe('A115 Chief Forester limited Sow', () => {
  it('rejects two fields and lets a one-field vegetable Sow finish without Garden Hoe rewards', () => {
    const session = setup()
    const before = startForesterSow(session)
    const rejected = session.commitSelectionChoice(0, { crops: [
      { row: 0, col: 2, crop: 'vegetable' }, { row: 0, col: 3, crop: 'grain' },
    ] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    expect(rejected.scores).toEqual(before.scores)
    const request = waiting(before).request
    if (request.kind !== 'farm-select') throw new Error('Expected Sow selection')
    expect(farmSelection(before).maxSelections).toBe(1)
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'vegetable' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 2, vegetable: 0, clay: 0, stone: 0 })
    expect(response.state.players[0]!.fields).toEqual([
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] }, { row: 0, col: 3, stacks: [] },
    ])
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    expect(response.state.events.some((event) => event.type === 'card.triggered' && event.sourceCardId === HOE)).toBe(false)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(2)
  })
  it.each(REWARDS)('does not trigger %s from the restricted one-field Sow', (reward) => {
    const session = setup(reward)
    const before = startForesterSow(session)
    expect(farmSelection(before).maxSelections).toBe(1)
    expectNoReward(before, reward)
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: reward === HOE ? 'vegetable' : 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject(reward === HOE
      ? { wood: 3, grain: 2, vegetable: 0, clay: 0, stone: 0 }
      : { wood: 3, grain: 1, vegetable: 1, clay: 0, stone: 0 })
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    expectNoReward(response, reward)
    expect(response.scores).toHaveLength(reward === PUBLICAN ? 4 : 2)
  })

  it.each(REWARDS)('keeps %s working when unrestricted Sow plants only one field', (reward) => {
    const session = setup(reward)
    startNormalSow(session, reward)
    let response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: reward === HOE ? 'vegetable' : 'grain' }] })
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[1]!.stacks).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject(reward === HOE
      ? { wood: 0, grain: 2, vegetable: 0, clay: 1, stone: 1 }
      : { wood: 0, grain: 2, vegetable: 1, clay: 0, stone: 0 })
    expect(response.state.events.some((event) => event.type === 'resource.moved' && event.sourceCardId === reward)).toBe(true)
    expect(response.state.log.some((entry) => entry.key === 'log.cardTriggered' && entry.params?.cardId === reward)).toBe(true)
    if (reward === PUBLICAN) {
      expect(response.state.players[1]!.resources.grain).toBe(0)
      expect(response.state.players[1]!.cardStates[PUBLICAN]?.counters?.bonusVp).toBe(1)
      expect(response.scores?.[1]?.categories.find((category) => category.key === 'cardBonusVp')?.total).toBe(1)
    }
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it.each(REWARDS)('can decline the optional Sow without triggering %s', (reward) => {
    const session = setup(reward)
    let response = session.takeAction(0, 'forest')
    const request = waiting(response).request
    if (request.kind !== 'choice' && request.kind !== 'select-trigger') throw new Error('Expected optional Sow')
    expect(request.options.some((option) => option.value === '__skip__')).toBe(true)
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 2, vegetable: 1 })
    expect(response.state.players[0]!.fields.every((field) => field.stacks.length === 0)).toBe(true)
    expectNoReward(response, reward)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it('counts both slots on Wood Field as one Logical Field and rejects mixing it with another field', () => {
    const session = setup(PELLETS, (state) => {
      const player = state.players[0]!
      player.minorPlayed.push(WOOD_FIELD)
      player.cardStates[WOOD_FIELD] = { extraData: { cardFieldStacks: [null, null] } }
      Object.assign(player.resources, { wood: 2, grain: 1, vegetable: 0 })
    })
    const before = startForesterSow(session)
    const cardSlots = farmSelection(before).selectableFields.filter((field) => field.sourceCard === WOOD_FIELD)
    expect(cardSlots).toHaveLength(2)
    expect(cardSlots.map((field) => field.groupKey)).toEqual([WOOD_FIELD, WOOD_FIELD])
    const crops = cardSlots.map((field) => ({ ...field.tile, crop: 'wood' as const }))
    const rejected = session.commitSelectionChoice(0, { crops: [...crops, { row: 0, col: 2, crop: 'grain' }] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    const response = session.commitSelectionChoice(0, { crops })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[WOOD_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 3 },
    ])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 1 })
    expectNoReward(response, PELLETS)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it('rejects insufficient seeds across two slots of the same Logical Field', () => {
    const session = setup(PELLETS, (state) => {
      const player = state.players[0]!
      player.minorPlayed.push(WOOD_FIELD)
      player.fields = []
      player.cardStates[WOOD_FIELD] = { extraData: { cardFieldStacks: [null, null] } }
      Object.assign(player.resources, { wood: 1, grain: 0, vegetable: 0 })
    })
    const before = startForesterSow(session)
    const cardSlots = farmSelection(before).selectableFields.filter((field) => field.sourceCard === WOOD_FIELD)
    const rejected = session.commitSelectionChoice(0, { crops: cardSlots.map((field) => ({ ...field.tile, crop: 'wood' })) })
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('NOT_ENOUGH_SEEDS')
    expect(rejected.state).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    const response = session.commitSelectionChoice(0, { crops: [{ ...cardSlots[0]!.tile, crop: 'wood' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.cardStates[WOOD_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 3 }, null,
    ])
  })

  it.each(['no-seeds', 'no-fields', 'opponent-forester'] as const)('collects normally without a Sow when %s', (control) => {
    const session = setup(PELLETS, (state) => {
      const player = state.players[0]!
      if (control === 'no-seeds') Object.assign(player.resources, { grain: 0, vegetable: 0 })
      if (control === 'no-fields') player.fields = []
      if (control === 'opponent-forester') {
        player.occupationPlayed = []
        state.players[1]!.occupationPlayed = [FORESTER]
      }
    })
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.events.some((event) => event.type === 'farm.sown')).toBe(false)
    expectNoReward(response, PELLETS)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it.each([PELLETS, HOE] as const)("does not reward an opponent holding %s for the active player's ordinary Sow", (reward) => {
    const session = setup(reward, (state) => {
      state.players[0]!.minorPlayed = []
      state.players[1]!.minorPlayed = [reward]
    })
    startNormalSow(session, reward)
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: reward === HOE ? 'vegetable' : 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject(reward === HOE
      ? { grain: 2, vegetable: 0, clay: 0, stone: 0 }
      : { grain: 1, vegetable: 1, clay: 0, stone: 0 })
    expect(response.state.players[1]!.resources).toMatchObject({ grain: 0, clay: 0, stone: 0 })
    expectNoReward(response, reward)
  })

  it("does not let Publican reward its owner's ordinary Sow", () => {
    const session = setup(PUBLICAN, (state) => {
      state.players[0]!.occupationPlayed.push(PUBLICAN)
      state.players[1]!.occupationPlayed = []
    })
    startNormalSow(session, PUBLICAN)
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.cardStates[PUBLICAN]?.counters?.bonusVp ?? 0).toBe(0)
    expectNoReward(response, PUBLICAN)
  })

  it('restores the restricted selection and collected wood through undo and a legal retry', () => {
    const session = setup(PELLETS)
    startForesterSow(session)
    let response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 1 })
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 2 })
    expect(farmSelection(response).maxSelections).toBe(1)
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 3, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 1 })
    expectNoReward(response, PELLETS)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 2 })
    expect(response.state.players[0]!.fields.every((field) => field.stacks.length === 0)).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toHaveLength(0)
  })

})

describe("A115 command boundaries", () => {
  const FORESTER = 'A115_ChiefForester'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup(configure: (state: GameState) => void = () => {
  }, played = true) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        state.players[0]!.occupationPlayed = played ? [FORESTER] : []
        state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [FORESTER]
        state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
        state.players[0]!.resources.grain = 2
        configure(state)
      } }))
    return s
  }
  function turn(s: GameSession, actor: number, space: string) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, actor)
    return ok(s.takeAction(actor, space))
  }
  function sow(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 5 && r.interaction.stateId === 'wait' && r.interaction.request.kind !== 'farm-select'; n++) {
      const i = r.interaction
      assert.ok(i.request.kind === 'choice' || i.request.kind === 'select-trigger')
      const o = getChoiceOptions({ interaction: i }).find(o => o.value !== '__skip__' && o.value !== '__done__')
      assert.ok(o)
      r = ok(s.resolveChoice(0, o.value))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'sow')
    return r
  }
  it("wood accumulation permits exactly one chosen ordinary grain field before collection", () => {
    const s = setup()
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    const pending = sow(s, turn(s, 0, 'forest'))
    assert.equal(pending.state.players[0]!.resources.wood, 0)
    const submitted = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }, { row: 0, col: 2, crop: 'grain' }] }))
    const actual = { ok: submitted.ok, grain: submitted.state.players[0]!.resources.grain, wood: submitted.state.players[0]!.resources.wood, stacks: submitted.state.players[0]!.fields.map(f => f.stacks) }
    sessionEvidence.record('A115-N1-two-fields', { pending, submitted, actual })
    assert.deepEqual(actual, { ok: false, grain: 2, wood: 0, stacks: [[], []] })
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    sow(s, turn(s, 0, 'forest'))
    const r = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] }))
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(r.state.players[0]!.resources.wood, 3)
    assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks), [[], [{ kind: 'grain', remaining: 3 }]])

    sessionEvidence.record('A115-N1', { pending, r })
  })
  it("decline keeps seeds and no seed cannot sow a field", () => {
    const s = setup()
    let r = turn(s, 0, 'forest')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    const o = getChoiceOptions(r).find(o => o.value === '__skip__')
    assert.ok(o)
    r = ok(s.resolveChoice(0, o.value))
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.grain, 2)
    assert.equal(r.state.players[0]!.resources.wood, 3)
    const zero = turn(setup(state => state.players[0]!.resources.grain = 0), 0, 'forest')
    assert.ok(zero.interaction.stateId === 'wait')
    assert.deepEqual(zero.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(zero.interaction.playerIndex, 0)
    assert.equal(zero.state.currentPlayerIndex, 0)
    assert.equal(zero.state.players[0]!.resources.wood, 3)
    assert.deepEqual(zero.state.players[0]!.fields.map(f => f.stacks), [[], []])

    sessionEvidence.record('A115-N2', { r, zero })
  })
  it("nonwood hand and actual opponent collection cannot offer owner restricted sow", () => {
    const clay = turn(setup(), 0, 'clay-pit')
    assert.ok(clay.interaction.stateId === 'wait')
    assert.deepEqual(clay.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(clay.interaction.playerIndex, 0)
    assert.equal(clay.state.currentPlayerIndex, 0)
    assert.equal(clay.state.players[0]!.resources.grain, 2)
    const hand = turn(setup(undefined, false), 0, 'forest')
    assert.ok(hand.interaction.stateId === 'wait')
    assert.deepEqual(hand.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(hand.interaction.playerIndex, 0)
    assert.equal(hand.state.currentPlayerIndex, 0)
    assert.equal(hand.state.players[0]!.resources.grain, 2)
    const s = setup()
    turn(s, 0, 'day-laborer')
    const other = turn(s, 1, 'forest')
    assert.ok(other.interaction.stateId === 'wait')
    assert.deepEqual(other.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 })
    assert.equal(other.interaction.playerIndex, 1)
    assert.equal(other.state.currentPlayerIndex, 1)
    assert.equal(other.state.players[0]!.resources.grain, 2)
    assert.deepEqual(other.state.players[0]!.fields.map(f => f.stacks), [[], []])

    sessionEvidence.record('A115-N3', { clay, hand, other })
  })
  it("occupied farm tile invalid target and wrong actor reject then one valid sow", () => {
    const s = setup(state => state.players[0]!.fields[0]!.stacks = [{ kind: 'grain', remaining: 2 }])
    sow(s, turn(s, 0, 'forest'))
    for (const crop of [{ row: 99, col: 99, crop: 'grain' }, { row: 0, col: 1, crop: 'grain' }, { row: 0, col: 2, crop: 'vegetable' }] as const)
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [crop] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { crops: [{ row: 0, col: 2, crop: 'grain' }] }))
    const r = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] }))
    assert.ok(r.interaction.stateId === 'wait')
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.deepEqual(r.state.players[0]!.fields[0]!.stacks, [{ kind: 'grain', remaining: 2 }])

    sessionEvidence.record('A115-N4', r)
  })
  it("whole sow action undo restores seeds fields and source before one retry", () => {
    const s = setup()
    const observedBeforeUndo = s.getState()
    const beforeUndo = {
      ...observedBeforeUndo,
      state: captureStateWithHistory(observedBeforeUndo.state),
      interaction: structuredClone(observedBeforeUndo.interaction),
      scores: structuredClone(observedBeforeUndo.scores),
    }
    const beforeRules = undoRuleSnapshot(beforeUndo)
    sow(s, turn(s, 0, 'forest'))
    const first = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
    assert.ok(first.interaction.stateId === 'wait')
    assert.deepEqual(first.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(first.interaction.playerIndex, 0)
    assert.equal(first.state.currentPlayerIndex, 0)
    assert.equal(first.state.players[0]!.resources.grain, 1)
    assert.equal(first.state.players[0]!.resources.wood, 3)
    assert.deepEqual(first.state.players[0]!.fields.map(field => field.stacks), [[{ kind: 'grain', remaining: 3 }], []])
    const undone = ok(s.undoAction())
    assertUndoRestored(beforeRules, undone)
    const liveAfterUndo = s.getState()
    assertUndoRestored(beforeRules, liveAfterUndo)
    assert.deepEqual(liveAfterUndo.interaction, beforeUndo.interaction)
    assert.equal(liveAfterUndo.state.currentPlayerIndex, 0)
    assert.deepEqual(undone.interaction, beforeUndo.interaction)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(undone.state.players[0]!.resources.grain, 2)
    assert.equal(undone.state.players[0]!.resources.wood, 0)
    assert.deepEqual(undone.state.players[0]!.fields.map(f => f.stacks), [[], []])
    sow(s, turn(s, 0, 'forest'))
    const retry = ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] }))
    assert.ok(retry.interaction.stateId === 'wait')
    assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
    assert.equal(retry.state.players[0]!.resources.grain, 1)
    assert.equal(retry.state.players[0]!.resources.wood, 3)

    sessionEvidence.record('A115-N5', { first, undone, retry })
  })
})
