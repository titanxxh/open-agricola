import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B035_HookKnife'
import type { AnytimeAction } from '../../shared/contract/types';
import assert from 'node:assert/strict'
import * as audit19Animals from './_helpers/audit/ae-negative-19-animals'

const CARD_ID = 'B035_HookKnife'

describe('B035_HookKnife session', () => {
  const setup = (sheep = 0, playerCount = 2) => {
    const session = new GameSession(undefined, undefined, { playerCount })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, playerCount)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push(CARD_ID)
    player.resources.sheep = sheep
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('2-player: not available with 7 sheep (threshold is 8)', () => {
    const session = setup(7, 2)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('B35-hook-knife-anytime')
  })

  it('2-player: available with 8 sheep, grants 2 VP', () => {
    const session = setup(8, 2)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('B35-hook-knife-anytime')

    const resp2 = session.takeAnytimeAction(0, 'B35-hook-knife-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.cardStates?.B035_HookKnife?.counters?.bonusVp).toBe(2)
  })

  it('3-player: threshold is 7, available with 7 sheep', () => {
    const session = setup(7, 3)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('B35-hook-knife-anytime')

    const resp2 = session.takeAnytimeAction(0, 'B35-hook-knife-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.cardStates?.B035_HookKnife?.counters?.bonusVp).toBe(2)
  })

  it('one-time only', () => {
    const session = setup(8, 2)
    enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, 'B35-hook-knife-anytime')
    expect(resp2.ok).toBe(true)
    expect(isCardFlagged(resp2.state.players[0]!, CARD_ID)).toBe(true)

    // Should no longer appear in anytime actions
    const anytimeIds = resp2.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('B35-hook-knife-anytime')
  })
})

describe('ae-negative-19-animals', () => {
  const { KNIFE, sessions, save, ok, setup, turn, buy, bonus, housing, resolveAnimals, knifeWindow, claimKnife } = audit19Animals
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B035 N1 actual one wood purchase at housed sheep threshold exposes one public two point action and lower threshold does not',()=>{for(const sheep of[7,8,9]){const s=setup(KNIFE,state=>{housing(state,sheep,3);state.players[0]!.stableTiles=[{row:0,col:1}];state.players[0]!.resources.wood=1},false),{pending,r}=buy(s,KNIFE);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(bonus(r,KNIFE),0);if(sheep>=8){const claimed=claimKnife(s);assert.equal(bonus(claimed.r,KNIFE),2);save(`B035-N1-${sheep}`,{pending,r,claimed})}else{const host=knifeWindow(s);assert.ok(!host.interaction.anytimeActions.some(a=>a.id==='B35-hook-knife-anytime'));assert.equal(bonus(host,KNIFE),0);save(`B035-N1-${sheep}`,{pending,r,host})}}})
  it('B035 N2 actual sheep gain crosses two three and four player thresholds and public claim is available only once',()=>{for(const players of[2,3,4]){const threshold=[0,9,8,7,6][players]!,s=setup(KNIFE,state=>{housing(state,threshold-1,3);state.players[0]!.stableTiles=[{row:0,col:1}];state.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=1},true,players);assert.equal(bonus(s.getState(),KNIFE),0);const pending=turn(s,0,'sheep-market'),acquired=resolveAnimals(s,pending,threshold);assert.equal(acquired.state.players[0]!.resources.sheep,threshold);const claimed=claimKnife(s);assert.equal(bonus(claimed.r,KNIFE),2);assert.equal(bonus(s.getState(),KNIFE),2);save(`B035-N2-${players}`,{pending,acquired,claimed})}})
  it('B035 N3 hand and overflow discarded sheep cannot enable bonus and undo acquisition restores sheep before retry and one claim',()=>{const overflow=setup(KNIFE,state=>{housing(state,6,3);state.players[0]!.houseAnimals = { '2-0': 'sheep' };state.players[0]!.resources.sheep=7;state.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=2});let op=turn(overflow,0,'sheep-market');if(op.interaction.stateId==='wait'&&op.interaction.request.kind==='animal-reorg'){const zones=op.interaction.request.zones.map(z=>z.id.startsWith('pasture:')?{...z,animalType:'sheep',animalCount:6,animalCounts:undefined}:z.id==='house:2-0'?{...z,animalType:'sheep',animalCount:1,animalCounts:undefined}:z);op=ok(overflow.resolveChoice(0,'confirm',{zones}))}const o=resolveAnimals(overflow,op),oh=knifeWindow(overflow);assert.equal(o.state.players[0]!.resources.sheep,7);assert.equal(bonus(oh,KNIFE),0);assert.ok(!oh.interaction.anytimeActions.some(a=>a.id==='B35-hook-knife-anytime'));const hand=setup(KNIFE,state=>{housing(state,8,3);state.players[0]!.stableTiles=[{row:0,col:1}]},false),h=knifeWindow(hand);assert.equal(bonus(h,KNIFE),0);assert.ok(!h.interaction.anytimeActions.some(a=>a.id==='B35-hook-knife-anytime'));const s=setup(KNIFE,state=>{housing(state,7,3);state.players[0]!.stableTiles=[{row:0,col:1}];state.actionSpaces.find(a=>a.id==='sheep-market')!.resources.sheep=1}),r=resolveAnimals(s,turn(s,0,'sheep-market'),8),undone=ok(s.undoAction());assert.equal(bonus(undone,KNIFE),0);assert.equal(undone.state.players[0]!.resources.sheep,7);const retry=resolveAnimals(s,turn(s,0,'sheep-market'),8),claimed=claimKnife(s);assert.equal(bonus(claimed.r,KNIFE),2);save('B035-N3',{o,oh,h,r,undone,retry,claimed})})
})
