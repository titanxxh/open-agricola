// Helpers of ae-negative-26-barter-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const CARD='E009_BarteringHut'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/26-barter-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,`${r.error} ${JSON.stringify(r.interaction)}`);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,round=5,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorHand=[card,'B004_WoodPile','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function ready(s:GameSession,accept=true){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r,accept);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){r=passPreparationExchanges(s,r);if(r.interaction.stateId!=='wait')break;const i=r.interaction;if(i.request.kind==='select-trigger'){const option=i.request.options.find(o=>!('disabled'in o&&o.disabled)&&o.value!=='__pass__'&&o.labelKey!=='actions.exchange.name');assert.ok(option,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,option.value));continue}if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'plow');r=ok(s.commitSelectionChoice(i.playerIndex,{tile:i.request.farm.selectableTiles[0]!}))}else{assert.ok(i.request.kind==='choice',JSON.stringify(i));const options:import('../../shared/contract/types').ActionChoiceOption[]=i.request.options,o=(accept?options.find(o=>!o.disabled&&!['__skip__','__done__','__pass__'].includes(o.value)&&o.labelKey!=='actions.exchange.name'):undefined)??options.find(o=>!o.disabled&&['__skip__','__done__','__pass__'].includes(o.value));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function menu(s:GameSession){ready(s);let r=ok(s.takeAction(0,'meeting-place'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');return r}
export type Good='wood'|'clay'|'reed'|'stone'
export type Animal='sheep'|'boar'|'cattle'
export function make(goods:Partial<Record<Good,number>>={}){return setup(CARD,14,state=>{const p=state.players[0]!;Object.assign(p.resources,goods);p.pastures=[{id:'barter-first',tiles:[{row:0,col:1}],animalType:null,animalCount:0},{id:'barter-second',tiles:[{row:0,col:2}],animalType:null,animalCount:0}];p.fenceSegments=['H-0-1','H-1-1','V-0-1','V-0-2','H-0-2','H-1-2','V-0-3'].map(edge=>({edge,type:'fence' as const,source:{kind:'own' as const,ownerPlayerId:p.id}}));})}
export function buy(s:GameSession){const pending=menu(s),r=ok(s.resolveChoice(0,CARD));assert.ok(r.state.players[1]!.minorHand.includes(CARD));return{pending,r}}
export function trade(s:GameSession,r:SessionResponse,animal:Animal,payments:Good[]){
 assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');
 const before=structuredClone(r.state.players[0]!.resources),expected=Object.fromEntries((['wood','clay','reed','stone']as const).map(g=>[g,payments.filter(p=>p===g).length]));
 const a=r.interaction.request.options.find(o=>o.effectPreview&&'resourcesGained'in o.effectPreview&&o.effectPreview.resourcesGained?.[animal]===1);assert.ok(a,JSON.stringify(r.interaction));r=ok(s.resolveChoice(0,a.value));
 for(let n=0;n<24;n++){
  if(r.interaction.stateId!=='wait'||r.interaction.request.kind==='confirm-next-player')break;save(`E009-trade-${animal}-${n}`,r);const i=r.interaction;
  if(i.request.kind==='animal-reorg'){const remaining={sheep:r.state.players[0]!.resources.sheep,boar:r.state.players[0]!.resources.boar,cattle:r.state.players[0]!.resources.cattle},kinds=(['sheep','boar','cattle']as const).filter(k=>remaining[k]);const zones=i.request.zones.filter(z=>z.zoneType==='pasture').map((z,j)=>({...z,animalType:kinds[j]??null,animalCount:kinds[j]?remaining[kinds[j]!]:0}));r=ok(s.resolveChoice(0,'confirm',{zones}));continue}
  assert.ok(i.request.kind==='choice');const options=i.request.options.filter(o=>o.effectPreview&&'resourcesPaid'in o.effectPreview&&o.effectPreview.resourcesPaid);if(!options.length)break;
  const good=payments.find(g=>before[g]-r.state.players[0]!.resources[g]<(expected[g]??0));assert.ok(good,'unexpected extra payment');const o=options.find(o=>o.effectPreview&&'resourcesPaid'in o.effectPreview&&o.effectPreview.resourcesPaid?.[good]===1);assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(0,o.value));
 }
 for(const g of ['wood','clay','reed','stone']as const)assert.equal(before[g]-r.state.players[0]!.resources[g],expected[g]);return r
}
export function decline(s:GameSession,r:SessionResponse){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');assert.ok(r.interaction.request.options.some(o=>o.value==='__skip__'));return ok(s.resolveChoice(0,'__skip__'))}
