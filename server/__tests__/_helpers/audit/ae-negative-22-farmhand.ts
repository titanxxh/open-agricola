// Helpers of ae-negative-22-farmhand-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B085_FarmHand'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/22-farmhand-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return JSON.parse(JSON.stringify(r)) as SessionResponse}
export function ready(s:GameSession,accept=true){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=finish(s,r,accept);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));return r}
export function finish(s:GameSession,r:SessionResponse,accept=true){for(let n=0;n<32&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else if(i.request.kind==='farm-select'){assert.equal(i.request.farm.farmType,'plow');r=ok(s.commitSelectionChoice(i.playerIndex,{tile:i.request.farm.selectableTiles[0]!}))}else{assert.ok(i.request.kind==='choice'||i.request.kind==='select-trigger',JSON.stringify(i));const options=i.request.options,o=options.find(o=>(!('disabled'in o)||!o.disabled)&&(accept?o.value!=='__skip__'&&o.value!=='__done__':o.value==='__skip__'||o.value==='__done__'));assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}}return JSON.parse(JSON.stringify(r)) as SessionResponse}
export const TILE={row:0,col:2},FIELDS=[TILE,{row:0,col:3},{row:1,col:2},{row:1,col:3}]
export function make(played=true,wood=2,fields=FIELDS,exhausted=false){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=8;const p=state.players[0]!;p.minorHand=['B004_WoodPile'];p.occupationHand=[CARD];p.occupationPlayed=played?[CARD]:[];p.fields=fields.map(t=>({...t,stacks:[]}));Object.assign(p.resources,{food:100,wood,clay:0,reed:0});state.players[1]!.resources.food=100;if(exhausted)p.stableTiles=[{row:0,col:0},{row:0,col:1},{row:2,col:2},{row:2,col:3}]}});sessions.push(s);return s}
export function select(s:GameSession){ready(s);let r=ok(s.takeAction(0,'farm-expansion'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.labelKey==='actions.stables.name');assert.ok(o);r=ok(s.resolveChoice(0,o.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='stable');return r}
export function build(s:GameSession){const pending=select(s),r=finish(s,ok(s.commitSelectionChoice(0,{farmHand:TILE})),false);return{pending,r}}
export function okCopy(r:SessionResponse){return JSON.parse(JSON.stringify(r))as SessionResponse}
