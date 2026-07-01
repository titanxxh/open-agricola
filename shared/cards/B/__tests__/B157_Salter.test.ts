import { describe, expect, it } from 'vitest'
import type { CardListenerContext } from '../../card-listeners'
import type { GameState, PlayerState } from '../../../contract/types'
import { B157_Salter_impl, salterPickAction } from '../B157_Salter'

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

  it('hosted Night Pasture animal fast path', () => {
    const owner = createPlayer({ id: 'owner', name: 'Owner' })
    const guest = createPlayer({
      id: 'guest',
      name: 'Guest',
      resources: { ...emptyResources(), sheep: 1 },
    })
    const zoneId = `card:M033_NightPasture:owner:${owner.id}:animalOwner:${guest.id}`
    owner.minorPlayed = ['M033_NightPasture']
    owner.cardStates = {
      M033_NightPasture: {
        extraData: {
          animalCountsByZone: {
            [zoneId]: {
              animalCounts: { sheep: 1 },
              ownerPlayerId: owner.id,
              animalOwnerPlayerId: guest.id,
              cardId: 'M033_NightPasture',
              capacity: 1,
              allowedAnimalType: null,
            },
          },
        },
      } as any,
    }
    const state = createState(guest, 5)
    state.players = [owner, guest]

    const r = callListener(guest, state) as any

    expect(r.flow.params).toEqual({ presetCounts: { sheep: 1 } })
  })
})

// ============================================================
// Ad-hoc action 单元测试（原 B157_Salter_salt-pick.test.ts 合并）
// ============================================================

const adHocSpace = { id: 'card-anytime:B157_Salter', resources: {}, takenBy: [] } as any

describe('salterPickAction (ad-hoc)', () => {
  const callResolve = (s: GameState, p: PlayerState, payload: Record<string, unknown>) =>
    salterPickAction.resolveChoice!(
      { state: s, player: p, space: adHocSpace } as any,
      'confirm',
      payload,
    )

  it('execute: 无 board 动物 → fail', () => {
    const p = createPlayer()
    const s = createState(p, 3)
    const r = salterPickAction.execute({ state: s, player: p, space: adHocSpace, params: {} } as any)
    expect(r.type).toBe('fail')
  })

  it('execute: board 多只 → request resource-quantity-select', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 2, boar: 1 },
      pastures: [
        { id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 2 },
        { id: 'p2', size: 1, tiles: [{ row: 2, col: 1 }], stables: 0, animalType: 'boar', animalCount: 1 },
      ],
    })
    const s = createState(p, 3)
    const r = salterPickAction.execute({ state: s, player: p, space: adHocSpace, params: {} } as any)
    expect(r.type).toBe('request')
    if (r.type === 'request') {
      expect(r.request.kind).toBe('resource-quantity-select')
      if (r.request.kind === 'resource-quantity-select') {
        expect(r.request.availableByResource).toEqual({ sheep: 2, boar: 1, cattle: 0 })
      }
    }
  })

  it('execute: presetCounts 直接 resolve（跳 panel）→ flow', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }],
    })
    const s = createState(p, 3)
    const r = salterPickAction.execute({ state: s, player: p, space: adHocSpace, params: { presetCounts: { sheep: 1 } } } as any)
    expect(r.type).toBe('flow')
    expect(p.resources.sheep).toBe(0)
    expect(p.pastures[0].animalCount).toBe(0)
    expect(s.pendingFutureMeeples.length).toBe(1)
    expect(s.pendingFutureMeeples[0]).toMatchObject({
      cardId: 'B157_Salter', startRound: 4, count: 3, resources: { food: 1 },
    })
  })

  it('resolveChoice: 0 总数 → fail', () => {
    const p = createPlayer()
    const s = createState(p, 3)
    const r = callResolve(s, p, { sheep: 0, boar: 0, cattle: 0 })
    expect(r.type).toBe('fail')
  })

  it('resolveChoice: 超 onBoard → fail', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }],
    })
    const s = createState(p, 3)
    const r = callResolve(s, p, { sheep: 2 })
    expect(r.type).toBe('fail')
  })

  it('resolveChoice: 单 type → flow + 一个 futureMeeples', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 2 },
      pastures: [{ id: 'p1', size: 2, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 2 }],
    })
    const s = createState(p, 3)
    const r = callResolve(s, p, { sheep: 2, boar: 0, cattle: 0 })
    expect(r.type).toBe('flow')
    expect(p.resources.sheep).toBe(0)
    expect(s.pendingFutureMeeples.length).toBe(1)
    expect(s.pendingFutureMeeples[0]).toMatchObject({
      cardId: 'B157_Salter', startRound: 4, count: 3, resources: { food: 2 },
    })
  })

  it('resolveChoice: 混合 type → seq 包 3 个 futureMeeples', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1, boar: 1, cattle: 1 },
      pastures: [
        { id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 },
        { id: 'p2', size: 1, tiles: [{ row: 2, col: 1 }], stables: 0, animalType: 'boar', animalCount: 1 },
        { id: 'p3', size: 1, tiles: [{ row: 2, col: 2 }], stables: 0, animalType: 'cattle', animalCount: 1 },
      ],
    })
    const s = createState(p, 3)
    const r = callResolve(s, p, { sheep: 1, boar: 1, cattle: 1 })
    expect(r.type).toBe('flow')
    expect(p.resources.sheep).toBe(0)
    expect(p.resources.boar).toBe(0)
    expect(p.resources.cattle).toBe(0)
    expect(s.pendingFutureMeeples.length).toBe(3)
    const counts = s.pendingFutureMeeples.map((req: any) => req.count).sort((a: number, b: number) => a - b)
    expect(counts).toEqual([3, 5, 7])
  })

  it('resolveChoice: 接 {resourceCounts: {...}} 包装 payload（来自 session-core）', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }],
    })
    const s = createState(p, 3)
    const r = callResolve(s, p, { resourceCounts: { sheep: 1, boar: 0, cattle: 0 } })
    expect(r.type).toBe('flow')
    expect(s.pendingFutureMeeples.length).toBe(1)
  })

  it('resolveChoice: hosted Night Pasture animal can be selected and removed', () => {
    const owner = createPlayer({ id: 'owner', name: 'Owner' })
    const guest = createPlayer({
      id: 'guest',
      name: 'Guest',
      resources: { ...emptyResources(), sheep: 1 },
    })
    const zoneId = `card:M033_NightPasture:owner:${owner.id}:animalOwner:${guest.id}`
    owner.minorPlayed = ['M033_NightPasture']
    owner.cardStates = {
      M033_NightPasture: {
        extraData: {
          animalCountsByZone: {
            [zoneId]: {
              animalCounts: { sheep: 1 },
              ownerPlayerId: owner.id,
              animalOwnerPlayerId: guest.id,
              cardId: 'M033_NightPasture',
              capacity: 1,
              allowedAnimalType: null,
            },
          },
        },
      } as any,
    }
    const state = createState(guest, 3)
    state.players = [owner, guest]

    const r = callResolve(state, guest, { sheep: 1 })

    expect(r.type).toBe('flow')
    expect(guest.resources.sheep).toBe(0)
    const zone = ((owner.cardStates!.M033_NightPasture.extraData as any).animalCountsByZone as any)[zoneId]
    expect(zone.animalCounts?.sheep ?? 0).toBe(0)
  })

  it('resolveChoice: NaN count → fail (rejected by integer validator)', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }],
    })
    const s = createState(p, 3)
    const r = callResolve(s, p, { sheep: Number.NaN })
    expect(r.type).toBe('fail')
    expect(p.resources.sheep).toBe(1)
    expect(p.pastures[0].animalCount).toBe(1)
  })

  it('resolveChoice: 小数 count → fail (rejected by integer validator)', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 2 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 2 }],
    })
    const s = createState(p, 3)
    const r = callResolve(s, p, { sheep: 1.5 })
    expect(r.type).toBe('fail')
    expect(p.resources.sheep).toBe(2)
  })

  it('resolveChoice: 负数 count → fail (rejected by integer validator)', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 2 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 2 }],
    })
    const s = createState(p, 3)
    const r = callResolve(s, p, { sheep: -1 })
    expect(r.type).toBe('fail')
    expect(p.resources.sheep).toBe(2)
  })

  it('resolveChoice clampRound: round=13 sheep → futureMeeples 入队 startRound=14 count=3', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }],
    })
    const s = createState(p, 13)
    const r = callResolve(s, p, { sheep: 1, boar: 0, cattle: 0 })
    expect(r.type).toBe('flow')
    expect(s.pendingFutureMeeples[0]).toMatchObject({ startRound: 14, count: 3 })
  })
})
