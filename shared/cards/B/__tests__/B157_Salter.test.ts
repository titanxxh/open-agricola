import { describe, expect, it } from 'vitest'
import type { CardListenerContext } from '../../card-listeners'
import type { GameState, PlayerState } from '../../../contract/types'
import { B157_Salter_impl } from '../B157_Salter'

const emptyResources = () => ({
  wood:0,clay:0,reed:0,stone:0,food:0,grain:0,vegetable:0,sheep:0,boar:0,cattle:0,begging:0,
})

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id:'p1',name:'P1',color:'red',resources:emptyResources(),workers:[],
  rooms:2,houseType:'wood',fields:[],roomTiles:[],stableTiles:[],
  improvements:[],minorHand:[],minorPlayed:[],occupationHand:[],occupationPlayed:[],
  houseAnimalType:null,houseAnimalCount:0,stableAnimals:{},pastures:[],fenceSegments:[],
  majorEffects:{wellRounds:0},startPlayer:false,cardStates:{},
  ...overrides,
} as PlayerState)

const createState = (player: PlayerState, round = 5): GameState => ({
  round,currentPlayerIndex:0,players:[player],actionSpaces:[],log:[],
  roundStartSnapshot:null,roundActionOrder:Array.from({length:14}).map(()=>null),
  gameSeed:1,availableMajorImprovements:[],futureMeeples:[],pendingFutureMeeples:[],gameOver:false,
} as GameState)

const callListener = (player: PlayerState, state: GameState) => {
  const listener = B157_Salter_impl.listeners![0]
  const ctx = { state, player, space: {} as any, actionId: 'anytime', phase: 'anytime' } as CardListenerContext
  return listener.handler(ctx)
}

describe('B157_Salter listener', () => {
  it('board=0 不触发', () => {
    const p = createPlayer()
    expect(callListener(p, createState(p))).toBeUndefined()
  })

  it('reserve>0 不触发', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 2 },
      pastures: [{id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1}],
    })
    expect(callListener(p, createState(p))).toBeUndefined()
  })

  it('round=14 不触发', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1}],
    })
    expect(callListener(p, createState(p, 14))).toBeUndefined()
  })

  it('多只触发: 不带 presetCounts', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 2, cattle: 1 },
      pastures: [
        {id:'p1',size:2,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:2},
        {id:'p2',size:1,tiles:[{row:2,col:1}],stables:0,animalType:'cattle',animalCount:1},
      ],
    })
    const r = callListener(p, createState(p, 5)) as any
    expect(r).toBeDefined()
    expect(r.flow.actionId).toBe('card_B157_Salter_salt-pick')
    expect(r.flow.params).toBeUndefined()
    expect(r.labelKey).toBe('cards.B157_Salter.anytime')
  })

  it('单只 sheep fast path', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1}],
    })
    const r = callListener(p, createState(p, 5)) as any
    expect(r).toBeDefined()
    expect(r.flow.params).toEqual({ presetCounts: { sheep: 1 } })
    expect(r.labelKey).toBe('cards.B157_Salter.single.sheep')
  })

  it('单只 cattle fast path', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), cattle: 1 },
      pastures: [{id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'cattle',animalCount:1}],
    })
    const r = callListener(p, createState(p, 5)) as any
    expect(r.flow.params).toEqual({ presetCounts: { cattle: 1 } })
    expect(r.labelKey).toBe('cards.B157_Salter.single.cattle')
  })
})
