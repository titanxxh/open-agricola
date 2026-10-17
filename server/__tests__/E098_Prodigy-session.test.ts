import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E098_Prodigy'
import assert from 'node:assert/strict'
import * as audit46Scoring from './_helpers/audit/ae-negative-46-scoring'

const CARD_ID = 'E098_Prodigy'
const FILLER = '__test_placeholder__'

const setup = ({ major = 0, minor = 0, priorOccupation = false } = {}) => {
  const session = new GameSession(7098, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = [CARD_ID]
  if (major > 0) owner.improvements.push('Major_Well')
  if (minor > 0) owner.minorPlayed.push('E046_WaterlilyPond')
  if (priorOccupation) owner.occupationPlayed.push('A100_Curator')
  session.loadState(state)
  return session
}

const playProdigy = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const bonusVp = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0

describe('E098 Prodigy parity', () => {
  it('E098 S1: Prodigy can be played as the first occupation with no improvements for zero bonus points', () => {
    const response = playProdigy(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(bonusVp(response)).toBe(0)
  })

  it('E098 S2: the first-occupation Prodigy grants one bonus point for one major improvement', () => {
    const response = playProdigy(setup({ major: 1 }))

    expect(bonusVp(response)).toBe(1)
  })

  it('E098 S3: Prodigy counts both major and minor improvements already owned', () => {
    const response = playProdigy(setup({ major: 1, minor: 1 }))

    expect(bonusVp(response)).toBe(2)
  })

  it('E098 S4: Prodigy played as the second occupation grants no bonus points', () => {
    const response = playProdigy(setup({ major: 1, minor: 1, priorOccupation: true }))

    expect(bonusVp(response)).toBe(0)
  })

  it('E098 S5: an improvement added after Prodigy does not increase its snapshotted bonus', () => {
    const session = setup({ major: 1 })
    const played = playProdigy(session)
    expect(bonusVp(played)).toBe(1)

    const state = session.getState().state
    state.players[0]!.minorPlayed.push('E046_WaterlilyPond')
    session.loadState(state)
    const response = session.getState()

    expect(bonusVp(response)).toBe(1)
  })
})

describe('ae-negative-46-scoring', () => {
  const { PRODIGY, sessions, save, ok, make, choose, lesson, bonus, ownerReady } = audit46Scoring
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E098 N1 first occupation Prodigy snapshots every existing major and minor but a second occupation gives zero',()=>{for(const[improvements,prior,expected]of[[0,false,0],[1,false,1],[2,false,2],[2,true,0]] as const){const s=make(PRODIGY,false,state=>{const p=state.players[0]!;p.improvements=improvements?['Major_Fireplace1']:[];p.minorPlayed=improvements===2?['B004_WoodPile']:[];if(prior)p.occupationPlayed=['A116_WoodCutter']}),r=lesson(s,PRODIGY);assert.equal(bonus(r,PRODIGY),expected);save(`E098-N1-${improvements}-${prior}`,r)}})
  it('E098 N2 a real improvement played after Prodigy never increases its snapshotted point count',()=>{const s=make(PRODIGY,false,state=>state.players[0]!.improvements=['Major_Fireplace1']),bought=lesson(s,PRODIGY);ownerReady(s);let r=ok(s.takeAction(0,'meeting-place'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'&&r.interaction.request.options.some(o=>o.value.startsWith('action-improvement-')))choose(s,r,o=>o.value.startsWith('action-improvement-'));r=ok(s.resolveChoice(0,'E082_Profiteering'));assert.ok(r.state.players[0]!.minorPlayed.includes('E082_Profiteering'));assert.equal(bonus(bought,PRODIGY),1);assert.equal(bonus(r,PRODIGY),1);save('E098-N2',{bought,r})})
  it('E098 N3 real Lessons undo removes Prodigy points and legal replay grants the same snapshot once',()=>{const s=make(PRODIGY,false,state=>{state.players[0]!.improvements=['Major_Fireplace1'];state.players[0]!.minorPlayed=['B004_WoodPile']}),a=lesson(s,PRODIGY),u=ok(s.undoAction());assert.equal(bonus(u,PRODIGY),0);const r=lesson(s,PRODIGY);assert.equal(bonus(a,PRODIGY),2);assert.equal(bonus(r,PRODIGY),2);save('E098-N3',{a,u,r})})
})
