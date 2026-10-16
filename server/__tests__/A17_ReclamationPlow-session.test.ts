import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveTriggerIfPresent, expectWait } from './_helpers/trigger-select'
import { executeCardListener, type CardListenerDispatchInput } from '../../shared/cards/card-listeners'
import { A017_ReclamationPlow_impl } from '../../shared/cards/A/A017_ReclamationPlow'
import { type DraftGameEvent } from '../../shared/contract/events'
import { type ActionExecutionResult, type GameState, type PlayerState } from '../../shared/contract/types'

import '../../shared/cards/A/A137_RiverineShepherd'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectTileFarmSelection, expectFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A017_ReclamationPlow'
const A137_ID = 'A137_RiverineShepherd'
const LISTENER = A017_ReclamationPlow_impl.listeners?.[1]
if (!LISTENER) throw new Error('Expected the Reclamation Plow collect listener')

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {}): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { sheep: 1 },
  from: { kind: 'actionSpace', spaceId: 'sheep-market' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const setupDirectContext = (
  transactionEvents: DraftGameEvent<'resource.moved'>[],
  result?: ActionExecutionResult): { session: GameSession
  context: CardListenerDispatchInput
} => {
  const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)
  player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']))
  player.cardStates[CARD_ID] = {
    extraData: { animalsBeforeCollecting: { sheep: 0, boar: 0, cattle: 0 } },
  }
  const space = state.actionSpaces.find(candidate => candidate.id === 'sheep-market')
  assert.ok(space)
  return { session, context: {
      actionHooks: session.actionHooks,
      state,
      player,
      space,
      actionId: 'collect',
      phase: 'after',
      transactionEvents,
      result,
    } }
}
describe('A017_ReclamationPlow session', () => {
  it('A017 S1: paying one wood plays Reclamation Plow', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 7017, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((candidate) => {
      setWorkersAtHome(state, candidate, 2)
      candidate.minorHand = ['__test_placeholder__']
      candidate.occupationHand = ['__test_placeholder__']
      candidate.resources.wood = 0
    })
    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.resources.wood = 1
    session.loadState(state)
    let resp = session.takeAction(0, 'meeting-place')
    for (let guard = 0; guard < 6 && resp.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
      if (resp.interaction.stateId !== 'wait')
        break
      const card = getChoiceOptions(resp)?.find((option) => option.value === CARD_ID)
      const branch = getChoiceOptions(resp)?.find((option) => option.value.startsWith('action-improvement-'))
      const next = card ?? branch
      if (!next)
        break
      resp = session.resolveChoice(expectWait(resp).interaction.playerIndex, next.value)
    }
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })
  it('A017 S2: fully accommodating the next animal take may plow one field and consumes the card', () => {
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket)
      throw new Error('sheep-market missing')
    sheepMarket.resources.sheep = 1
    session.loadState(state)
    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ] })
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionReclamationPlow' })
    if (resp.interaction.stateId !== 'wait')
      return
    const accept = getChoiceOptions(resp)?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(expectWait(resp).interaction.playerIndex, accept!.value)
    expect(resp.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select')
      return
    const tile = expectTileFarmSelection(resp, 'plow').selectableTiles[0]!
    resp = session.commitSelectionChoice(expectWait(resp).interaction.playerIndex, { tile })
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.fields).toContainEqual({ ...tile, stacks: [] })
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]).toMatchObject({ flagged: true, infobox: '✓' })
  })
  it('A017 S3: declining after full accommodation consumes the next-time opportunity', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 7117, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.minorPlayed.push(CARD_ID)
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
    session.loadState(state)
    let resp = session.takeAction(0, 'sheep-market')
    resp = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ] })
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait')
      return
    resp = session.resolveChoice(expectWait(resp).interaction.playerIndex, '__skip__')
    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.fields).toHaveLength(0)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.flagged).toBe(true)
  })
  it('does not let an existing animal hide a newly collected animal that was discarded', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.sheep = 1
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']))
    player.pastures = [{
        id: 'one-space', tiles: [{ row: 0, col: 1 }],
        animalType: null, animalCount: 0
      }]
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 2
    session.loadState(state)
    let response = session.takeAction(0, 'sheep-market')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    response = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
        { id: 'one-space', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
      ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(2)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'farm.animalDiscarded', animals: { sheep: 1 }, reason: 'noRoom',
    }))
    expect(response.interaction.stateId === 'wait' ? response.interaction.promptKey : undefined)
      .not.toBe('ui.interactionReclamationPlow')
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })
  it('uses action-space resource.moved events even when result has no resourcesGained', () => {
    const { session: ruleSession1, context: ctx } = setupDirectContext([moved()], { type: 'ok' })
    const result = ruleSession1.withCtx(() => executeCardListener(LISTENER, ctx))
    expect(result?.flow).toMatchObject({
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-infobox', text: '✓' } },
        { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID, optional: true },
      ],
    })
  })
  it('ignores non-action-space animal moves even when result claims sheep gained', () => {
    const { session: ruleSession2, context: ctx } = setupDirectContext([
      moved({ from: { kind: 'supply' } }),
    ], { type: 'ok', resourcesGained: { sheep: 1 } })
    const result = ruleSession2.withCtx(() => executeCardListener(LISTENER, ctx))
    expect(result).toBeUndefined()
  })
  it('does not read prior global state events when current transaction has no animal moves', () => {
    const { session: ruleSession3, context: ctx } = setupDirectContext([], { type: 'ok', resourcesGained: { sheep: 1 } })
    ctx.state.events = [
      { schemaVersion: 1, id: 'old-worker-event', seq: 1, round: ctx.state.round, phase: ctx.state.roundPhase, visibility: 'public', type: 'worker.placed', actorPlayerId: 'p1', workerId: 'w1', spaceId: 'sheep-market' },
      { ...moved(), schemaVersion: 1, id: 'old-collect-event', seq: 2, round: ctx.state.round, phase: ctx.state.roundPhase, visibility: 'public' },
    ]
    const result = ruleSession3.withCtx(() => executeCardListener(LISTENER, ctx))
    expect(result).toBeUndefined()
  })
  it('does not trigger from A137 feasibility on a non-animal Reed Bank action', () => {
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationPlayed.push(A137_ID)
    player.pastures = [
      {
        id: 'p1',
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
        animalType: null,
        animalCount: 0
      },
    ]
    const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')!
    reedBank.resources.reed = 2
    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')!
    sheepMarket.resources.sheep = 1
    session.loadState(state)
    let resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionReclamationPlow')
    if (resp.interaction.stateId === 'wait') {
      const skip = getChoiceOptions(resp)?.find((option) => option.value === '__skip__')
      if (skip)
        resp = session.resolveChoice(0, skip.value)
    }
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionReclamationPlow')
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.flagged).toBeFalsy()
  })
})
describe("A017 command boundaries", () => {
  const RAMMED = 'A016_RammedClay', RECLAMATION = 'A017_ReclamationPlow', HANDPLOW = 'A019_Handplow'
  const ONE = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
  function setup(card: string, { played = true, round = 5, resources = {}, configure = () => { } }: {
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
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (played)
          p.minorPlayed = [card]
        else
          p.minorHand.push(card)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function choices(r: SessionResponse): import('../../shared/contract/types').ActionChoiceOption[] {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function enter(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.ok(choices(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    const played = ok(s.resolveChoice(0, card))
    if ([RAMMED, RECLAMATION, HANDPLOW].includes(card)) {
      assert.equal(played.state.players[0]!.minorPlayed.includes(card), true)
      assert.equal(played.state.players[0]!.minorHand.includes(card), false)
      const events = played.state.events.filter(event => event.type === 'card.played' && event.cardId === card)
      assert.equal(events.length, 1)
      const event = events[0]!
      assert.ok(event.type === 'card.played')
      assert.equal(event.actorPlayerId, played.state.players[0]!.id)
      assert.deepEqual(event.payment?.resources ?? {}, card === RAMMED ? {} : { wood: 1 })
      if (card === RAMMED) {
        const gains = played.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === RAMMED && e.reason === 'cardEffect')
        assert.equal(gains.length, 1)
        const gain = gains[0]!
        assert.ok(gain.type === 'resource.moved')
        assert.deepEqual(gain.resources, { clay: 1 })
      }
    }
    return played
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
  function pasture(state: GameState) {
    const p = state.players[0]!
    p.fenceSegments = ONE.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
    p.pastures = [{ id: 'pasture', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0 }]
  }
  function reclamation({ sheep = 1, existingField = false, resources = {} }: {
    sheep?: number
    existingField?: boolean
    resources?: Partial<PlayerState['resources']>
  } = {}) {
    return setup(RECLAMATION, { resources, configure(state) {
        pasture(state)
        const market = state.actionSpaces.find(space => space.id === 'sheep-market')
        assert.ok(market)
        market.resources.sheep = sheep
        if (existingField)
          state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
      } })
  }
  function keep(s: GameSession, count: number, actor = 0, house = false) {
    const r = s.getState()
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg', JSON.stringify(r.interaction))
    const placed = ok(s.resolveChoice(actor, 'confirm', { zones: [{ id: house ? 'house:2-0' : 'pasture', zoneType: house ? 'house' : 'pasture', animalType: 'sheep', animalCount: count }] }))
    assert.equal(placed.state.players[actor]!.resources.sheep, count)
    return placed
  }
  function trigger(s: GameSession, initial: SessionResponse, card = RECLAMATION) {
    let r = initial
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') {
      const option = getChoiceOptions(r).find(o => o.value === card || o.sourceCard === card)
      assert.ok(option)
      r = ok(s.resolveChoice(expectWait(r).interaction.playerIndex, option.value))
    }
    return r
  }
  function accept(s: GameSession, r: SessionResponse, actor = 0) {
    const option = choices(r).find(o => !['__skip__', '__done__', '__pass__'].includes(o.value) && o.labelKey !== 'actions.exchange.name' && !('disabled' in o && o.disabled))
    assert.ok(option)
    return ok(s.resolveChoice(actor, option.value))
  }
  function plow(s: GameSession, r: SessionResponse, tile = { row: 1, col: 2 }, expectedFields = 1) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && expectFarmSelection(r).farmType === 'plow')
    const placed = ok(s.commitSelectionChoice(0, { tile }))
    assert.ok(placed.scores)
    const score = placed.scores[0]!.categories.find(category => category.key === 'fields')
    assert.equal(score?.quantity, expectedFields)
    assert.equal(score?.total, expectedFields === 2 ? 1 : -1)
    return placed
  }
  function obtainedSheep(r: SessionResponse) {
    return r.state.events.reduce((sum, event) => event.type === 'resource.moved' && event.from.kind === 'actionSpace' && event.from.spaceId === 'sheep-market' && event.to.kind === 'player' && event.to.playerId === r.state.players[0]!.id ? sum + (event.resources.sheep ?? 0) : sum, 0)
  }
  function flagged(r: SessionResponse) { return r.state.players[0]!.cardStates[RECLAMATION]?.flagged === true; }
  function nextRound(s: GameSession) {
    turn(s, 1, 'forest')
    turn(s, 0, 'grain-seeds')
    const r = confirmNext(s, turn(s, 1, 'clay-pit'))
    assert.equal(r.state.round, 6)
    return r
  }
  it("real purchase pays one wood and zero wood rejects before legal retry", () => {
    const s = setup(RECLAMATION, { played: false, resources: { wood: 1 } })
    const r = buy(s, enter(s), RECLAMATION)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.minorPlayed.includes(RECLAMATION), true)
    const poor = setup(RECLAMATION, { played: false })
    const offer = enter(poor)
    assert.equal(choices(offer).some(o => o.value === RECLAMATION && !('disabled' in o && o.disabled)), false)
    assertRejectedUnchanged(poor, () => poor.resolveChoice(0, RECLAMATION))
    assert.equal(buy(poor, offer, 'A054_Credit').state.players[0]!.minorHand.includes(RECLAMATION), true)
  })
  it("all obtained animals enable one plow only after rejected occupied outboard and nonadjacent targets", () => {
    const s = reclamation({ existingField: true })
    ok(s.takeAction(0, 'sheep-market'))
    const offer = trigger(s, keep(s, 1))
    assert.equal(flagged(offer), true)
    assert.equal(obtainedSheep(offer), 1)
    assert.equal(offer.state.players[0]!.fields.length, 1)
    const r = accept(s, offer)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { tile: { row: 1, col: 2 } }))
    for (const tile of [{ row: 1, col: 0 }, { row: 99, col: 99 }, { row: 2, col: 4 }])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile }))
    const built = plow(s, r, { row: 1, col: 2 }, 2)
    assert.equal(built.state.players[0]!.fields.length, 2)
    assert.equal(built.state.players[0]!.resources.sheep, 1)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 2 } }))
  })
  it("declining first full accommodation consumes the opportunity on a later real animal take", () => {
    const s = reclamation()
    ok(s.takeAction(0, 'sheep-market'))
    trigger(s, keep(s, 1))
    const declined = ok(s.resolveChoice(0, '__skip__'))
    assert.equal(flagged(declined), true)
    assert.equal(declined.state.players[0]!.fields.length, 0)
    nextRound(s)
    turn(s, 0, 'sheep-market')
    const r = keep(s, 2)
    assert.equal(flagged(r), true)
    assert.equal(r.state.players[0]!.fields.length, 0)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
  })
  it("partial accommodation does not trigger or consume before a later qualifying animal take", () => {
    const s = reclamation({ sheep: 2 })
    ok(s.takeAction(0, 'sheep-market'))
    const partial = keep(s, 1)
    assert.equal(obtainedSheep(partial), 2)
    const discards = partial.state.events.filter(event => event.type === 'farm.animalDiscarded')
    assert.equal(discards.length, 1)
    const discarded = discards[0]!
    assert.ok(discarded.type === 'farm.animalDiscarded')
    assert.deepEqual(discarded.animals, { sheep: 1 })
    assert.equal(flagged(partial), false)
    assert.equal(partial.state.players[0]!.fields.length, 0)
    nextRound(s)
    const r = turn(s, 0, 'sheep-market')
    assert.equal(r.state.players[0]!.resources.sheep, 2)
    const offer = trigger(s, keep(s, 2))
    const built = plow(s, accept(s, offer), { row: 0, col: 2 })
    assert.equal(flagged(built), true)
    assert.equal(built.state.players[0]!.fields.length, 1)
  })
  it("opponent animal take does not flag or plow for the owner", () => {
    const s = reclamation()
    turn(s, 0, 'grain-seeds')
    turn(s, 1, 'sheep-market')
    const r = keep(s, 1, 1, true)
    assert.equal(flagged(r), false)
    assert.equal(r.state.players[0]!.fields.length, 0)
    assert.equal(r.state.players[1]!.fields.length, 0)
  })
  it("improvement animal reward is not an animal accumulation source", () => {
    const s = setup(RECLAMATION, { resources: { sheep: 1 }, configure(state) { state.players[0]!.minorHand.push('A009_YoungAnimalMarket'); } })
    const r = buy(s, enter(s), 'A009_YoungAnimalMarket')
    assert.equal(r.state.players[0]!.resources.cattle, 1)
    const kept = ok(s.resolveChoice(0, 'confirm', { zones: [{ id: 'house:2-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 }] }))
    assert.equal(flagged(kept), false)
    assert.equal(kept.state.players[0]!.fields.length, 0)
  })
  it("empty animal take and non animal action do not offer a plow", () => {
    const s = reclamation({ sheep: 0 })
    const r = assertEmptyAccumulationRejected(s, 0, 'sheep-market')
    assert.equal(flagged(r), false)
    assert.equal(r.state.players[0]!.resources.sheep, 0)
    assert.equal(r.interaction.stateId, 'idle')
    const other = reclamation()
    const grain = ok(other.takeAction(0, 'grain-seeds'))
    assert.equal(flagged(grain), false)
    assert.equal(grain.state.players[0]!.fields.length, 0)
  })
  it("undo restores animals field once flag and worker before a single legal retry", () => {
    const s = reclamation()
    const before = undoRuleSnapshot(s.getState())
    ok(s.takeAction(0, 'sheep-market'))
    const r = plow(s, accept(s, trigger(s, keep(s, 1))), { row: 0, col: 2 })
    assert.equal(r.state.players[0]!.fields.length, 1)
    assertUndoRestored(before, s.undoAction())
    ok(s.takeAction(0, 'sheep-market'))
    assert.equal(plow(s, accept(s, trigger(s, keep(s, 1))), { row: 0, col: 2 }).state.players[0]!.fields.length, 1)
  })
})
