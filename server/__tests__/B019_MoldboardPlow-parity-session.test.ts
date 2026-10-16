import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B019_MoldboardPlow'
import assert from 'node:assert/strict'
import { type FarmTilePosition, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectTileFarmSelection, expectFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'B019_MoldboardPlow'

const setup = (stack: string[] = ['field', 'field']) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 19, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 3
  const player = state.players[0]!
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  player.minorPlayed = [CARD_ID]
  player.cardStates = { ...player.cardStates, [CARD_ID]: { stack } }
  session.loadState(state)
  return session
}

const normalPlow = (session: GameSession) => {
  let response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || expectFarmSelection(response).farmType !== 'plow') {
    throw new Error('expected field selection')
  }
  response = session.commitSelectionChoice(0, {
    tile: expectTileFarmSelection(response, 'plow').selectableTiles[0]!,
  })
  return response
}

describe('B019 Moldboard Plow parity', () => {
  it('B019 S1: playing Moldboard Plow stores two field tiles on the card', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 19, options: { playerCount: 2 } }))
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 3
    state.availableMajorImprovements = []
    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    player.occupationPlayed = ['__test_occupation__']
    player.resources.wood = 2
    session.loadState(state)

    const response = session.takeAction(0, 'major-improvement')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(['field', 'field'])
  })

  it('B019 S2: accepting the Farmland bonus plows one extra field and consumes one tile', () => {
    const session = setup()
    let response = normalPlow(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const accept = getChoiceOptions(response)?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || expectFarmSelection(response).farmType !== 'plow')
      throw new Error('Expected bonus plow selection')
    response = session.commitSelectionChoice(0, {
      tile: expectTileFarmSelection(response, 'plow').selectableTiles[0]!,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(2)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toHaveLength(1)
  })

  it('B019 S3: declining the Farmland bonus preserves both stored fields', () => {
    const session = setup()
    let response = normalPlow(session)

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toHaveLength(2)
  })

  it('B019 S4: an empty Moldboard Plow no longer offers an extra field', () => {
    const response = normalPlow(setup([]))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
      .toBe('confirm-next-player')
  })
})
describe("B019 command boundaries", () => {
  const WHEEL = 'A018_WheelPlow'
  const MOLD = 'B019_MoldboardPlow'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function setup({ card = WHEEL, round = 1, played = true, occupations = 2, resources = {}, freePlots, existingField = false }: {
    card?: string
    round?: number
    played?: boolean
    occupations?: number
    resources?: Partial<PlayerState['resources']>
    freePlots?: 1 | 2
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
        if (freePlots !== undefined) {
          p.fields = []
          for (let row = 0; row < 3; row++)
            for (let col = 0; col < 5; col++) {
              if (p.roomTiles.some(t => t.row === row && t.col === col) || (row === 0 && col >= 5 - freePlots))
                continue
              p.fields.push({ row, col, stacks: [] })
            }
          assert.equal(p.fields.length, 13 - freePlots)
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
  function stack(r: SessionResponse) { return r.state.players[0]!.cardStates[MOLD]?.stack?.length ?? 0; }
  function finished(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); }

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
  it("real purchase validates fee prerequisite and two stored tiles", () => {
    blockedPurchase(MOLD, { occupations: 0, resources: { wood: 2 } })
    blockedPurchase(MOLD, { occupations: 1, resources: { wood: 1 } })
    const s = setup({ card: MOLD, played: false, occupations: 1, resources: { wood: 2 } })
    const r = play(s, MOLD)
    assert.ok(r.state.players[0]!.minorPlayed.includes(MOLD))
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(stack(r), 2)
  })
  it("decline invalid selection and undo preserve the stored field allowance", () => {
    const declined = setup({ card: MOLD })
    const no = skip(declined, plow(declined, turn(declined, 0, 'farmland')))
    assert.equal(fields(no), 1)
    assert.equal(stack(no), 2)
    finished(no)
    const s = setup({ card: MOLD, existingField: true })
    const before = undoRuleSnapshot(s.getState())
    let r = plow(s, turn(s, 0, 'farmland'), { row: 0, col: 2 })
    farm(s, r)
    invalidBonus(s)
    assert.equal(stack(s.getState()), 2)
    r = plow(s, s.getState(), { row: 0, col: 3 })
    assert.equal(fields(r), 3)
    assert.equal(stack(r), 1)
    finished(r)
    assertUndoRestored(before, s.undoAction())
    r = plow(s, turn(s, 0, 'farmland'))
    r = plow(s, r)
    assert.equal(fields(r), 3)
    assert.equal(stack(r), 1)
  })
  it("Cultivation and opponent Farmland cannot consume owner field tiles", () => {
    const s = setup({ card: MOLD, round: 14 })
    let r = plow(s, turn(s, 0, 'cultivation'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      r = skip(s, r)
    assert.equal(fields(r), 1)
    assert.equal(stack(r), 2)
    finished(r)
    r = plow(s, turn(s, 1, 'farmland'))
    assert.equal(r.state.players[1]!.fields.length, 1)
    assert.equal(stack(r), 2)
    finished(r)
  })
  it("last normal field preserves both declined bonus tiles", () => {
    const s = setup({ card: MOLD, freePlots: 1 })
    const r = plow(s, turn(s, 0, 'farmland'), { row: 0, col: 4 })
    finished(r)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, MOLD))
    assert.equal(fields(r), 13)
    assert.equal(stack(r), 2)
    finished(r)
  })
  it("normal Farmland plow uses the final plot and preserves both stored fields", () => {
    const s = setup({ card: MOLD, freePlots: 1 })
    const normal = turn(s, 0, 'farmland')
    assert.ok(normal.interaction.stateId === 'wait' && normal.interaction.request.kind === 'farm-select')
    assert.equal(expectFarmSelection(normal).farmType, 'plow')
    assert.equal(fields(normal), 12)
    assert.notEqual(normal.interaction.stateId === 'wait' ? normal.interaction.sourceCard : undefined, MOLD)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, MOLD))
    const r = plow(s, normal, { row: 0, col: 4 })
    finished(r)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, MOLD))
    assert.equal(fields(r), 13)
    assert.equal(stack(r), 2)
    finished(r)
  })
  it("bonus after normal Farmland uses the final remaining plot and one stored field", () => {
    const s = setup({ card: MOLD, freePlots: 2 })
    const normal = turn(s, 0, 'farmland')
    assert.ok(normal.interaction.stateId === 'wait' && normal.interaction.request.kind === 'farm-select')
    assert.notEqual(normal.interaction.sourceCard, MOLD)
    assert.equal(fields(normal), 11)
    const afterNormal = ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 4 } }))
    assert.equal(fields(afterNormal), 12)
    assert.equal(stack(afterNormal), 2)
    assert.ok(afterNormal.interaction.stateId === 'wait' && afterNormal.interaction.request.kind === 'select-trigger')
    assert.equal(getChoiceOptions(afterNormal).filter(option => option.value === MOLD && !option.disabled).length, 1)
    const offered = ok(s.resolveChoice(0, MOLD))
    assert.ok(offered.interaction.stateId === 'wait' && offered.interaction.request.kind === 'choice')
    assert.equal(offered.interaction.sourceCard, MOLD)
    const accepted = getChoiceOptions(offered).filter(option => option.value !== '__skip__' && !option.disabled)
    assert.equal(accepted.length, 1)
    const option = accepted[0]
    assert.ok(option)
    const bonus = ok(s.resolveChoice(0, option.value))
    assert.ok(bonus.interaction.stateId === 'wait' && bonus.interaction.request.kind === 'farm-select')
    assert.equal(bonus.interaction.sourceCard, MOLD)
    assert.equal(expectFarmSelection(bonus).farmType, 'plow')
    assert.deepEqual(expectTileFarmSelection(bonus, 'plow').selectableTiles, [{ row: 0, col: 3 }])
    const done = ok(s.commitSelectionChoice(0, { tile: { row: 0, col: 3 } }))
    assert.equal(fields(done), 13)
    assert.equal(new Set(done.state.players[0]!.fields.map(tile => `${tile.row},${tile.col}`)).size, 13)
    assert.equal(stack(done), 1)
    finished(done)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, MOLD))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 0, col: 3 } }))
  })

})
