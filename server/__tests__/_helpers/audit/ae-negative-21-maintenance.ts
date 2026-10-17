// Helpers of ae-negative-21-maintenance-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B055_MaintenancePremium'
export const OCCS=['A110_Roughcaster','A114_SeasonalWorker']
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/21-maintenance-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},round=8){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});const p=state.players[0]!;p.minorHand=[card,'B004_WoodPile','A006_StorageBarn'];p.occupationPlayed=OCCS.slice();configure(state)}});sessions.push(s);return s}
export function finish(s:GameSession,r:SessionResponse){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const o=i.request.options.find(o=>(!('disabled'in o)||!o.disabled)&&o.value==='__skip__')??i.request.options.find(o=>(!('disabled'in o)||!o.disabled)&&o.value==='__done__')??i.request.options.find(o=>(!('disabled'in o)||!o.disabled));assert.ok(o);r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function ready(s:GameSession){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function turn(s:GameSession,actor:number,space:string){const r=ready(s);assert.equal(r.state.currentPlayerIndex,actor);return finish(s,ok(s.takeAction(actor,space)))}
export function purchaseMenu(s:GameSession){ready(s);let r=ok(s.takeAction(0,'meeting-place'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));return r}
export function buy(s:GameSession,card:string){const pending=purchaseMenu(s);const r=finish(s,ok(s.resolveChoice(0,card)));if(['B004_WoodPile','A006_StorageBarn'].includes(card)){assert.ok(!r.state.players[0]!.minorPlayed.includes(card));assert.ok(r.state.players[1]!.minorHand.includes(card))}else assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function owner(s:GameSession){let r=ready(s);if(r.state.currentPlayerIndex!==0){const actor=r.state.currentPlayerIndex,space=['day-laborer','grain-seeds','clay-pit','reed-bank','fishing'].find(id=>s.getActionAvailability(actor)[id]);assert.ok(space);turn(s,actor,space);r=ready(s)}assert.equal(r.state.currentPlayerIndex,0);return r}
export function reach(s:GameSession,target:number){let r=s.getState();for(let n=0;n<64&&r.state.round<target;n++){r=ready(s);if(r.state.round>=target)break;const actor=r.state.currentPlayerIndex,space=['day-laborer','grain-seeds','clay-pit','reed-bank','fishing','vegetable-seeds'].find(id=>s.getActionAvailability(actor)[id]);assert.ok(space);turn(s,actor,space)}r=ready(s);assert.equal(r.state.round,target);return r}
export function stored(r:SessionResponse){return r.state.players[0]!.cardStates[CARD]?.extraData?.foodCount??0}
