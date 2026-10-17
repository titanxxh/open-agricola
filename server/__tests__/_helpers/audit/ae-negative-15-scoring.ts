// Helpers of ae-negative-15-scoring-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, FarmTilePosition } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { takeMajorImprovementFromSupply } from '../../../../shared/cards/major/supply'

export const BRAG='A133_Braggart',FULL='A134_FullFarmer',REEVE='A135_AnimalReeve'
export const MINORS=['A014_CarpentersHammer', 'A031_DebtSecurity', 'A037_Bucksaw', 'A040_PottersYard', 'A045_FireProtectionPond', 'A047_Trellises', 'A051_DriftNetBoat', 'A056_Basket', 'A063_DutchWindmill', 'A068_AsparagusGift', 'A069_LargeGreenhouse']
export const MAJORS=['Major_Fireplace1','Major_Fireplace2','Major_Joinery','Major_Pottery','Major_Basket']
export const sessions:GameSession[]=[]
export const output=process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR??'output/ae-negative/15-scoring-probes'
export function save(id:string,value:unknown){fs.mkdirSync(output,{recursive:true});fs.writeFileSync(`${output}/${id}.json`,JSON.stringify(value,null,2))}
export function ok(r:SessionResponse){assert.equal(r.ok,true,r.error);return r}
export function setup(card:string,configure:(state:GameState)=>void=()=>{},played=true,owner=0,round=14){const s=createWorkSession({seed:4242,options:{playerCount:3},configure(state){state.round=round;for(const p of state.players)Object.assign(p.resources,{food:40,wood:0,clay:0,reed:0,stone:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0});state.players[owner]!.occupationPlayed=played?[card]:[];state.players[owner]!.occupationHand=played?['__test_placeholder__']:[card,'A110_Roughcaster'];configure(state);for(const p of state.players)for(const id of p.improvements)takeMajorImprovementFromSupply(state,id)}});sessions.push(s);assert.equal(s.getState().state.players.length,3);return s}
export function bonus(r:SessionResponse,card:string,owner=0){assert.ok(r.scores);return r.scores[owner]!.categories.find(c=>c.key==='cardBonusVp')?.entries.filter(e=>e.type==='bonus'&&e.cardId===card).reduce((v,e)=>v+e.score,0)??0}
export function read(s:GameSession,card:string,expected:number,owner=0){const r=s.getState();assert.equal(bonus(r,card,owner),expected);assert.equal(bonus(s.getState(),card,owner),expected);return r}
export function play(s:GameSession,card:string){let r=ok(s.takeAction(0,'lessons'));for(let n=0;n<6&&!r.state.players[0]!.occupationPlayed.includes(card);n++){assert.ok(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice');r=ok(s.resolveChoice(0,card))}return r}
export function pasture(state:GameState,tiles:FarmTilePosition[],type:'sheep'|'boar'|'cattle',count:number,owner=0,stable=false){const p=state.players[owner]!;p.pastures.push({id:`p${p.pastures.length}`,tiles,animalType:type,animalCount:count});p.resources[type]+=count;if(stable)p.stableTiles.push({...tiles[0]!});const edges=new Set<string>();for(const {row,col} of tiles)for(const e of [`H-${row}-${col}`,`H-${row+1}-${col}`,`V-${row}-${col}`,`V-${row}-${col+1}`]){if(edges.has(e))edges.delete(e);else edges.add(e)}for(const edge of edges)if(!p.fenceSegments.some(s=>s.edge===edge))p.fenceSegments.push({edge,type:'fence',source:{kind:'own',ownerPlayerId:p.id}})}
export function animals(state:GameState,owner:number,n:number){pasture(state,[{row:0,col:1},{row:0,col:2}],'sheep',n,owner);pasture(state,[{row:1,col:1},{row:1,col:2}],'boar',n,owner);pasture(state,[{row:2,col:1},{row:2,col:2}],'cattle',n,owner)}
