// Helpers of ae-negative-06-improvements-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameState, PlayerState } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'
import { markAllWorkersUsed, workersAtHome } from '../../../../shared/domain/player'
import '../../../../shared/cards/A/A027_OvenSite'
import '../../../../shared/cards/A/A028_ForestSchool'
import '../../../../shared/cards/A/A029_AleBenches'
import '../../../../shared/cards/A/A060_OrientalFireplace'
import '../../../../shared/cards/A/A123_FrameBuilder'

export const OVEN='A027_OvenSite', SCHOOL='A028_ForestSchool', ALE='A029_AleBenches'
export const sessions: GameSession[]=[]
export function setup(card:string,{played=false,players=2,round=14,occupations=0,resources={},configure=()=>{}}:{played?:boolean;players?:number;round?:number;occupations?:number;resources?:Partial<PlayerState['resources']>;configure?:(state:GameState)=>void}={}){
  const s=createWorkSession({seed:4242,options:{playerCount:players},configure(state){
    state.round=round
    state.players.forEach(p=>{p.minorHand=['B007_Wage','A054_Credit'];p.occupationHand=[p===state.players[0]?'A123_FrameBuilder':'A116_WoodCutter'];p.minorPlayed=[];p.occupationPlayed=[];Object.assign(p.resources,{wood:0,clay:0,reed:0,stone:0,food:20,grain:0,vegetable:0,sheep:0,boar:0,cattle:0})})
    const p=state.players[0]!
    if(played)p.minorPlayed=[card];else p.minorHand.push(card)
    p.occupationPlayed=['B121_Geologist','C123_Freemason'].slice(0,occupations)
    Object.assign(p.resources,resources);configure(state)
  }});sessions.push(s);return s
}
export function major(state:GameState,actor:number,card:string){state.players[actor]!.improvements.push(card);state.availableMajorImprovements=state.availableMajorImprovements.filter(id=>id!==card)}
export function oven(options:{fireplace?:boolean;hearth?:boolean;oriental?:boolean;resources?:Partial<PlayerState['resources']>;configure?:(state:GameState)=>void}={}){
 return setup(OVEN,{resources:options.resources,configure(state){if(options.fireplace!==false){if(options.oriental)state.players[0]!.minorPlayed.push('A060_OrientalFireplace');else major(state,0,'Major_Fireplace1')}if(options.hearth!==false)major(state,0,'Major_CookingHearth1');options.configure?.(state)}})
}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function choices(r:SessionResponse){ok(r);assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));return r.interaction.request.options}
export function enter(s:GameSession,space='meeting-place'){
 let r=ok(s.takeAction(0,space));const branch=choices(r).find(o=>o.value.startsWith('action-improvement-'));if(branch)r=ok(s.resolveChoice(0,branch.value));return r
}
export function buy(s:GameSession,r:SessionResponse,card:string){assert.ok(choices(r).some(o=>o.value===card&&!o.disabled));const result=ok(s.resolveChoice(0,card));assert.equal(result.state.players[0]!.minorPlayed.includes(card),true);assert.equal(result.state.players[0]!.minorHand.includes(card),false);const events=result.state.events.filter(e=>e.type==='card.played'&&e.cardId===card);if(card===OVEN&&result.interaction.stateId==='wait'&&result.interaction.request.kind==='choice'){assert.equal(events.length,0);return result}assert.equal(events.length,1);const event=events[0]!;assert.ok(event.type==='card.played');assert.equal(event.actorPlayerId,result.state.players[0]!.id);assert.deepEqual(event.payment?.resources??{},card===OVEN?{}:card===SCHOOL?{wood:1,clay:1}:card===ALE?{wood:1}:{});return result}
export function ovenCompleted(r:SessionResponse){const events=r.state.events.filter(e=>e.type==='card.played'&&e.cardId===OVEN);assert.equal(events.length,1);const event=events[0]!;assert.ok(event.type==='card.played');assert.deepEqual(event.payment?.resources??{},{});const gains=r.state.events.filter(e=>e.type==='resource.moved'&&e.sourceCardId===OVEN&&e.reason==='cardEffect');assert.equal(gains.length,1);const gain=gains[0]!;assert.ok(gain.type==='resource.moved');assert.deepEqual(gain.resources,{wood:2})}
export function skip(s:GameSession,r:SessionResponse){assert.ok(choices(r).some(o=>o.value==='__skip__'));const result=ok(s.resolveChoice(0,'__skip__'));if(result.state.players[0]!.minorPlayed.includes(OVEN))ovenCompleted(result);return result}
export function accept(s:GameSession,r:SessionResponse,actor=0){const choice=choices(r).find(o=>o.value!=='__skip__'&&!o.disabled);assert.ok(choice);return ok(s.resolveChoice(actor,choice.value))}
export function ready(s:GameSession,actor:number){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));assert.equal(r.state.currentPlayerIndex,actor);return r}
export function turn(s:GameSession,actor:number,space:string){ready(s,actor);return ok(s.takeAction(actor,space))}
export function offered(r:SessionResponse,card:string){return choices(r).some(o=>o.value===card&&!o.disabled)}
export function ovenPurchase(s:GameSession,card:string){let r=buy(s,enter(s),OVEN);assert.equal(r.state.players[0]!.resources.wood,2);r=accept(s,r);assert.ok(offered(r,card));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'Major_Joinery'));r=ok(s.resolveChoice(0,card));assert.equal(r.state.players[0]!.improvements.includes(card),true);assert.deepEqual([r.state.players[0]!.resources.clay,r.state.players[0]!.resources.stone,r.state.players[0]!.resources.wood],[0,0,2]);const events=r.state.events.filter(e=>e.type==='card.played'&&e.cardId===card);assert.equal(events.length,1);const event=events[0]!;assert.ok(event.type==='card.played');assert.deepEqual(event.payment?.resources,{clay:1,stone:1});ovenCompleted(r);return r}
export function occupation(s:GameSession,r:SessionResponse,actor:number,paid:{wood:number;food:number}){
 const card=actor===0?'A123_FrameBuilder':'A116_WoodCutter'
 if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'&&r.interaction.request.options.some(o=>o.value===card))r=ok(s.resolveChoice(actor,card))
 if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){
  const option=choices(r).find(o=>o.effectPreview&&'resourcesPaid'in o.effectPreview&&(o.effectPreview.resourcesPaid?.wood??0)===paid.wood&&(o.effectPreview.resourcesPaid?.food??0)===paid.food);assert.ok(option,JSON.stringify(r.interaction));assertRejectedUnchanged(s,()=>s.resolveChoice(actor,'pay:occupation:forged'));r=ok(s.resolveChoice(actor,option.value))
 }
 assert.equal(r.state.players[actor]!.occupationPlayed.includes(card),true);assert.equal(r.state.players[actor]!.occupationHand.includes(card),false)
 const events=r.state.events.filter(e=>e.type==='card.played'&&e.cardId===card&&e.actorPlayerId===r.state.players[actor]!.id);assert.equal(events.length,1);const event=events[0]!;assert.ok(event.type==='card.played');assert.deepEqual(event.payment?.resources??{},Object.fromEntries(Object.entries(paid).filter(([,n])=>n>0)));return r
}
export function occupiedSchool({played=true,other=false,players=2,resources={wood:1,food:0},occupations=1,space='lessons'}:{played?:boolean;other?:boolean;players?:number;resources?:Partial<PlayerState['resources']>;occupations?:number;space?:string}={}){
 const s=setup(SCHOOL,{played,players,round:5,occupations,resources,configure(state){if(other)state.players[1]!.minorPlayed=[SCHOOL]}})
 turn(s,0,'grain-seeds');occupation(s,turn(s,1,space),1,{wood:0,food:space==='lessons-3'?2:0});if(players===3)turn(s,2,'forest');ready(s,0);return s
}
export function returnHome({grain=2,players=2,field=false,otherGrain=0}={}){
 const s=setup(ALE,{played:true,players,round:3,occupations:2,resources:{grain,food:0},configure(state){state.players.forEach(p=>{p.resources.food=0;markAllWorkersUsed(state,p)});state.players[1]!.resources.grain=otherGrain;if(field)state.players[0]!.fields=[{row:0,col:2,stacks:[{kind:'grain',remaining:3}]}]}})
 const r=ok(s.performRoundEnd());return {s,r}
}
export function reward(r:SessionResponse,grain:number,bonus:number,players=2){assert.equal(r.state.players[0]!.resources.grain,grain);assert.equal(r.state.players[0]!.resources.food,0);for(let n=1;n<players;n++)assert.equal(r.state.players[n]!.resources.food,bonus);assert.equal(r.state.players[0]!.cardStates[ALE]?.counters?.bonusVp??0,bonus);assert.ok(r.scores);const category=r.scores[0]!.categories.find(c=>c.key==='cardBonusVp');assert.equal(category?.entries?.find(e=>e.type==='bonus'&&e.cardId===ALE)?.score??0,bonus);for(const player of r.state.players)assert.equal(workersAtHome(r.state,player).length,2);const payments=r.state.events.filter(e=>e.type==='resource.paid'&&e.sourceCardId===ALE);assert.equal(payments.length,bonus);if(bonus){const payment=payments[0]!;assert.ok(payment.type==='resource.paid');assert.deepEqual(payment.resources,{grain:1});const gifts=r.state.events.filter(e=>e.type==='resource.moved'&&e.sourceCardId===ALE&&e.resources.food===1);assert.equal(gifts.length,players-1);for(let i=1;i<players;i++){const gift=gifts[i-1]!;assert.ok(gift.type==='resource.moved');assert.deepEqual(gift.resources,{food:1});assert.deepEqual(gift.to,{kind:'player',playerId:r.state.players[i]!.id})}}}
