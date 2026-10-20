import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmNextPlayer } from './_helpers/pending-confirms'

import '../../shared/cards/B/B032_Kettle'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit19Scoring from './_helpers/audit/ae-negative-19-scoring'

const CARD_ID = 'B032_Kettle'
const FILLER = '__test_placeholder__'

const setup = ({ grainField = true, clay = 1, grain = 0 } = {}) => {
  const session = new GameSession(5232, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.fields = grainField
    ? [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] }]
    : []
  player.resources = {
    ...player.resources,
    wood: 0, clay, reed: 0, stone: 0, food: 0, grain, vegetable: 0,
  }
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playKettle = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const exchange = (session: GameSession, exchangeIndex: number) => {
  let response = session.takeAnytimeAction(0, 'exchange')
  expect(response.ok, response.error).toBe(true)
  response = session.resolveChoice(0, `bulk:${exchangeIndex}=1`)
  expect(response.ok, response.error).toBe(true)
  return response
}

const returnTurnToKettleOwner = (session: GameSession) => {
  let response = confirmNextPlayer(session)
  expect(response.ok, response.error).toBe(true)
  response = session.takeAction(1, 'forest')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : response.interaction.stateId)
    .toBe('confirm-next-player')
  response = confirmNextPlayer(session)
  expect(response.ok, response.error).toBe(true)
  expect(response.state.currentPlayerIndex).toBe(0)
  return response
}

// Kettle's Card Bonus VP lives only in its bonusVp counter: one score entry that
// matches the counter, never a second entry from a parallel store.
const bonusVp = (response: SessionResponse) => {
  const entries = response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')?.entries
    .filter((entry) => 'cardId' in entry && entry.cardId === CARD_ID) ?? []
  expect(entries.length).toBeLessThanOrEqual(1)
  const score = entries[0]?.score ?? 0
  expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(score)
  return score
}

describe('B032 Kettle parity', () => {
  it('B032 S1: one grain field and one clay play Kettle and pay the clay', () => {
    const response = playKettle(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('B032 S2: without a grain field Kettle remains unavailable without spending clay', () => {
    const response = setup({ grainField: false }).takeAction(0, 'major-improvement')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(1)
  })

  it('B032 S3: without clay Kettle remains unavailable even with a grain field', () => {
    const response = setup({ clay: 0 }).takeAction(0, 'major-improvement')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  for (const [scenario, index, grain, food, bonus] of [
    ['S4', 0, 1, 3, 0],
    ['S5', 1, 3, 4, 1],
    ['S6', 2, 5, 5, 2],
  ] as const) {
    it(`B032 ${scenario}: exchanging ${grain} grain yields ${food} food and ${bonus} bonus points`, () => {
      const session = setup({ grain })
      playKettle(session)
      returnTurnToKettleOwner(session)

      const response = exchange(session, index)

      expect(response.state.players[0]!.resources.grain).toBe(0)
      expect(response.state.players[0]!.resources.food).toBe(food)
      expect(bonusVp(response)).toBe(bonus)
    })
  }

  it('B032 S7: bonus points accumulate across separate three- and five-grain exchanges', () => {
    const session = setup({ grain: 8 })
    playKettle(session)
    returnTurnToKettleOwner(session)

    exchange(session, 1)
    const response = exchange(session, 2)

    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.resources.food).toBe(9)
    expect(bonusVp(response)).toBe(3)
  })
})

describe('ae-negative-19-scoring', () => {
  const { KETTLE, sessions, save, ok, turn, menu, buy, bonus, kettle, exchange } = audit19Scoring
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B032 N1 actual one clay grain field purchase and missing clay grain or only opponent field exclusion',()=>{const s=kettle(),{pending,r}=buy(s,KETTLE);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(bonus(r,KETTLE),0);save('B032-N1',{pending,r});for(const mode of['clay','empty','vegetable','opponent']){const ss=kettle(0,state=>{const p=state.players[0]!;if(mode==='clay')p.resources.clay=0;if(mode==='empty')p.fields[0]!.stacks=[];if(mode==='vegetable')p.fields[0]!.stacks=[{kind:'vegetable',remaining:1}];if(mode==='opponent'){state.players[1]!.fields=p.fields;p.fields=[]}}),denied=menu(ss);assertRejectedUnchanged(ss,()=>ss.resolveChoice(0,KETTLE));const legal=ok(ss.resolveChoice(0,'A006_StorageBarn'));assert.equal(legal.state.players[0]!.resources.clay,mode==='clay'?0:1);assert.equal(bonus(legal,KETTLE),0);save(`B032-N1-${mode}`,{denied,legal})}})
  it('B032 N2 each legal one three or five grain trade gives exact food and zero one or two bonus points',()=>{for(const[index,grain,food,points]of[[0,1,3,0],[1,3,4,1],[2,5,5,2]]){const s=kettle(grain,()=>{},true),{pending,r}=exchange(s,index!);assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.food,20+food!);assert.equal(bonus(r,KETTLE),points);assert.equal(r.state.players[1]!.resources.food,20);save(`B032-N2-${grain}`,{pending,r})}})
  it('B032 N3 batch and separate exchanges accumulate exact points without creating grain or duplicate score reads',()=>{const s=kettle(14,()=>{},true),first=exchange(s,1,3).r,r=exchange(s,2).r;assert.equal(first.state.players[0]!.resources.grain,5);assert.equal(bonus(first,KETTLE),3);assert.equal(r.state.players[0]!.resources.grain,0);assert.equal(r.state.players[0]!.resources.food,37);assert.equal(bonus(r,KETTLE),5);assert.equal(bonus(s.getState(),KETTLE),5);save('B032-N3',{first,r})})
  it('B032 N4 negative quantity invalid index and wrong actor refuse before a legal one grain trade',()=>{const s=kettle(2,()=>{},true),pending=ok(s.takeAnytimeAction(0,'exchange'));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'bulk:2=-1'));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'bulk:9999=1'));assertRejectedUnchanged(s,()=>s.resolveChoice(1,'bulk:0=1'));const r=ok(s.resolveChoice(0,'bulk:0=1'));assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.food,23);assert.equal(bonus(r,KETTLE),0);save('B032-N4',{pending,r})})
  it('B032 N5 whole Lessons with anytime exchange undo restores grain food and bonus before one retry',()=>{const s=kettle(5,state=>state.players[0]!.occupationHand=['A110_Roughcaster','A114_SeasonalWorker'],true);turn(s,0,'lessons');exchange(s,2);const r=ok(s.resolveChoice(0,'A110_Roughcaster')),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.grain,5);assert.equal(undone.state.players[0]!.resources.food,20);assert.equal(bonus(undone,KETTLE),0);turn(s,0,'lessons');exchange(s,2);const retry=ok(s.resolveChoice(0,'A110_Roughcaster'));assert.equal(retry.state.players[0]!.resources.grain,0);assert.equal(bonus(retry,KETTLE),2);save('B032-N5',{r,undone,retry})})
})
