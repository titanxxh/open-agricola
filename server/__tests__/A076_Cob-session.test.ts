import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A076_Cob'
import assert from 'node:assert/strict'
import { type GameState, type Resource, type ActionChoiceOption } from '../../shared/contract/types'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A076_Cob'
const FILLER = '__test_placeholder__'

const setup = ({ clay = 0, grain = 0, food = 0, played = true } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5076, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources = { ...player.resources, clay, grain, food }
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (getChoiceOptions(response)?.some((option) => option.value === CARD_ID)) return response
  const improvement = getChoiceOptions(response)?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playCob = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const roundStart = (session: GameSession): SessionResponse => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  let response = session.performRoundEnd()
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  return response
}

describe('A076 Cob parity', () => {
  it('A076 S1: Cob costs one food to play', () => {
    const response = playCob(setup({ food: 1, played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A076 S2: at work phase start Cob may exchange exactly one grain for two clay and one food', () => {
    const session = setup({ clay: 1, grain: 2, food: 20 })
    let response = roundStart(session)
    response = resolveNonSkipChoice(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 3, food: 21 })
  })

  it('A076 S3: the Cob exchange can be declined', () => {
    const session = setup({ clay: 1, grain: 1, food: 20 })
    let response = roundStart(session)
    response = resolveSkipChoice(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, clay: 1, food: 20 })
  })

  it('A076 S4: no clay excludes Cob from the work-start window', () => {
    const clay = 0
    const grain = 1
    const response = roundStart(setup({ clay, grain, food: 20 }))

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay, grain, food: 20 })
  })

  it('A076 S5: clay without payable grain leaves resources unchanged at work start', () => {
    const session = setup({ clay: 1, grain: 0, food: 20 })
    const state = session.getState().state
    state.players.forEach(player => markAllWorkersUsed(state, player))
    session.loadState(state)
    const response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('idle')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, grain: 0, food: 20 })
    expect(response.state.roundPhase).toBe('work')
  })
})

describe("A076 command boundaries", () => {
  const COB = 'A076_Cob'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function record(label: string, response: SessionResponse) {
    sessionEvidence.record(label, response)
    return response
  }
  function setup({ round = 5, played = false, resources = {} }: {
    round?: number
    played?: boolean
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
          assert.equal(p.workers.length, 5)
          assert.equal(p.workers.filter(w => w.isActive).length, 2)
        }
        const p = state.players[0]!
        p.minorHand = played ? ['B007_Wage', '__test_placeholder__'] : [COB, 'B007_Wage', 'A016_RammedClay']
        p.minorPlayed = played ? [COB] : []
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    record('fixture', s.getState())
    return s
  }
  function options(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: ActionChoiceOption) => boolean) {
    const candidates = options(r).filter(o => !o.disabled && predicate(o))
    assert.equal(candidates.length, 1, JSON.stringify(r.interaction))
    const o = candidates[0]!
    assert.ok(r.interaction.stateId === 'wait')
    return record(`resolveChoice:${o.value}`, ok(s.resolveChoice(r.interaction.playerIndex, o.value)))
  }
  function buyMenu(s: GameSession) {
    let r = record('takeAction:meeting-place', ok(s.takeAction(0, 'meeting-place')))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = buyMenu(s)
    if (r.state.players[0]!.minorPlayed.includes(card))
      return r
    assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    return record(`buy:${card}`, ok(s.resolveChoice(0, card)))
  }
  function deny(s: GameSession, card: string) {
    let r = buyMenu(s)
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    record(`denied:${card}`, assertRejectedUnchanged(s, () => s.resolveChoice(0, card)))
    const food = r.state.players[0]!.resources.food
    r = ok(s.resolveChoice(0, 'B007_Wage'))
    assert.equal(r.state.players[0]!.resources.food - food, 2)
    return r
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = record('confirm', confirmNext(s, r))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return record(`takeAction:${actor}:${space}`, ok(s.takeAction(actor, space)))
  }
  function complete(s: GameSession, partial = false) {
    if (!partial)
      turn(s, 0, 'reed-bank')
    turn(s, 1, 'forest')
    turn(s, 0, 'day-laborer')
    return record('round-confirm', confirmNext(s, turn(s, 1, 'clay-pit')))
  }
  function resources(r: SessionResponse) {
    const p = r.state.players[0]!.resources
    return { clay: p.clay, grain: p.grain, food: p.food }
  }
  function exchange(s: GameSession, r: SessionResponse, accept = true) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger')
      r = choose(s, r, o => o.sourceCard === COB)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    assert.equal(r.interaction.sourceCard, COB)
    assert.equal(r.interaction.promptKey, 'ui.interactionCob')
    return choose(s, r, o => accept ? o.value !== '__skip__' && !('disabled' in o && o.disabled) : o.value === '__skip__')
  }
  it("one food purchase has no immediate exchange and zero food rejects", () => {
    deny(setup({ resources: { food: 0, clay: 1, grain: 2 } }), COB)
    const r = buy(setup({ resources: { food: 1, clay: 1, grain: 2 } }), COB)
    assert.deepEqual(resources(r), { clay: 1, grain: 2, food: 0 })
  })
  it("natural work phase accepts exactly one grain and cannot repeat in same phase", () => {
    const s = setup({ played: true, resources: { clay: 1, grain: 2 } })
    const offer = complete(s)
    const acceptedValue = options(offer).find(o => o.value !== '__skip__' && !('disabled' in o && o.disabled))?.value
    assert.ok(acceptedValue)
    let r = exchange(s, offer)
    assert.equal(r.state.round, 6)
    assert.deepEqual(resources(r), { clay: 3, grain: 1, food: 43 })
    record('stale-cob', assertRejectedUnchanged(s, () => s.resolveChoice(0, acceptedValue)))
    r = turn(s, 0, 'reed-bank')
    assert.deepEqual(resources(r), { clay: 3, grain: 1, food: 43 })
  })
  it("decline preserves crops and clay and next phase offers once again", () => {
    const s = setup({ played: true, resources: { clay: 1, grain: 2 } })
    let r = exchange(s, complete(s), false)
    assert.deepEqual(resources(r), { clay: 1, grain: 2, food: 42 })
    r = exchange(s, complete(s))
    assert.equal(r.state.round, 7)
    assert.deepEqual(resources(r), { clay: 3, grain: 1, food: 45 })
  })
  it("zero clay cannot exchange despite grain and opponent clay", () => {
    const s = setup({ played: true, resources: { clay: 0, grain: 1 } }, state => {
      state.players[1]!.resources.clay = 3
    })
    const r = complete(s)
    assert.equal(r.interaction.stateId, 'idle')
    assert.deepEqual(resources(r), { clay: 0, grain: 1, food: 42 })
    record('no-clay', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'pay-gain')))
  })
  it("zero grain cannot exchange despite clay and opponent grain", () => {
    const s = setup({ played: true, resources: { clay: 1, grain: 0 } }, state => {
      state.players[1]!.resources.grain = 3
    })
    const r = complete(s)
    assert.equal(r.interaction.stateId, 'idle')
    assert.deepEqual(resources(r), { clay: 1, grain: 0, food: 42 })
    record('no-grain', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'pay-gain')))
  })
  it("exact last grain exchange leaves no grain and never spends prerequisite clay", () => {
    const s = setup({ played: true, resources: { clay: 1, grain: 1 } })
    const r = exchange(s, complete(s))
    assert.deepEqual(resources(r), { clay: 3, grain: 0, food: 43 })
  })
  it("unplayed card never exchanges during a natural work phase", () => {
    const s = setup({ resources: { clay: 1, grain: 1 } })
    const r = complete(s)
    assert.equal(r.interaction.stateId, 'idle')
    assert.deepEqual(resources(r), { clay: 1, grain: 1, food: 42 })
  })
  it("gaining clay during work waits until the next natural work phase", () => {
    const s = setup({ played: true, resources: { grain: 1 } })
    let r = turn(s, 0, 'clay-pit')
    assert.equal(r.state.players[0]!.resources.clay, 1)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    turn(s, 1, 'forest')
    turn(s, 0, 'day-laborer')
    r = record('midwork-clay-confirm', confirmNext(s, turn(s, 1, 'reed-bank')))
    r = exchange(s, r)
    assert.deepEqual(resources(r), { clay: 3, grain: 0, food: 43 })
  })
  it("whole purchase undo restores food hand and exchange resources before retry", () => {
    const s = setup({ resources: { clay: 1, grain: 1 } })
    const before = undoRuleSnapshot(s.getState())
    buy(s, COB)
    assertUndoRestored(before, record('undo-cob-buy', s.undoAction()))
    const r = buy(s, COB)
    assert.deepEqual(resources(r), { clay: 1, grain: 1, food: 39 })
  })
  it("actual work phase exchange undo records exposed eligibility before any retry", () => {
    const s = setup({ played: true, resources: { clay: 1, grain: 1 } })
    const offer = complete(s)
    const r = exchange(s, offer)
    assert.deepEqual(resources(r), { clay: 3, grain: 0, food: 43 })
    const undone = record('undo-cob-phase', assertRejectedUnchanged(s, () => s.undoStep()))
    assert.equal(undone.error, 'no history to undo')
    assert.deepEqual(resources(undone), { clay: 3, grain: 0, food: 43 })
    const undoneAction = record('undo-cob-phase-action', assertRejectedUnchanged(s, () => s.undoAction()))
    assert.equal(undoneAction.error, 'no action snapshot')
    assert.deepEqual(resources(undoneAction), { clay: 3, grain: 0, food: 43 })
  })
})
