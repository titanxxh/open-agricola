import '../../shared/cards/B/B113_PatchCaregiver'
import '../../shared/cards/B/B141_FieldCaretaker'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { C014_StrawThatchedRoof } from '../../shared/cards/C/C014_StrawThatchedRoof'
import { D015_ClaySupports } from '../../shared/cards/D/D015_ClaySupports'
import { canRenovate } from '../../shared/actions/effects/renovation'
import { PaymentSolver } from '../../shared/actions/payment'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit28Roof from './_helpers/audit/ae-negative-28-roof'

const CARD_ID = 'C014_StrawThatchedRoof'

const setup = (withCard: boolean) => {
  const session = new GameSession(1)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 6

  const player = state.players[0]!
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
  }
  player.houseType = 'wood'
  player.rooms = 2
  player.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }]
  player.supplyTokensConsumed = { ...player.supplyTokensConsumed, stable: 4 }
  setWorkersAtHome(state, player, 2)

  if (withCard) {
    player.minorPlayed = [CARD_ID]
    player.activeModifiers = [...(C014_StrawThatchedRoof.impl.modifiers ?? [])]
  }

  session.loadState(state)
  return session
}

const chooseConstructIfNeeded = (session: GameSession, resp: SessionResponse): SessionResponse => {
  if (resp.interaction.stateId !== 'wait' || resp.interaction.request.kind !== 'choice') return resp
  const construct = resp.interaction.request.options?.find(
    (option) => option.labelKey === 'actions.construct.name',
  )
  return construct ? session.resolveChoice(0, construct.value) : resp
}

const actionLog = (resp: SessionResponse, actionId: string) =>
  resp.state.log.find((entry) =>
    entry.key === 'log.actionDetail' &&
    typeof entry.params?.action === 'string' &&
    entry.params.action.includes(actionId),
  )

describe('C014 Straw-Thatched Roof session', () => {
  it('builds a wood room without reed', () => {
    const session = setup(true)
    session.state.players[0]!.resources.wood = 5
    session.loadState(session.state)

    let resp = chooseConstructIfNeeded(session, session.takeAction(0, 'farm-expansion'))
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('farm-select')
    if (resp.interaction.request.kind !== 'farm-select') return
    expect(resp.interaction.request.farm.farmType).toBe('room')
    const room = resp.interaction.request.farm.selectableTiles[0]!

    resp = session.commitSelectionChoice(0, { rooms: [room] })

    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).not.toBe('prompt.selectPayment')
    expect(resp.state.players[0]).toMatchObject({ rooms: 3, resources: { wood: 0, reed: 0 } })
    const paid = resp.state.events.find(
      (event) => event.type === 'resource.paid' && event.paymentFor === 'construct',
    )
    expect(paid).toBeDefined()
    expect(paid?.type === 'resource.paid' ? paid.resources.reed ?? 0 : undefined).toBe(0)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.resourceStats).toMatchObject({
      saved: { reed: 2 },
    })
    expect(actionLog(resp, 'construct')).toBeDefined()
    expect(resp.scores).toHaveLength(2)
  })

  it('waives reed after applying the D015 clay-room alternative', () => {
    const session = setup(true)
    const player = session.state.players[0]!
    player.houseType = 'clay'
    player.resources.clay = 2
    player.resources.wood = 1
    player.minorPlayed.push('D015_ClaySupports')
    player.activeModifiers.push(...(D015_ClaySupports.impl.modifiers ?? []))
    session.loadState(session.state)

    let resp = chooseConstructIfNeeded(session, session.takeAction(0, 'farm-expansion'))
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('farm-select')
    if (resp.interaction.request.kind !== 'farm-select') return
    const room = resp.interaction.request.farm.selectableTiles[0]!

    resp = session.commitSelectionChoice(0, { rooms: [room] })

    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).not.toBe('prompt.selectPayment')
    expect(resp.state.players[0]).toMatchObject({
      rooms: 3,
      resources: { clay: 0, wood: 0, reed: 0 },
    })
    const paid = resp.state.events.find(
      (event) => event.type === 'resource.paid' && event.paymentFor === 'construct',
    )
    expect(paid).toBeDefined()
    expect(paid?.type === 'resource.paid' ? paid.resources : undefined).toMatchObject({ clay: 2, wood: 1 })
    expect(paid?.type === 'resource.paid' ? paid.resources.reed ?? 0 : undefined).toBe(0)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.resourceStats).toMatchObject({
      saved: { reed: 1 },
    })
    expect(actionLog(resp, 'construct')).toBeDefined()
    expect(resp.scores).toHaveLength(2)
  })

  it('renovates a two-room wood house without reed', () => {
    const session = setup(true)
    session.state.players[0]!.resources.clay = 2
    session.loadState(session.state)

    let resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      resp = session.resolveChoice(0, 'clay')
    }

    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).not.toBe('prompt.selectPayment')
    expect(resp.state.players[0]).toMatchObject({ houseType: 'clay', resources: { clay: 0, reed: 0 } })
    const paid = resp.state.events.find(
      (event) => event.type === 'resource.paid' && event.paymentFor === 'renovation',
    )
    expect(paid).toBeDefined()
    expect(paid?.type === 'resource.paid' ? paid.resources.reed ?? 0 : undefined).toBe(0)
    expect(resp.state.players[0]!.cardStates[CARD_ID]?.extraData?.resourceStats).toMatchObject({
      saved: { reed: 1 },
    })
    expect(actionLog(resp, 'renovate-house')).toBeDefined()
    expect(resp.scores).toHaveLength(2)
  })

  it('keeps construct and renovation unavailable without the card', () => {
    const constructSession = setup(false)
    constructSession.state.players[0]!.resources.wood = 5
    constructSession.loadState(constructSession.state)
    const constructBefore = constructSession.getState()

    expect(PaymentSolver.getMaxBuildableRooms(constructSession.state.players[0]!)).toBe(0)
    const constructAfter = constructSession.getState()
    expect(constructAfter.interaction).toEqual(constructBefore.interaction)
    expect(constructAfter.state.log).toEqual(constructBefore.state.log)
    expect(constructAfter.scores).toEqual(constructBefore.scores)
    expect(constructAfter.state).toEqual(constructBefore.state)

    const renovationSession = setup(false)
    renovationSession.state.players[0]!.resources.clay = 2
    renovationSession.loadState(renovationSession.state)
    const renovationBefore = renovationSession.getState()

    expect(canRenovate(renovationSession.state.players[0]!)).toBe(false)
    const renovationAfter = renovationSession.getState()
    expect(renovationAfter.interaction).toEqual(renovationBefore.interaction)
    expect(renovationAfter.state.log).toEqual(renovationBefore.state.log)
    expect(renovationAfter.scores).toEqual(renovationBefore.scores)
    expect(renovationAfter.state).toEqual(renovationBefore.state)
  })
})

describe('C014 Straw-Thatched Roof parity', () => {
  const CARD_ID = 'C014_StrawThatchedRoof'

  const setup = ({
    played = false,
    grainFields = 3,
    cardFields = false,
  }: {
    played?: boolean
    grainFields?: number
    cardFields?: boolean
  } = {}) => {
    const playerCount = cardFields ? 3 : 2
    const session = new GameSession(14, undefined, { playerCount })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    }
    player.minorHand = played ? ['__test_placeholder__'] : [CARD_ID]
    player.minorPlayed = played ? [CARD_ID] : []
    player.fields = Array.from({ length: grainFields }, (_, index) => ({
      row: Math.floor(index / 5),
      col: index % 5,
      stacks: [{ kind: 'grain' as const, remaining: 1 }],
    }))

    if (cardFields) {
      player.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] }]
      player.occupationPlayed = ['B113_PatchCaregiver', 'B141_FieldCaretaker']
      player.cardStates.B113_PatchCaregiver = {
        extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] },
      }
      player.cardStates.B141_FieldCaretaker = {
        extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 1 }] },
      }
    }

    session.loadState(state)
    return session
  }

  const enterMinorChoice = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
    return response
  }

  const playMinor = (session: GameSession) => {
    let response = enterMinorChoice(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = response.interaction.request.options?.find((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
    if (!card) return response
    response = session.resolveChoice(0, card.value)
    return response
  }

  it('C014 S1: three planted grain fields allow Straw-Thatched Roof to be played for free', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C014 S2: only two planted grain fields keep Straw-Thatched Roof unavailable', () => {
    const response = enterMinorChoice(setup({ grainFields: 2 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId === 'wait'
      ? response.interaction.request.options?.some((option) =>
        option.value === CARD_ID || option.value === `minor:${CARD_ID}`) ?? false
      : false).toBe(false)
  })

  it('C014 S3: one farmyard grain field and two grain Card Fields satisfy the prerequisite', () => {
    const response = playMinor(setup({ cardFields: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players).toHaveLength(3)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })
})

describe('ae-negative-28-roof', () => {
  const { CARD, sessions, save, ok, finish, build, make, menu, vp, renovate } = audit28Roof
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C014 N1 actual free purchase requires three own planted grain fields awards one point and whole undo restores hand',()=>{const s=make(false),before=ok(s.getState()),pending=menu(s),r=finish(s,ok(s.resolveChoice(0,CARD)),false),undone=ok(s.undoAction());assert.ok(r.state.players[0]!.minorPlayed.includes(CARD));assert.equal(vp(r),1);assert.deepEqual(r.state.players[0]!.resources,before.state.players[0]!.resources);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));assert.equal(vp(undone),0);save('C014-N1',{before,pending,r,undone})})
  it('C014 N2 two grain fields plus vegetable or empty third field and opponents grain fields cannot satisfy purchase before a free legal alternative',()=>{for(const third of['vegetable','empty']as const){const s=make(false,2,third),pending=menu(s),rejected=assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARD)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')),false);assert.ok(r.state.players[0]!.minorHand.includes(CARD));assert.equal(vp(r),0);save(`C014-N2-${third}`,{pending,rejected,r})}})
  it('C014 N3 real two room construction needs ten wood no reed and whole undo restores both rooms and payments',()=>{const s=make(true,3,'grain','wood',{wood:10,reed:0}),before=ok(s.getState()),a=build(s,2,{wood:10}),undone=ok(s.undoAction());assert.equal(a.r.state.players[0]!.resources.reed,0);assert.deepEqual(undone.state.players[0]!.resources,before.state.players[0]!.resources);assert.deepEqual(undone.state.players[0]!.roomTiles,before.state.players[0]!.roomTiles);save('C014-N3',{before,a,undone})})
  it('C014 N4 actual wood to clay or clay to stone renovation removes only reed and pays both matching materials',()=>{for(const[house,target]of[['wood','clay'],['clay','stone']]as const){const s=make(true,3,'grain',house,{wood:0,[target]:2,reed:0}),before=ok(s.getState()),r=renovate(s,target);assert.equal(r.state.players[0]!.resources[target],0);assert.equal(r.state.players[0]!.resources.reed,0);assert.equal(r.state.players[0]!.resources.food,100);save(`C014-N4-${target}`,{before,r})}})
  it('C014 N5 card only in hand retains ordinary construction and renovation reed costs',()=>{const s=make(false,3,'grain','wood',{wood:5,reed:2}),a=build(s,1,{wood:5,reed:2});assert.equal(a.r.state.players[0]!.resources.reed,0);const ss=make(false,3,'grain','clay',{wood:0,stone:2,reed:1}),r=renovate(ss,'stone');assert.equal(r.state.players[0]!.resources.reed,0);assert.ok(r.state.players[0]!.minorHand.includes(CARD));save('C014-N5',{a,r})})
})
