// Helpers of ae-negative-11-animal-housing-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { mkdirSync } from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, Resource } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { descriptionEffects } from '../choice-description'
import { assertRejectedUnchanged, confirmNext } from '../negative-rule-audit'

export const CROOK='A083_ShepherdsCrook', SILAGE='A084_Silage', TAMER='A086_AnimalTamer'
export const sessions: GameSession[] = []
export const silageAccepted = new WeakMap<SessionResponse,string>()
export const directory = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? `output/ae-negative/11-animal-housing-oa-${Date.now()}-${process.pid}`
mkdirSync(directory, { recursive: true })
export const evidence: unknown[] = []
export function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }
export function record(name: string, r: SessionResponse) { evidence.push({ name, serializedResponse: JSON.stringify(r) }); return r }
export function setup(card=CROOK,{played=true,round=14,resources={},fields=0,sheep=0,pigs=0,fieldGrain=0,market=2}:{played?:boolean;round?:number;resources?:Partial<Resource>;fields?:number;sheep?:number;pigs?:number;fieldGrain?:number;market?:number}={},configure:(state:GameState)=>void=()=>{}) {
 const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;state.availableMajorImprovements=[];for(const p of state.players){p.minorHand=['__test_placeholder__'];p.occupationHand=['__test_placeholder__'];p.minorPlayed=[];p.occupationPlayed=[];Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});assert.equal(p.workers.length,5);assert.equal(p.workers.filter(w=>w.isActive).length,2);}
 const p=state.players[0]!;p.minorHand=card===TAMER?['B007_Wage','A016_RammedClay']:[...(played?[]:[card]),'B007_Wage','A016_RammedClay'];p.occupationHand=card===TAMER&&!played?[TAMER,'A125_Priest']:['__test_placeholder__'];if(played)(card===TAMER?p.occupationPlayed:p.minorPlayed).push(card);Object.assign(p.resources,resources);p.fields=Array.from({length:fields},(_,i)=>({row:2,col:i+1,stacks:i===0&&fieldGrain?[{kind:'grain',remaining:fieldGrain}]:[]}));
 if(sheep||pigs){for(const[type,col,n]of [['sheep',1,sheep],['boar',3,pigs]]as const){if(!n)continue;p.pastures.push({id:type,tiles:[{row:0,col}],animalType:type,animalCount:n});p.stableTiles.push({row:0,col});p.resources[type]=n;for(const edge of rect(0,col,1,1))p.fenceSegments.push({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}});}}
 for(const[id,type,n]of[['sheep-market','sheep',market],['pig-market','boar',1],['cattle-market','cattle',1]]as const){const a=state.actionSpaces.find(a=>a.id===id);assert.ok(a);a.resources[type]=n;}
 configure(state);}});sessions.push(s);record('fixture',s.getState());return s;
}
export function options(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); return r.interaction.request.options }
export function choose(s: GameSession, r: SessionResponse, predicate: (o: { value: string; labelKey?: string; sourceCard?: string }) => boolean) { const o = options(r).find(predicate); assert.ok(o, JSON.stringify(r.interaction)); assert.ok(r.interaction.stateId === 'wait'); return record(`resolveChoice:${o.value}`, ok(s.resolveChoice(r.interaction.playerIndex, o.value))) }
export function buyMenu(s: GameSession) { let r = record('takeAction:meeting-place', ok(s.takeAction(0, 'meeting-place'))); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-'))) r = choose(s, r, o => o.value.startsWith('action-improvement-')); return r }
export function buy(s: GameSession, card: string) { const r = buyMenu(s); if (r.state.players[0]!.minorPlayed.includes(card)) return r; assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled))); return record(`buy:${card}`, ok(s.resolveChoice(0, card))) }
export function deny(s: GameSession, card: string) { let r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assert.equal(options(r).some(o=>o.value===card&&!('disabled' in o&&o.disabled)),false); record(`denied:${card}`, assertRejectedUnchanged(s, () => s.resolveChoice(0, card))); const food = r.state.players[0]!.resources.food; r = ok(s.resolveChoice(0, 'B007_Wage')); assert.equal(r.state.players[0]!.resources.food, food + 2); return r }
export function ready(s: GameSession, actor: number) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') r = record('confirm', confirmNext(s, r)); assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); assert.equal(r.state.currentPlayerIndex, actor); return r }
export function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return record(`takeAction:${actor}:${space}`, ok(s.takeAction(actor, space))) }
export function rect(row:number,col:number,height:number,width:number){return [...Array.from({length:width},(_,i)=>`H-${row}-${col+i}`),...Array.from({length:width},(_,i)=>`H-${row+height}-${col+i}`),...Array.from({length:height},(_,i)=>`V-${row+i}-${col}`),...Array.from({length:height},(_,i)=>`V-${row+i}-${col+width}`)];}
export function animalMenu(r:SessionResponse){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='animal-reorg',JSON.stringify(r.interaction));return r.interaction.request;}
export function settle(s:GameSession,r:SessionResponse){if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='animal-reorg')r=record('reorg-default',ok(s.resolveChoice(r.interaction.playerIndex,'confirm',{zones:r.interaction.request.zones})));return r;}
export function fence(s:GameSession,edges:string[],actor=0){const r=turn(s,actor,'fencing');assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select');return record('fence',ok(s.commitSelectionChoice(actor,{edges,extraWood:0})));}
export function complete(s:GameSession){turn(s,0,'reed-bank');turn(s,1,'forest');turn(s,0,'day-laborer');return record('natural-return',confirmNext(s,turn(s,1,'clay-pit')));}
export function choiceOptions(r:SessionResponse){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));return r.interaction.request.options;}
export function gainCount(r:SessionResponse,card:string){return r.state.log.filter(e=>e.key==='log.cardEffectGain'&&e.params?.cardId===card).length;}
export function silage(options:Parameters<typeof setup>[1]={},configure:(state:GameState)=>void=()=>{}){return setup(SILAGE,{round:5,fields:2,sheep:2,resources:{grain:1},...options},configure);}
export function silageBreed(s:GameSession,r:SessionResponse,type:'sheep'|'boar'|'cattle'='sheep',source='reserve'){
 if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='select-trigger')r=choose(s,r,o=>o.sourceCard===SILAGE);
 const species=choiceOptions(r).find(o=>descriptionEffects(o.descriptionPreview).some(effect=>effect.kind==='resourceExchange'&&effect.resourcesGained?.[type]===1));assert.ok(species,JSON.stringify(r.interaction));r=record('Silage-species',ok(s.resolveChoice(0,species.value)));
 if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){assert.ok(options(r).some(o=>o.value===source));r=record('Silage-payment',ok(s.resolveChoice(0,source)));}const result=settle(s,r);silageAccepted.set(result,species.value);return result;
}
export function next(s:GameSession,r:SessionResponse){if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')return record('next-natural',confirmNext(s,r));return r;}
export function tamer(options:Parameters<typeof setup>[1]={},configure:(state:GameState)=>void=()=>{}){return setup(TAMER,options,configure);}
export function playTamer(s:GameSession,type:'wood'|'grain'='wood'){let r=turn(s,0,'lessons');if(!r.state.players[0]!.occupationPlayed.includes(TAMER))r=record('play-Tamer',ok(s.resolveChoice(0,TAMER)));const choice=choiceOptions(r).find(o=>o.effectPreview?.kind==='resourceExchange'&&o.effectPreview.resourcesGained?.[type]===1);assert.ok(choice,JSON.stringify(r.interaction));r=record(`Tamer-${type}`,ok(s.resolveChoice(0,choice.value)));return{r,choice:choice.value};}
export function house(s:GameSession,r:SessionResponse,count:number,type:'sheep'|'boar'='sheep'){const q=animalMenu(r);const rooms=q.zones.filter(z=>z.zoneType==='house');assert.ok(rooms.length>=count);const zones=rooms.slice(0,count).map(z=>({...z,animalType:type,animalCount:1}));return record('Tamer-house',ok(s.resolveChoice(r.interaction.stateId==='wait'?r.interaction.playerIndex:0,'confirm',{zones})));}
