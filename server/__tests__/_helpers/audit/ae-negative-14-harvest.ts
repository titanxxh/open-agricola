// Helpers of ae-negative-14-harvest-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, CropStack } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'

export const SCYTHE='A112_ScytheWorker',TREE='A118_Treegardener'
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/14-harvest-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,stacks:CropStack[]=[],configure:(state:GameState)=>void=()=>{},played=true,round=4){const s=createWorkSession({seed:4242,configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0});const p=state.players[0]!;p.occupationPlayed=played?[card]:[];p.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];p.fields=stacks.map((stack,col)=>({row:0,col:col+1,stacks:[stack]}));configure(state)}});sessions.push(s);return s}
export function turn(s:GameSession,actor:number,space:string){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle');assert.equal(r.state.currentPlayerIndex,actor);return ok(s.takeAction(actor,space))}
export function end(s:GameSession){turn(s,0,'grain-seeds');turn(s,1,'reed-bank');turn(s,0,'forest');return confirmNext(s,turn(s,1,'clay-pit'))}
export function harvest(s:GameSession,r:SessionResponse,card:string,positions:{row:number,col:number}[]|null=null,purchase=0){for(let n=0;n<30&&r.interaction.stateId==='wait';n++){const i=r.interaction;save(`pending-${card}-${n}`,r);if(i.request.kind==='confirm-next-player')r=confirmNext(s,r);else if(i.request.kind==='confirm-player-switch')r=ok(s.resolveChoice(i.request.toPlayerIndex,'confirm'));else if(i.request.kind==='feed')r=ok(s.resolveChoice(i.playerIndex,'confirm',{selections:[]}));else if(i.request.kind==='select-trigger'){const o=i.request.options.find(o=>JSON.stringify(o).includes(card))??i.request.options[0];assert.ok(o);r=ok(s.resolveChoice(i.playerIndex,o.value))}else if(i.request.kind==='choice'){const skip=i.request.options.find(o=>o.value==='__skip__'||o.value==='__done__');const wants=card===SCYTHE?positions!==null:purchase>0;const o=wants?i.request.options.find(o=>o.value!=='__skip__'&&o.value!=='__done__'&&(card===SCYTHE||(o.effectPreview&&'resourcesPaid' in o.effectPreview&&o.effectPreview.resourcesPaid?.food===purchase))):skip;assert.ok(o,JSON.stringify(i));r=ok(s.resolveChoice(i.playerIndex,o.value))}else if(i.request.kind==='selection'){assert.ok(positions);r=ok(s.commitSelectionChoice(i.playerIndex,{positions}));positions=null}else assert.fail(JSON.stringify(i))}assert.equal(r.interaction.stateId,'idle');return r}
