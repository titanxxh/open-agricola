import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'
import { collectScheduledEffectPreviews } from '../../shared/actions/scheduled-effect-preview'
import '../../shared/cards/C/C155_FoodDistributor'
import assert from 'node:assert/strict'
import * as audit55Phase from './_helpers/audit/ae-negative-55-phase'

const CARD_ID = 'C155_FoodDistributor'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = (purchaseRound = 5, occupied = 2) => {
  const session = createWorkSession({ seed: 6155, options: { playerCount: 4 }, configure: state => {
    state.round = 5
    state.players.forEach(player => { player.resources.food = 30; markAllWorkersUsed(state, player) })
    const owner = state.players[0]!
    owner.resources.grain = 0
    owner.occupationPlayed = [CARD_ID]
    owner.cardStates[CARD_ID] = { extraData: { purchaseRound } }
    state.roundActionOrder.slice(0, occupied).forEach((id, index) => {
      const space = state.actionSpaces.find(entry => entry.id === id)
      if (space) space.takenBy = [{ playerId: state.players[index]!.id, workerId: '1' }]
    })
  } })
  sessions.push(session)
  return session
}

describe('C155 authoritative timed reward', () => {
  it('describes the future occupancy formula without mutating state, then counts distinct round action spaces at return home', () => {
    const session = setup()
    const before = JSON.stringify(session.state)
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks)).find(entry => entry.sourceCard === CARD_ID))
      .toMatchObject({ round: 5, timing: 'onStartReturnHome', description: { effectPreview: { kind: 'formulaGain', resources: { food: { kind: 'occupied-round-spaces' } } } } })
    expect(JSON.stringify(session.state)).toBe(before)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(32)
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID && event.resources.food === 2)).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.timedRuleReceipts).toEqual(['occupied-round-reward:5'])
    expect(response.interaction.stateId).toBe('idle')
  })
  it('does not pay in a later round or promise another payout after consumption', () => {
    const session = setup(4)
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks)).filter(entry => entry.sourceCard === CARD_ID)).toEqual([])
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(30)
  })
  it('pays zero when no round action space is occupied', () => {
    const session = setup(5, 0)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(30)
  })
})

describe('ae-negative-55-phase', () => {
  const { sessions, ok, save, make, finish, play, ready, transition } = audit55Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('C155 N1 real purchase gives one grain and this returning home pays one food for each of three actually occupied round spaces',()=>{const s=make('C155_FoodDistributor',st=>{st.actionSpaces.find(a=>a.id==='western-quarry')!.resources.stone=1},false,13),purchased=finish(s,play(s,'C155_FoodDistributor'));assert.equal(purchased.state.players[0]!.resources.grain,1);assert.equal(purchased.state.players[0]!.resources.food,100);for(const[actor,space]of[[1,'sheep-market'],[2,'western-quarry'],[3,'vegetable-seeds'],[0,'grain-seeds'],[1,'day-laborer'],[2,'forest'],[3,'clay-pit']]as const){assert.equal(ready(s).state.currentPlayerIndex,actor);finish(s,ok(s.takeAction(actor,space)));}const before=s.getState();assert.equal(before.state.actionSpaces.filter(a=>before.state.roundActionOrder.includes(a.id)&&a.takenBy.length>0).length,3);const returned=transition(s,14);assert.equal(returned.state.players[0]!.resources.food,99);assert.equal(returned.state.players[0]!.resources.grain,2);save('C155-N1',{purchased,before,returned})})
  it('C155 N2 subsequent returning home and card only in hand cannot pay another occupied-round reward while real purchase undo restores grain and round fact',()=>{const s=make('C155_FoodDistributor',undefined,false,5),purchased=finish(s,play(s,'C155_FoodDistributor')),u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.grain,0);assert.equal(u.state.players[0]!.cardStates.C155_FoodDistributor?.extraData?.purchaseRound,undefined);const hand=make('C155_FoodDistributor',undefined,false,5),handNext=transition(hand,6);assert.equal(handNext.state.players[0]!.cardStates.C155_FoodDistributor?.extraData?.purchaseRound,undefined);const later=make('C155_FoodDistributor',st=>{st.players[0]!.cardStates.C155_FoodDistributor={extraData:{purchaseRound:4}}},true,5),next=transition(later,6);assert.equal(next.state.players[0]!.resources.food,100);save('C155-N2',{purchased,u,handNext,next})})
})
