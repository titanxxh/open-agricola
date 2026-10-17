// Helpers of ae-negative-15-reserve-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const CARD='A136_DrudgeryReeve'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/15-reserve-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(sets:number[],configure:(state:GameState)=>void=()=>{},played=true,round=14){const s=createWorkSession({seed:4242,options:{playerCount:3},configure(state){state.round=round;for(const [i,p]of state.players.entries())Object.assign(p.resources,{food:60,wood:sets[i]??0,clay:sets[i]??0,reed:sets[i]??0,stone:sets[i]??0,grain:0,vegetable:0});state.players[0]!.occupationPlayed=played?[CARD]:[];state.players[0]!.occupationHand=played?['__test_placeholder__']:[CARD,'A110_Roughcaster'];configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function start(s:GameSession){for(const[actor,space]of [[0,'grain-seeds'],[1,'forest'],[2,'reed-bank'],[0,'day-laborer'],[1,'clay-pit'],[2,'fishing']] as const)turn(s,actor,space);return advance(s,confirmNext(s,s.getState()))}
export function advance(s:GameSession,r:SessionResponse){for(let n=0;n<24&&r.interaction.stateId==='wait';n++){const i=r.interaction;if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.fromPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='select-trigger'){const o=i.request.options.find(o=>o.value===CARD);assert.ok(o);r=ok(s.resolveChoice(i.playerIndex,o.value))}else if(i.request.kind==='choice'&&i.promptKey!=='ui.cards.A136_DrudgeryReeve.prompt'){const o=i.request.options.find(o=>o.value==='__skip__'||o.value==='__done__');assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}else break}return r}
export function menu(r:SessionResponse,owner:number,max:number){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');assert.equal(r.interaction.playerIndex,owner);assert.equal(r.interaction.promptKey,'ui.cards.A136_DrudgeryReeve.prompt');assert.deepEqual(r.interaction.request.options.map(o=>o.value),Array.from({length:max+1},(_,i)=>`${CARD}:sets:${i}`))}
export function choose(s:GameSession,r:SessionResponse,count:number){assert.ok(r.interaction.stateId==='wait');return advance(s,ok(s.resolveChoice(r.interaction.playerIndex,`${CARD}:sets:${count}`)))}
export function bonus(r:SessionResponse,owner:number){assert.ok(r.scores);return r.scores[owner]!.categories.find(c=>c.key==='cardBonusVp')?.entries.filter(e=>e.type==='bonus'&&e.cardId===CARD).reduce((n,e)=>n+e.score,0)??0}
