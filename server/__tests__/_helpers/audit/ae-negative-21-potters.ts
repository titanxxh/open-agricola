// Helpers of ae-negative-21-potters-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B069_PottersMarket'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/21-potters-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function setup(card:string,round=5,configure:(state:GameState)=>void=()=>{}){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.minorHand=[card,'B004_WoodPile','A006_StorageBarn'];configure(state)}});sessions.push(s);return s}
export function ready(s:GameSession,accept=true){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r,accept);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'plow');r=ok(s.commitSelectionChoice(i.playerIndex,{tile:i.request.farm.selectableTiles[0]!}))}else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const options=i.request.options,o=options.find(o=>(!('disabled'in o)||!o.disabled)&&(accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__'));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function menu(s:GameSession){ready(s);let r=ok(s.takeAction(0,'meeting-place'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}return r}
export function buy(s:GameSession,card:string){const pending=menu(s),r=finish(s,ok(s.resolveChoice(0,card)));if(['B004_WoodPile','A006_StorageBarn'].includes(card)){assert.ok(!r.state.players[0]!.minorPlayed.includes(card));assert.ok(r.state.players[1]!.minorHand.includes(card))}else assert.ok(r.state.players[0]!.minorPlayed.includes(card));return{pending,r}}
export function reach(s:GameSession,target:number,accept=true){let r=s.getState();for(let n=0;n<64&&r.state.round<target;n++){r=ready(s,accept);if(r.state.round>=target)break;const actor=r.state.currentPlayerIndex,space=['grain-seeds','day-laborer','forest','clay-pit','reed-bank','fishing','vegetable-seeds'].find(id=>s.getActionAvailability(actor)[id]);assert.ok(space);r=finish(s,ok(s.takeAction(actor,space)),accept)}r=ready(s,accept);assert.equal(r.state.round,target);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export const ANYTIME='B69-potters-market-anytime'
export function queue(r:SessionResponse){return r.state.futureMeeples.filter(x=>x.cardId===CARD&&x.playerId===r.state.players[0]!.id).map(x=>({round:x.round,resources:x.resources})).sort((a,b)=>a.round-b.round)}
export function loaded(clay=6,food=100,played=true,round=5){return setup(CARD,round,state=>{const p=state.players[0]!;Object.assign(p.resources,{clay,food});p.minorPlayed=played?[CARD]:[];if(played)p.minorHand=['B004_WoodPile','A006_StorageBarn']})}
export function active(s:GameSession){return ok(s.takeAction(0,'farmland'))}
export function use(s:GameSession){return ok(s.takeAnytimeAction(0,ANYTIME))}
