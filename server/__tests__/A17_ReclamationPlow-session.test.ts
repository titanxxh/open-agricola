import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { executeCardListener } from '../../shared/cards/card-listeners'
import { A017_ReclamationPlow_impl } from '../../shared/cards/A/A017_ReclamationPlow'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionExecutionResult } from '../../shared/contract/types'

import '../../shared/cards/A/A017_ReclamationPlow'
import '../../shared/cards/A/A137_RiverineShepherd'
import '../../shared/cards/A/A016_RammedClay'
import '../../shared/cards/A/A019_Handplow'
import '../../shared/cards/A/A009_YoungAnimalMarket'
import assert from 'node:assert/strict'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit05Fields from './_helpers/audit/ae-negative-05-fields'

const CARD_ID = 'A017_ReclamationPlow'
const A137_ID = 'A137_RiverineShepherd'
const LISTENER = A017_ReclamationPlow_impl.listeners[1]!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { sheep: 1 },
  from: { kind: 'actionSpace', spaceId: 'sheep-market' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const setupDirectContext = (
  transactionEvents: DraftGameEvent<'resource.moved'>[],
  result?: ActionExecutionResult,
): { session: GameSession; context: CardListenerContext } => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)
  player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
  player.cardStates[CARD_ID] = {
    extraData: { animalsBeforeCollecting: { sheep: 0, boar: 0, cattle: 0 } },
  }
  const space = {
    id: 'sheep-market',
    gainPerRound: { sheep: 1 },
  }

  return { session, context: {
    actionHooks: session.actionHooks,
    state,
    player,
    space,
    actionId: 'collect',
    phase: 'after',
    transactionEvents,
    result,
  } as unknown as CardListenerContext }
}

describe('A017_ReclamationPlow session', () => {
  it('A017 S1: paying one wood plays Reclamation Plow', () => {
    const session = new GameSession(7017, undefined, { playerCount: 2 })
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
      if (resp.interaction.stateId !== 'wait') break
      const card = resp.interaction.request.options?.find((option) => option.value === CARD_ID)
      const branch = resp.interaction.request.options?.find((option) =>
        option.value.startsWith('action-improvement-'))
      const next = card ?? branch
      if (!next) break
      resp = session.resolveChoice(resp.interaction.playerIndex, next.value)
    }

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('A017 S2: fully accommodating the next animal take may plow one field and consumes the card', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])

    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionReclamationPlow' })
    if (resp.interaction.stateId !== 'wait') return
    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(resp.interaction.playerIndex, accept!.value)
    expect(resp.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
    if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'farm-select') return
    const tile = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(resp.interaction.playerIndex, { tile })

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.fields).toContainEqual({ ...tile, stacks: [] })
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]).toMatchObject({ flagged: true, infobox: '✓' })
  })

  it('A017 S3: declining after full accommodation consumes the next-time opportunity', () => {
    const session = new GameSession(7117, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.minorPlayed.push(CARD_ID)
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house:1-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    resp = session.resolveChoice(resp.interaction.playerIndex, '__skip__')

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.players[0]!.fields).toHaveLength(0)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.flagged).toBe(true)
  })

  it('does not let an existing animal hide a newly collected animal that was discarded', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.sheep = 1
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
    player.pastures = [{
      id: 'one-space', size: 1, tiles: [{ row: 0, col: 1 }],
      stables: 0, animalType: null, animalCount: 0,
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
      { type: 'worker.placed', actorPlayerId: 'p1', workerId: 'w1', spaceId: 'sheep-market' } as never,
      moved() as never,
    ]

    const result = ruleSession3.withCtx(() => executeCardListener(LISTENER, ctx))

    expect(result).toBeUndefined()
  })

  it('does not trigger from A137 feasibility on a non-animal Reed Bank action', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
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
        size: 4,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
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
      const skip = resp.interaction.request.options?.find((option) => option.value === '__skip__')
      if (skip) resp = session.resolveChoice(0, skip.value)
    }

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionReclamationPlow')
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.flagged).toBeFalsy()
  })
})

describe('ae-negative-05-fields', () => {
  const { RECLAMATION, sessions, setup, ok, choices, enter, buy, turn, reclamation, keep, trigger, accept, plow, obtainedSheep, flagged, nextRound } = audit05Fields
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A017 N1 real purchase pays one wood and zero wood rejects before legal retry', () => {
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
  it('A017 N2 all obtained animals enable one plow only after rejected occupied outboard and nonadjacent targets', () => {
    const s = reclamation({ existingField: true })
    ok(s.takeAction(0, 'sheep-market'))
    const offer = trigger(s, keep(s,1))
    assert.equal(flagged(offer), true)
    assert.equal(obtainedSheep(offer),1)
    assert.equal(offer.state.players[0]!.fields.length, 1)
    const r = accept(s, offer)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { tile: { row: 1,col: 2 } }))
    for (const tile of [{row:1,col:0},{row:99,col:99},{row:2,col:4}]) assertRejectedUnchanged(s, () => s.commitSelectionChoice(0,{tile}))
    const built = plow(s,r,{row:1,col:2},2)
    assert.equal(built.state.players[0]!.fields.length, 2)
    assert.equal(built.state.players[0]!.resources.sheep, 1)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0,{tile:{row:1,col:2}}))
  })
  it('A017 N3 declining first full accommodation consumes the opportunity on a later real animal take', () => {
    const s = reclamation()
    ok(s.takeAction(0,'sheep-market'))
    trigger(s,keep(s,1))
    const declined = ok(s.resolveChoice(0,'__skip__'))
    assert.equal(flagged(declined),true); assert.equal(declined.state.players[0]!.fields.length,0)
    nextRound(s)
    turn(s,0,'sheep-market')
    const r = keep(s,2)
    assert.equal(flagged(r),true); assert.equal(r.state.players[0]!.fields.length,0)
    assert.ok(r.interaction.stateId==='wait' && r.interaction.request.kind==='confirm-next-player')
  })
  it('A017 N4 partial accommodation does not trigger or consume before a later qualifying animal take', () => {
    const s = reclamation({sheep:2})
    ok(s.takeAction(0,'sheep-market'))
    const partial = keep(s,1)
    assert.equal(obtainedSheep(partial),2)
    const discards=partial.state.events.filter(event=>event.type==='farm.animalDiscarded')
    assert.equal(discards.length,1)
    const discarded=discards[0]!
    assert.ok(discarded.type==='farm.animalDiscarded');assert.deepEqual(discarded.animals,{sheep:1})
    assert.equal(flagged(partial),false); assert.equal(partial.state.players[0]!.fields.length,0)
    nextRound(s)
    const r = turn(s,0,'sheep-market')
    assert.equal(r.state.players[0]!.resources.sheep,2)
    const offer = trigger(s,keep(s,2))
    const built = plow(s,accept(s,offer),{row:0,col:2})
    assert.equal(flagged(built),true); assert.equal(built.state.players[0]!.fields.length,1)
  })
  it('A017 N5 opponent animal take does not flag or plow for the owner', () => {
    const s = reclamation()
    turn(s,0,'grain-seeds')
    turn(s,1,'sheep-market')
    const r = keep(s,1,1,true)
    assert.equal(flagged(r),false); assert.equal(r.state.players[0]!.fields.length,0); assert.equal(r.state.players[1]!.fields.length,0)
  })
  it('A017 N6 improvement animal reward is not an animal accumulation source', () => {
    const s = setup(RECLAMATION,{resources:{sheep:1},configure(state){state.players[0]!.minorHand.push('A009_YoungAnimalMarket')}})
    const r = buy(s,enter(s),'A009_YoungAnimalMarket')
    assert.equal(r.state.players[0]!.resources.cattle,1)
    const kept = ok(s.resolveChoice(0,'confirm',{zones:[{id:'house:2-0',zoneType:'house',animalType:'cattle',animalCount:1}]}))
    assert.equal(flagged(kept),false); assert.equal(kept.state.players[0]!.fields.length,0)
  })
  it('A017 N7 empty animal take and non animal action do not offer a plow', () => {
    const s = reclamation({sheep:0})
    const r = assertEmptyAccumulationRejected(s, 0, 'sheep-market')
    assert.equal(flagged(r),false); assert.equal(r.state.players[0]!.resources.sheep,0)
    assert.equal(r.interaction.stateId, 'idle')
    const other = reclamation()
    const grain = ok(other.takeAction(0,'grain-seeds'))
    assert.equal(flagged(grain),false); assert.equal(grain.state.players[0]!.fields.length,0)
  })
  it('A017 N8 undo restores animals field once flag and worker before a single legal retry', () => {
    const s = reclamation()
    const before = undoRuleSnapshot(s.getState())
    ok(s.takeAction(0,'sheep-market'))
    const r = plow(s,accept(s,trigger(s,keep(s,1))),{row:0,col:2})
    assert.equal(r.state.players[0]!.fields.length,1)
    assertUndoRestored(before,s.undoAction())
    ok(s.takeAction(0,'sheep-market'))
    assert.equal(plow(s,accept(s,trigger(s,keep(s,1))),{row:0,col:2}).state.players[0]!.fields.length,1)
  })
})
