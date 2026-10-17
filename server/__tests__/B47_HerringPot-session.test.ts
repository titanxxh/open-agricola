import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B047_HerringPot'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit20Trigger from './_helpers/audit/ae-negative-20-trigger'

const CARD_ID = 'B047_HerringPot'
const FILLER = '__test_placeholder__'

const setup = ({ played = false, clay = 1, round = 5, actor = 0 } = {}) => {
  const session = new GameSession(5047, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.clay = clay
  owner.resources.food = 0
  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('fishing missing')
  fishing.resources.food = 2
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession): SessionResponse => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.playerId === response.state.players[0]!.id
    && entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('B047 Herring Pot parity', () => {
  it('B047 S1: paying one clay plays Herring Pot', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('B047 S2: without clay Herring Pot remains unavailable', () => {
    const response = enterMinor(setup({ clay: 0 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect((response.interaction.request.options ?? []).some((option) => option.value === CARD_ID)).toBe(false)
    expect(futureRounds(response)).toEqual([])
  })

  it('B047 S3: using Fishing schedules one food on each of the next three rounds', () => {
    const response = setup({ played: true }).takeAction(0, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(futureRounds(response)).toEqual([6, 7, 8])
  })

  it('B047 S4: using a non-Fishing accumulation space schedules no food', () => {
    const session = setup({ played: true })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(response)).toEqual([])
  })

  it('B047 S5: another player using Fishing does not trigger the owner Herring Pot', () => {
    const response = setup({ played: true, actor: 1 }).takeAction(1, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.food).toBe(22)
    expect(futureRounds(response)).toEqual([])
  })

  it('B047 S6: a round-thirteen Fishing use schedules only reachable round-fourteen food', () => {
    const response = setup({ played: true, round: 13 }).takeAction(0, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(futureRounds(response)).toEqual([14])
  })

  it('B047 S7: scheduled Herring Pot food is received at the next round start', () => {
    const session = setup({ played: true })
    session.takeAction(0, 'fishing')
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response)).toEqual([7, 8])
  })
})

describe('ae-negative-20-trigger', () => {
  const { POT, sessions, save, ok, setup, menu, buy, schedule, reach, use, ownerUse } = audit20Trigger
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B047 N1 real clay purchase creates no food schedule and missing clay rejects before free legal alternative',()=>{const s=setup(POT,5,state=>state.players[0]!.resources.clay=1),r=buy(s,POT).r;assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(schedule(r,POT).length,0);const poor=setup(POT),pending=menu(poor);assertRejectedUnchanged(poor,()=>poor.resolveChoice(0,POT));const legal=ok(poor.resolveChoice(0,'B004_WoodPile'));assert.equal(schedule(legal,POT).length,0);save('B047-N1',{r,pending,legal})})
  it('B047 N2 actual Fishing gives its pile and queues three food then naturally grants the next due food only to owner',()=>{const s=setup(POT,5,state=>state.players[0]!.resources.clay=1),c=setup(POT,5);buy(s,POT);buy(c,'B004_WoodPile');const first=ownerUse(s,'fishing'),control=ownerUse(c,'fishing');assert.deepEqual(schedule(first.r,POT),[6,7,8].map(round=>({round,resources:{food:1}})));assert.equal(first.r.state.players[0]!.resources.food,control.r.state.players[0]!.resources.food);const six=reach(s,6),csix=reach(c,6);assert.equal(six.state.players[0]!.resources.food,csix.state.players[0]!.resources.food+1);assert.equal(six.state.players[1]!.resources.food,csix.state.players[1]!.resources.food);assert.deepEqual(schedule(six,POT).map(e=>e.round),[7,8]);save('B047-N2',{first,control,six,csix})})
  it('B047 N3 hand opponent Fishing and Reed Bank do not trigger and late Fishing discards out of range targets',()=>{for(const mode of['hand','opponent','reed']){const s=setup(POT,5,state=>state.players[0]!.resources.clay=1);buy(s,mode==='hand'?'B004_WoodPile':POT);const{r}=mode==='opponent'?use(s,1,'fishing'):ownerUse(s,mode==='reed'?'reed-bank':'fishing');assert.equal(schedule(r,POT).length,0);save(`B047-N3-${mode}`,r)}for(const round of[12,13,14]){const s=setup(POT,round,state=>state.players[0]!.resources.clay=1);buy(s,POT);const r=ownerUse(s,'fishing').r;assert.deepEqual(schedule(r,POT).map(e=>e.round),[1,2,3].map(n=>round+n).filter(n=>n<=14));save(`B047-N3-${round}`,r)}})
  it('B047 N4 Fishing undo restores pile food and future schedule before a single legal replay',()=>{const s=setup(POT,5,state=>state.players[0]!.resources.clay=1);buy(s,POT);const{before,r}=ownerUse(s,'fishing'),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.food,before.state.players[0]!.resources.food);assert.equal(schedule(undone,POT).length,0);assert.deepEqual(undone.state.actionSpaces.find(a=>a.id==='fishing')!.resources,before.state.actionSpaces.find(a=>a.id==='fishing')!.resources);const retry=use(s,0,'fishing').r;assert.equal(retry.state.players[0]!.resources.food,r.state.players[0]!.resources.food);assert.equal(schedule(retry,POT).length,3);save('B047-N4',{before,r,undone,retry})})
})
