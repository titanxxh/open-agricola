// Helpers of ae-negative-10-farm-pay-sow-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import { appendFileSync, mkdirSync } from '../audit-evidence-fs'
import { it } from 'vitest'
import type { GameState, PlayerState, FarmTilePosition } from '../../../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext } from '../negative-rule-audit'
import { getAvailableStableSupplyCount, getOwnOrdinaryFenceReserveCount } from '../../../../shared/domain/supply-tokens'
import { takeMajorImprovementFromSupply } from '../../../../shared/cards/major/supply'
import { readCardResourceStats } from '../../../../shared/cards/helpers/card-state'
import '../../../../shared/cards/A/A073_AgriculturalFertilizers'
import '../../../../shared/cards/A/A075_LumberMill'
import '../../../../shared/cards/A/A079_GardenHoe'
import '../../../../shared/cards/A/A020_DoubleTurnPlow'
import '../../../../shared/cards/A/A115_ChiefForester'
import '../../../../shared/cards/A/A071_ClearingSpade'
import '../../../../shared/cards/A/A066_FeedingDish'
import '../../../../shared/cards/A/A078_Canoe'

export const FERT='A073_AgriculturalFertilizers', MILL='A075_LumberMill', HOE='A079_GardenHoe', PLOW='A020_DoubleTurnPlow'
export const OUT=process.env.AGRICOLA_NEGATIVE_OUTPUT_DIR??'output/ae-negative'
export const sessions:GameSession[]=[]
export function artifact(name:string,data:object){mkdirSync(OUT,{recursive:true});appendFileSync(`${OUT}/10-oa-actions-${process.env.AGRICOLA_NEGATIVE_RAW==='1'?'raw':'normal'}.jsonl`,JSON.stringify({name,...data})+'\n')}
export function scenario(name:string,run:()=>object){it(name,()=>{const actual=run();mkdirSync(OUT,{recursive:true});appendFileSync(`${OUT}/10-oa-facts-${process.env.AGRICOLA_NEGATIVE_RAW==='1'?'raw':'normal'}.jsonl`,JSON.stringify({name,actual})+'\n')})}
export function pasture(state:GameState,cols=[4]){const p=state.players[0]!;p.pastures=[{id:'actual-pasture',tiles:cols.map(col=>({row:2,col})),animalType:null,animalCount:0}];const edges=cols.flatMap(col=>[`H-2-${col}`,`H-3-${col}`]).concat([`V-2-${Math.min(...cols)}`,`V-2-${Math.max(...cols)+1}`]);p.fenceSegments=edges.map(edge=>({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}}))}
export function setup(card:string,{played=true,round=5,resources={},fields=2,pastureCols=[],minor=[],majors=[],occupations=0,configure=()=>{}}:{played?:boolean;round?:number;resources?:Partial<PlayerState['resources']>;fields?:number;pastureCols?:number[];minor?:string[];majors?:string[];occupations?:number;configure?:(state:GameState)=>void}={}){const s=createWorkSession({seed:4242,configure(state){state.round=round;state.players.forEach(p=>{p.minorHand=['B007_Wage','A016_RammedClay','A054_Credit'];p.occupationHand=['__test_placeholder__'];p.minorPlayed=[];p.occupationPlayed=[];p.improvements=[];Object.assign(p.resources,{wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,food:20,sheep:0,boar:0,cattle:0})});const p=state.players[0]!;p.minorPlayed=played?[card,...minor]:minor;if(!played)p.minorHand.push(card);p.occupationPlayed=['A116_WoodCutter','B116_Shoreforester','C109_SchnappsDistiller','D116_TreeInspector'].slice(0,occupations);p.fields=Array.from({length:fields},(_,n)=>({row:0,col:n+1,stacks:[]}));p.improvements=majors;majors.forEach(id=>takeMajorImprovementFromSupply(state,id));Object.assign(p.resources,resources);if(pastureCols.length)pasture(state,pastureCols);configure(state)}});sessions.push(s);assert.equal(s.getState().interaction.stateId,'idle');if(pastureCols.length)s.withCtx(()=>assert.equal(getOwnOrdinaryFenceReserveCount(s.state.players[0]!),15-(2*pastureCols.length+2)));return s}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function res(r:SessionResponse,actor=0){return r.state.players[actor]!.resources}
export function opts(r:SessionResponse){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice',JSON.stringify(r.interaction));return r.interaction.request.options}
export function ready(s:GameSession,actor:number){let r=s.getState();if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player')r=confirmNext(s,r);assert.equal(r.interaction.stateId,'idle',JSON.stringify(r.interaction));assert.equal(r.state.currentPlayerIndex,actor);return r}
export function turn(s:GameSession,actor:number,space:string){ready(s,actor);const r=ok(s.takeAction(actor,space));assert.ok(r.state.actionSpaces.find(a=>a.id===space)!.takenBy.some(w=>w.playerId===r.state.players[actor]!.id));return r}
export function close(s:GameSession,r:SessionResponse){if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'&&r.interaction.promptKey==='ui.interactionFarmExpansionSelect'&&opts(r).some(o=>o.value==='__done__'))return ok(s.resolveChoice(r.interaction.playerIndex,'__done__'));return r}
export function complete(r:SessionResponse){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='confirm-next-player',JSON.stringify(r.interaction));return r}
export function enter(s:GameSession,actor=0,space='meeting-place'){let r=turn(s,actor,space);const branch=opts(r).find(o=>o.value.startsWith('action-improvement-'));if(branch)r=ok(s.resolveChoice(actor,branch.value));return r}
export function purchase(s:GameSession,r:SessionResponse,card:string,actor=0){assert.ok(opts(r).some(o=>o.value===card&&!o.disabled));r=ok(s.resolveChoice(actor,card));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'&&r.interaction.promptKey==='prompt.selectPayment'){const choice=opts(r).find(o=>o.value!=='cancel');assert.ok(choice);r=ok(s.resolveChoice(actor,choice.value))}assert.ok(r.state.players[actor]!.minorPlayed.includes(card)||r.state.players[actor]!.improvements.includes(card));const events=r.state.events.filter(e=>'cardId' in e&&e.cardId===card&&'payment' in e);if(card!==PLOW)assert.equal(events.length,1);return r}
export function buy(s:GameSession,card:string){return complete(purchase(s,enter(s),card))}
export function deny(s:GameSession,card:string,space='meeting-place'){const r=enter(s,0,space);assert.equal(opts(r).some(o=>o.value===card&&!o.disabled),false);assertRejectedUnchanged(s,()=>s.resolveChoice(0,card));const retry=complete(purchase(s,r,'A016_RammedClay'));assert.ok(retry.state.players[0]!.minorHand.includes(card)||card.startsWith('Major_'));return retry}
export function farm(s:GameSession,kind:'stable'|'room',actor=0){let r=turn(s,actor,'farm-expansion');if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const choice=opts(r).find(o=>o.value.includes(kind==='stable'?'stables':'construct'));assert.ok(choice,JSON.stringify(r.interaction));r=ok(s.resolveChoice(actor,choice.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType===kind,JSON.stringify(r.interaction));return r}
export function stable(s:GameSession,tiles:FarmTilePosition[]=[{row:1,col:1},{row:1,col:2}],actor=0){farm(s,'stable',actor);const r=ok(s.commitSelectionChoice(actor,{stables:tiles}));assert.equal(r.state.players[actor]!.stableTiles.length,tiles.length);assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state,r.state.players[actor]!)),4-tiles.length);return close(s,r)}
export const TWO=['H-1-3','H-1-4','H-2-3','V-1-3','V-1-5'], ONE=['H-1-4','V-1-4','V-1-5']
export function fence(s:GameSession,two=true){turn(s,0,'fencing');const r=ok(s.commitSelectionChoice(0,{edges:two?TWO:ONE}));assert.equal(r.state.players[0]!.fenceSegments.length,two?9:7);assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(r.state.players[0]!)),two?6:8);return r}
export function offeredSow(r:SessionResponse){return r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'&&r.interaction.sourceCard===FERT&&r.interaction.request.options.some(o=>o.labelKey==='actions.sow.name'&&!o.disabled)}
export function sowSelect(s:GameSession,r:SessionResponse,actor=0){if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const choice=opts(r).find(o=>o.labelKey==='actions.sow.name'||o.value==='sow');assert.ok(choice,JSON.stringify(r.interaction));r=ok(s.resolveChoice(actor,choice.value))}assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='farm-select'&&r.interaction.request.farm.farmType==='sow',JSON.stringify(r.interaction));return r}
export function sow(s:GameSession,r:SessionResponse,crops:{row:number;col:number;crop:'grain'|'vegetable'}[],actor=0){sowSelect(s,r,actor);return complete(close(s,ok(s.commitSelectionChoice(actor,{crops}))))}
export function normalSow(s:GameSession,crops:{row:number;col:number;crop:'grain'|'vegetable'}[],actor=0){return sow(s,turn(s,actor,'grain-utilization'),crops,actor)}
export function stack(r:SessionResponse,col:number,actor=0){return r.state.players[actor]!.fields.find(f=>f.row===0&&f.col===col)?.stacks?.[0]?.remaining??0}
export function gain(r:SessionResponse,card:string,kind:'clay'|'stone'){return readCardResourceStats(r.state.players[0]!,card)?.gained[kind]??0}
export function reward(r:SessionResponse,clay:number,stone:number){assert.equal(res(r).clay,clay);assert.equal(res(r).stone,stone);assert.equal(gain(r,HOE,'clay'),clay);assert.equal(gain(r,HOE,'stone'),stone)}
export function undo(s:GameSession,before:string,retry:()=>SessionResponse){assertUndoRestored(before,s.undoAction());return retry()}
