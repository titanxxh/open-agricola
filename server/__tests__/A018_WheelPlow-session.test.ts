import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent, expectWait } from './_helpers/trigger-select'
import { commitFirstPlow, setupSowingSession, sowOptions } from './_helpers/batch07-sowing'

import '../../shared/cards/A/A018_WheelPlow'
import assert from 'node:assert/strict'
import { type FarmTilePosition, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectTileFarmSelection, expectFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A018_WheelPlow'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

const setup = ({ played = true } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7018, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = []; })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    player.fields = []
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.occupationPlayed = OCCUPATIONS
  owner.resources.wood = 2
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === CARD_ID)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, next.value)
  }
  return response
}

const acceptWheelPlow = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let guard = 0; guard < 6; guard += 1) {
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind === 'farm-select') return response
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, accept!.value)
  }
  return response
}

const commitPlow = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return response
  return session.commitSelectionChoice(expectWait(response).interaction.playerIndex, { tile: expectTileFarmSelection(response, 'plow').selectableTiles[0]! })
}

describe('A018 Wheel Plow parity', () => {
  it('A018 S1: two occupations and two wood allow Wheel Plow to be played', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A018 S2: first-person Farmland plows its normal field before two additional fields in OA', () => {
    const session = setup()
    let response = commitPlow(session, session.takeAction(0, 'farmland'))
    response = acceptWheelPlow(session, response)
    response = commitPlow(session, response)
    response = acceptWheelPlow(session, response)
    response = commitPlow(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('A018 S3: declining the first-person bonus consumes Wheel Plow but keeps the normal plow', () => {
    const session = setup()
    let response = commitPlow(session, session.takeAction(0, 'farmland'))
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    while (response.interaction.stateId === 'wait'
      && !options(response).some((option) => option.value === '__skip__')) {
      const confirm = options(response)[0]
      expect(confirm).toBeDefined()
      response = session.resolveChoice(expectWait(response).interaction.playerIndex, confirm!.value)
      response = resolveTriggerIfPresent(session, response, CARD_ID)
    }
    expect(options(response).map((option) => option.value)).toContain('__skip__')
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, '__skip__')

    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('A018 S4: Farmland used by the second person does not trigger Wheel Plow', () => {
    const session = setup()
    let response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    session.loadState(state)

    response = session.takeAction(0, 'farmland')

    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBeFalsy()
  })

  it('A018 S5: Cultivation bonus fields participate in the same sow action', () => {
    const session = sessionEvidence.track(setupSowingSession({ cardId: CARD_ID, grain: 3 }))
    session.state.players[0]!.occupationPlayed = OCCUPATIONS
    session.loadState(session.state)

    let response = commitFirstPlow(session, session.takeAction(0, 'cultivation'))
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    const accept = sowOptions(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait' ? expectWait(response).interaction.playerIndex : 0, accept!.value)
    response = commitFirstPlow(session, response)
    const second = sowOptions(response).find((option) => option.value !== '__skip__')
    expect(second, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait' ? expectWait(response).interaction.playerIndex : 0, second!.value)
    response = commitFirstPlow(session, response)

    expect(response.state.players[0]!.fields).toHaveLength(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    const sowOption = sowOptions(response).find((option) =>
      option.value === 'sow' || option.labelKey === 'actions.sow.name')
    expect(sowOption, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait' ? expectWait(response).interaction.playerIndex : 0, sowOption!.value)
    const fields = response.state.players[0]!.fields
    response = session.commitSelectionChoice(0, {
      crops: fields.map(({ row, col }) => ({ row, col, crop: 'grain' as const })),
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.map((field) => field.stacks[0]?.remaining)).toEqual([3, 3, 3])
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})
describe("A018 command boundaries", () => {
  const WHEEL = 'A018_WheelPlow'
  const MOLD = 'B019_MoldboardPlow'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function setup({ card = WHEEL, round = 1, played = true, occupations = 2, resources = {}, lastPlot = false, existingField = false }: {
    card?: string
    round?: number
    played?: boolean
    occupations?: number
    resources?: Partial<PlayerState['resources']>
    lastPlot?: boolean
    existingField?: boolean
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 42, configure: state => {
        state.round = round
        for (const p of state.players)
          p.resources.food = 40
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [card]
        p.minorPlayed = played ? [card] : []
        p.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist'].slice(0, occupations)
        if (played && card === MOLD)
          p.cardStates[card] = { stack: ['field', 'field'] }
        Object.assign(p.resources, resources)
        if (existingField)
          p.fields = [{ row: 0, col: 1, stacks: [] }]
        if (lastPlot) {
          p.fields = []
          for (let row = 0; row < 3; row++)
            for (let col = 0; col < 5; col++) {
              if (p.roomTiles.some(t => t.row === row && t.col === col) || (row === 0 && col === 4))
                continue
              p.fields.push({ row, col, stacks: [] })
            }
          assert.equal(p.fields.length, 12)
        }
      } }))
    assert.equal(s.getState().interaction.stateId, 'idle')
    return s
  }
  function choice(s: GameSession, r: SessionResponse, pred: (o: {
    value: string
    labelKey?: string
  }) => boolean) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    const o = getChoiceOptions(r).find(pred)
    assert.ok(o, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(expectWait(r).interaction.playerIndex, o.value))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)); }
  function play(s: GameSession, card: string) {
    let r = turn(s, 0, 'meeting-place')
    for (let n = 0; n < 6 && r.state.players[0]!.minorHand.includes(card) && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice'; n++) {
      const o = getChoiceOptions(r).find(o => o.value === card || o.value.startsWith('action-improvement-'))
      if (!o)
        break
      r = ok(s.resolveChoice(0, o.value))
    }
    return r
  }
  function farm(s: GameSession, r: SessionResponse) {
    for (let n = 0; n < 6 && r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'); n++)
      r = choice(s, r, o => o.value !== '__skip__' && o.value !== '__pass__')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
    assert.ok(expectFarmSelection(r).farmType === 'plow')
    return r
  }
  function plow(s: GameSession, r: SessionResponse, tile?: FarmTilePosition) {
    r = farm(s, r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && expectFarmSelection(r).farmType === 'plow')
    const target = tile ?? expectTileFarmSelection(r, 'plow').selectableTiles[0]!
    return ok(s.commitSelectionChoice(expectWait(r).interaction.playerIndex, { tile: target }))
  }
  function skip(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger')
      r = choice(s, r, o => o.value !== '__pass__')
    return choice(s, r, o => o.value === '__skip__')
  }
  function fields(r: SessionResponse) { return r.state.players[0]!.fields.length; }
  function finished(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); }
  function endRound(s: GameSession, ownerSpace = 'day-laborer') {
    turn(s, 1, 'forest')
    turn(s, 0, ownerSpace)
    const r = confirmNext(s, turn(s, 1, 'clay-pit'))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    return r
  }
  function invalidBonus(s: GameSession) {
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 2, col: 4 } }))
  }
  function blockedPurchase(card: string, options: {
    occupations?: number
    resources?: Partial<PlayerState['resources']>
    round?: number
  }) {
    const s = setup({ card, played: false, ...options })
    const before = { ...s.state.players[0]!.resources }
    const r = play(s, card)
    assert.ok(r.state.players[0]!.minorHand.includes(card))
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assert.deepEqual(r.state.players[0]!.resources, before)
    assert.equal(fields(r), 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    return r
  }
  it("real purchase enforces wood and two occupation prerequisites", () => {
    blockedPurchase(WHEEL, { occupations: 1, resources: { wood: 2 } })
    blockedPurchase(WHEEL, { resources: { wood: 1 } })
    const r = play(setup({ played: false, resources: { wood: 2 } }), WHEEL)
    assert.ok(r.state.players[0]!.minorPlayed.includes(WHEEL))
    assert.equal(r.state.players[0]!.resources.wood, 0)
  })
  it("first person bonus rejects invalid geometry and undo restores once allowance", () => {
    const s = setup()
    let r = plow(s, turn(s, 0, 'farmland'), { row: 0, col: 1 })
    farm(s, r)
    invalidBonus(s)
    r = plow(s, s.getState(), { row: 0, col: 2 })
    r = plow(s, r, { row: 0, col: 3 })
    assert.equal(fields(r), 3)
    assert.equal(r.state.players[0]!.cardStates[WHEEL]?.flagged, true)
    finished(r)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 0, col: 4 } }))
    const original = setup()
    const before = undoRuleSnapshot(original.getState())
    let done = plow(original, turn(original, 0, 'farmland'))
    done = plow(original, done)
    done = plow(original, done)
    assert.equal(fields(done), 3)
    assertUndoRestored(before, original.undoAction())
    done = plow(original, turn(original, 0, 'farmland'))
    done = plow(original, done)
    done = plow(original, done)
    assert.equal(fields(done), 3)
    endRound(original)
    const later = plow(original, turn(original, 0, 'farmland'))
    assert.equal(fields(later), 4)
    finished(later)
  })
  it("second person and opponent Farmland cannot grant owner bonus", () => {
    const s = setup()
    turn(s, 0, 'grain-seeds')
    let r = turn(s, 1, 'farmland')
    r = plow(s, r)
    assert.equal(r.state.players[1]!.fields.length, 1)
    turn(s, 0, 'day-laborer')
    const next = confirmNext(s, turn(s, 1, 'forest'))
    assert.equal(next.state.round, 2)
    turn(s, 0, 'grain-seeds')
    turn(s, 1, 'forest')
    r = plow(s, turn(s, 0, 'farmland'))
    assert.equal(fields(r), 1)
    assert.ok(!r.state.players[0]!.cardStates[WHEEL]?.flagged)
    finished(r)
  })
  it("Cultivation bonus fields belong to the same sow action", () => {
    const s = setup({ round: 14, resources: { grain: 3 } })
    let r = plow(s, turn(s, 0, 'cultivation'))
    r = plow(s, r)
    r = plow(s, r)
    assert.equal(fields(r), 3)
    r = choice(s, r, o => o.value === 'sow' || o.labelKey === 'actions.sow.name')
    r = ok(s.commitSelectionChoice(0, { crops: r.state.players[0]!.fields.map(({ row, col }) => ({ row, col, crop: 'grain' })) }))
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks[0]?.remaining), [3, 3, 3])
    finished(r)
  })
  it("decline consumption is recorded without deciding the optional allowance rule", () => {
    const s = setup()
    let r = plow(s, turn(s, 0, 'farmland'))
    r = skip(s, r)
    assert.equal(fields(r), 1)
    finished(r)
    assert.equal(r.state.players[0]!.cardStates[WHEEL]?.flagged, true)
    endRound(s)
    r = plow(s, turn(s, 0, 'farmland'))
    assert.equal(fields(r), 2)
    finished(r)
  })
  it("last free farm tile cannot create phantom bonus fields", () => {
    const s = setup({ lastPlot: true })
    const r = plow(s, turn(s, 0, 'farmland'), { row: 0, col: 4 })
    assert.equal(fields(r), 13)
    finished(r)
  })
  it("final plot bonus-first and normal-first paths complete without phantom fields", () => {
    const s = setup({ lastPlot: true })
    const normal = turn(s, 0, 'farmland')
    assert.notEqual(normal.interaction.stateId === 'wait' ? normal.interaction.sourceCard : undefined, WHEEL)
    const r = plow(s, normal, { row: 0, col: 4 })
    assert.equal(fields(r), 13)
    assert.equal(r.state.players[0]!.cardStates[WHEEL]?.flagged, true)
    finished(r)
  })
})
