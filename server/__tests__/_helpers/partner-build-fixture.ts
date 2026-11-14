import { rehydrateState, serializeSessionSnapshot } from '../../../shared/session/serialization'
import { afterEach, expect } from 'vitest'
import type { GameState } from '../../../shared/contract/types'
import type { TeamConfiguration } from '../../../shared/contract/team'
import { GameSession } from '../../game/authoritative-session'
import { createWorkSession } from './session-fixtures'

const sessions: GameSession[] = []
afterEach(() => { sessions.splice(0).forEach(session => session.dispose()) })
export const partnerTeam = {mode:'team',seatsPerTeam:2,seating:'separated',scoring:'sum',teammateVisibility:'private',cooperationRules:true} satisfies TeamConfiguration
export function partnerTable(configure: (state:GameState)=>void=()=>{}, options:{playerCount?:number;teamConfig?:TeamConfiguration;ordinary?:boolean;moor?:boolean}={}) {
  const session=createWorkSession({seed:1666,options:{playerCount:options.playerCount??(options.ordinary?2:4),enableFarmersOfTheMoor:options.moor,
    ...(options.ordinary?{}:{teamConfig:options.teamConfig??partnerTeam})},configure(state){
    state.round=14;state.currentPlayerIndex=0
    for(const space of state.actionSpaces)space.takenBy=[]
    for(const player of state.players){
      player.minorHand=['__test_placeholder__'];player.occupationHand=['__test_placeholder__']
      player.minorPlayed=[];player.occupationPlayed=[];player.improvements=[];player.cardStates={}
      for(const resource of Object.keys(player.resources))Reflect.set(player.resources,resource,0)
      player.houseType='wood';player.rooms=2;player.roomTiles=[{row:1,col:0},{row:2,col:0}]
      player.fields=[];player.stableTiles=[];player.pastures=[];player.fenceSegments=[]
      player.houseAnimals={};player.stableAnimals={}
      if(options.moor)player.farmTerrain=[]
    }
    if (!options.ordinary) state.players[(options.playerCount??4)===6?3:2]!.houseType='clay'
    configure(state)
  }})
  sessions.push(session)
  const response=session.getState()
  expect(response.state).toMatchObject({phase:'playing',roundPhase:'work'})
  expect(response.interaction.stateId).toBe('idle')
  if(!options.ordinary)expect(response.state.team?.playerTeams).toEqual(options.playerCount===6?options.teamConfig?.seatsPerTeam===3?[0,1,0,1,0,1]:[0,1,2,0,1,2]:[0,1,0,1])
  return session
}
export function restorePartnerTable(session:GameSession) {
  const snapshot=session.withCtx(()=>serializeSessionSnapshot(session.state,session))
  const restored=new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
  sessions.push(restored)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  return restored
}
