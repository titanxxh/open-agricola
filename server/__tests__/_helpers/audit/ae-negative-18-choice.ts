// Helpers of ae-negative-18-choice-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { descriptionEffects } from '../choice-description'
import { confirmNext } from '../negative-rule-audit'

export const CARD='B009_BeatingRod'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/18-choice-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(reed=0){const s=createWorkSession({seed:4242,options:{playerCount:2},configure(state){state.round=14;for(const p of state.players)Object.assign(p.resources,{food:20,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});state.players[0]!.resources.reed=reed;state.players[0]!.minorHand=[CARD,'A030_BakingSheet','A006_StorageBarn']}});sessions.push(s);return s}
export function buy(s:GameSession){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);r=ok(s.takeAction(0,'meeting-place'));for(let n=0;n<5;n++){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');const c=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(!c)break;r=ok(s.resolveChoice(0,c.value))}return ok(s.resolveChoice(0,CARD))}
export function choose(s:GameSession,r:SessionResponse,type:'reed'|'cattle'){for(let n=0;n<12&&r.interaction.stateId==='wait'&&r.interaction.request.kind!=='confirm-next-player';n++){const i=r.interaction;if(i.request.kind==='animal-reorg')r=ok(s.resolveChoice(i.playerIndex,'confirm',{zones:i.request.zones}));else{assert.ok(i.request.kind==='choice');const c=i.request.options.find(o=>!o.disabled&&descriptionEffects(o.descriptionPreview).some(e=>(e.kind==='resourceBundle'&&e.resources[type]===1)||(e.kind==='resourceExchange'&&e.resourcesGained?.[type]===1)));assert.ok(c,JSON.stringify(i));r=ok(s.resolveChoice(0,c.value))}}return r}
