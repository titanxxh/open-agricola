import { type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A125_Priest'
import '../../shared/cards/B/B099_Tutor'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A001_Shelter'
import '../../shared/cards/A/A037_Bucksaw'
import '../../shared/cards/D/D152_Patron'
import '../../shared/cards/B/B049_Scales'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit20Balance from './_helpers/audit/ae-negative-20-balance'

const CARD_ID = 'B049_Scales'
const PLACEHOLDER = '__test_placeholder__'

const setup = (opts: {
  minorHand?: string[]
  occupationHand?: string[]
  minorPlayed?: string[]
  occupationPlayed?: string[]
  availableMajorImprovements?: string[]
  wood?: number
  reed?: number
  stone?: number
  food?: number
}) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  setWorkersAtHome(state, state.players[1]!, 0)
  player.minorPlayed = opts.minorPlayed ?? [CARD_ID]
  player.occupationPlayed = opts.occupationPlayed ?? []
  player.minorHand = opts.minorHand ?? [PLACEHOLDER]
  player.occupationHand = opts.occupationHand ?? [PLACEHOLDER]
  player.resources = {
    ...player.resources,
    wood: opts.wood ?? 0,
    reed: opts.reed ?? 0,
    stone: opts.stone ?? 0,
    food: opts.food ?? 0,
  }
  state.players[1]!.minorHand = [PLACEHOLDER]
  state.players[1]!.occupationHand = [PLACEHOLDER]
  if (opts.availableMajorImprovements) {
    state.availableMajorImprovements = opts.availableMajorImprovements
  }

  session.loadState(state)
  return session
}

const playedEvents = (state: ReturnType<GameSession['getState']>['state'], cardId: string) =>
  state.events.filter((event) => event.type === 'card.played' && event.cardId === cardId)

const chooseMeetingPlaceMinor = (session: GameSession, cardId: string) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp

  const improvement = resp.interaction.request.options?.find(
    (option) => option.value === 'action-improvement-1',
  )
  expect(improvement).toBeDefined()

  resp = session.resolveChoice(0, improvement!.value)
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp

  resp = session.resolveChoice(0, cardId)
  expect(resp.ok).toBe(true)
  return resp
}

const finishOptionalPrompts = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
) => {
  let resp = response
  let guard = 10
  while (resp.interaction.stateId === 'wait' && guard > 0) {
    guard -= 1
    if (resp.interaction.request.kind === 'select-trigger') {
      resp = resolveTriggerIfPresent(session, resp, CARD_ID)
      expect(resp.ok).toBe(true)
      continue
    }
    const skip = resp.interaction.request.options?.find(
      (option) => option.value === '__skip__' || option.value === 'skip',
    )
    if (!skip) break
    resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, skip.value)
    expect(resp.ok).toBe(true)
  }
  expect(guard).toBeGreaterThan(0)
  return resp
}

describe('B049_Scales session', () => {
  it('gains 2 food after a normal improvement makes occupation and improvement counts equal', () => {
    const session = setup({
      minorHand: ['A037_Bucksaw', 'C069_LandConsolidation'],
      minorPlayed: [CARD_ID],
      occupationPlayed: ['A123_FrameBuilder', 'D152_Patron'],
      wood: 1,
      food: 0,
    })

    const resp = finishOptionalPrompts(
      session,
      chooseMeetingPlaceMinor(session, 'A037_Bucksaw'),
    )

    const player = resp.state.players[0]!
    expect(player.minorPlayed).toContain('A037_Bucksaw')
    expect(player.resources.food).toBe(2)
    expect(playedEvents(resp.state, 'A037_Bucksaw')).toContainEqual(expect.objectContaining({
      type: 'card.played',
      actorPlayerId: player.id,
      cardId: 'A037_Bucksaw',
      cardType: 'minor',
      sourceActionId: 'improvement',
    }))
  })

  it('does not gain food for a passing improvement even when counts remain equal', () => {
    const session = setup({
      minorHand: ['A001_Shelter', 'C069_LandConsolidation'],
      minorPlayed: [CARD_ID],
      occupationPlayed: ['A123_FrameBuilder'],
      food: 0,
    })

    const resp = finishOptionalPrompts(
      session,
      chooseMeetingPlaceMinor(session, 'A001_Shelter'),
    )

    const player = resp.state.players[0]!
    expect(player.minorPlayed).not.toContain('A001_Shelter')
    expect(resp.state.players[1]!.minorHand).toContain('A001_Shelter')
    expect(player.occupationPlayed.length).toBe(
      player.minorPlayed.length + player.improvements.length,
    )
    expect(player.resources.food).toBe(0)
    expect(playedEvents(resp.state, 'A001_Shelter')).toHaveLength(0)
  })

  it('gains 2 food after a major improvement makes occupation and improvement counts equal', () => {
    const session = setup({
      minorPlayed: [CARD_ID],
      occupationPlayed: ['A123_FrameBuilder', 'D152_Patron'],
      availableMajorImprovements: ['Major_Basket'],
      reed: 2,
      stone: 2,
      food: 0,
    })

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    const player = resp.state.players[0]!
    expect(player.improvements).toContain('Major_Basket')
    expect(player.resources.food).toBe(2)
    expect(playedEvents(resp.state, 'Major_Basket')).toContainEqual(expect.objectContaining({
      type: 'card.played',
      actorPlayerId: player.id,
      cardId: 'Major_Basket',
      cardType: 'major',
      sourceActionId: 'improvement',
    }))
  })

  it('gains 2 food after playing an occupation makes occupation and improvement counts equal', () => {
    const session = setup({
      minorPlayed: [CARD_ID],
      occupationPlayed: [],
      occupationHand: ['A123_FrameBuilder'],
      food: 0,
    })

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)

    const player = resp.state.players[0]!
    expect(player.occupationPlayed).toContain('A123_FrameBuilder')
    expect(player.resources.food).toBe(2)
    expect(playedEvents(resp.state, 'A123_FrameBuilder')).toContainEqual(expect.objectContaining({
      type: 'card.played',
      actorPlayerId: player.id,
      cardId: 'A123_FrameBuilder',
      cardType: 'occupation',
      sourceActionId: 'occupation',
    }))
  })
})

describe('B049 Scales parity', () => {
  const CARD_ID = 'B049_Scales'

  const BUCKSAW_ID = 'A037_Bucksaw'

  const PRIEST_ID = 'A125_Priest'

  const PLACEHOLDER = '__test_placeholder__'

  const setup = ({
    played = true, occupations = 0, wood = played ? 0 : 1, stone = 0, food = 0,
  }: {
    played?: boolean
    occupations?: number
    wood?: number
    stone?: number
    food?: number
  } = {}) => {
    const session = new GameSession(6049, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.availableMajorImprovements = ['Major_Joinery']
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [PLACEHOLDER]
      player.occupationHand = [PLACEHOLDER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [PLACEHOLDER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.occupationPlayed = ['B099_Tutor', PRIEST_ID].slice(0, occupations)
    owner.resources = { ...owner.resources, wood, stone, food }
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playMinor = (session: GameSession, cardId: string) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    if (!options(response).some((option) => option.value === cardId)) {
      const improvement = options(response).find((option) =>
        option.value.startsWith('action-improvement-'))
      if (!improvement) return response
      response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    }
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === cardId)
    if (!card) return response
    response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return resolveTriggerIfPresent(session, response, CARD_ID)
  }

  it('B049 S1: with no occupation paying one wood plays Scales without rewarding its own play', () => {
    const response = playMinor(setup({ played: false }), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
  })

  it('B049 S2: an occupation keeps Scales unavailable without spending its wood', () => {
    const response = playMinor(setup({ played: false, occupations: 1 }), CARD_ID)

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })

  it('B049 S6: a normal improvement grants no food while the card counts remain unequal', () => {
    const session = setup({ wood: 1 })
    const state = session.getState().state
    state.players[0]!.minorHand = [BUCKSAW_ID]
    session.loadState(state)

    const response = playMinor(session, BUCKSAW_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(BUCKSAW_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})

describe('ae-negative-20-balance', () => {
  const { CARD, MINOR, OCCS, sessions, save, ok, turn, make, select, minor } = audit20Balance
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B049 N1 real wood purchase needs no occupation and never rewards its own play',()=>{const s=make(false),r=minor(s,CARD);assert.ok(r.state.players[0]!.minorPlayed.includes(CARD));assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,100);for(const mode of['occupation','wood']){const ss=make(false,mode==='occupation'?1:0,state=>{if(mode==='wood')state.players[0]!.resources.wood=0}),pending=turn(ss,0,'meeting-place');const i=pending.interaction;if(i.stateId==='wait'&&i.request.kind==='choice'&&i.request.options.some(o=>o.value.startsWith('action-improvement-'))){const o=i.request.options.find(o=>o.value.startsWith('action-improvement-'))!;ok(ss.resolveChoice(0,o.value))}assertRejectedUnchanged(ss,()=>ss.resolveChoice(0,CARD));const legal=select(ss,ss.getState(),'B004_WoodPile');assert.equal(legal.state.players[0]!.resources.food,100);save(`B049-N1-${mode}`,{pending,legal})}save('B049-N1',r)})
  it('B049 N2 actual occupation balances one improvement for two food while unequal final counts grant none',()=>{for(const n of[0,1]){const s=make(true,n),card=OCCS[n]!,pending=turn(s,0,'lessons'),r=select(s,pending,card);assert.ok(r.state.players[0]!.occupationPlayed.includes(card));assert.equal(r.state.players[0]!.resources.food,100-(n?1:0)+(n?0:2));assert.equal(r.state.log.filter(e=>e.key==='log.playOccupation').length,1);save(`B049-N2-${n}`,{pending,r})}})
  it('B049 N3 actual normal minor and major each balance two occupations for exactly two food',()=>{const s=make(true,2),minorResult=minor(s,MINOR);assert.ok(minorResult.state.players[0]!.minorPlayed.includes(MINOR));assert.equal(minorResult.state.players[0]!.resources.food,102);const m=make(true,2),pending=turn(m,0,'major-improvement'),majorResult=select(m,pending,'Major_Fireplace1');assert.ok(majorResult.state.players[0]!.improvements.includes('Major_Fireplace1'));assert.equal(majorResult.state.players[0]!.resources.clay,0);assert.equal(majorResult.state.players[0]!.resources.food,102);save('B049-N3',{minorResult,pending,majorResult})})
  it('B049 N4 passing improvement hand Scales and opponent occupation cannot trigger owner balance food',()=>{const s=make(true,1),passing=minor(s,'A006_StorageBarn');assert.equal(passing.state.players[0]!.resources.food,100);assert.ok(passing.state.players[1]!.minorHand.includes('A006_StorageBarn'));assert.equal(passing.state.players[0]!.minorPlayed.length,1);const h=make(false),hand=select(h,turn(h,0,'lessons'),OCCS[0]!);assert.equal(hand.state.players[0]!.resources.food,100);const other=make(true,0,state=>state.players[1]!.occupationHand=[OCCS[0]!,OCCS[1]!]);turn(other,0,'reed-bank');const pending=turn(other,1,'lessons'),o=select(other,pending,OCCS[0]!,1);assert.equal(o.state.players[0]!.resources.food,100);assert.equal(o.state.players[1]!.resources.food,100);save('B049-N4',{passing,hand,pending,o})})
  it('B049 N5 invalid choice actor and whole occupation undo restore balanced food and card before one retry',()=>{const s=make(),pending=turn(s,0,'lessons');assertRejectedUnchanged(s,()=>s.resolveChoice(1,OCCS[0]!));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'invalid-occupation'));const r=select(s,pending,OCCS[0]!),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,100);assert.equal(undone.state.players[0]!.occupationPlayed.length,0);assert.ok(undone.state.players[0]!.occupationHand.includes(OCCS[0]!));const retry=select(s,turn(s,0,'lessons'),OCCS[0]!);assert.equal(retry.state.players[0]!.resources.food,102);save('B049-N5',{pending,r,undone,retry})})
})
