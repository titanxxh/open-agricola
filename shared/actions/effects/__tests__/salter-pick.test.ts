import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../contract/types'
import { salterPickAction } from '../salter-pick'

const emptyResources = () => ({
  wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
  grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
})

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red', resources: emptyResources(), workers: [],
  rooms: 2, houseType: 'wood', fields: [], roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [], occupationHand: [], occupationPlayed: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {}, pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 }, startPlayer: false, cardStates: {},
  ...overrides,
} as PlayerState)

const createState = (player: PlayerState, round = 3): GameState => ({
  round, currentPlayerIndex: 0, players: [player], actionSpaces: [], log: [],
  roundStartSnapshot: null, roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1, availableMajorImprovements: [], futureMeeples: [], pendingFutureMeeples: [], gameOver: false,
} as GameState)

const space = { id: 'card-anytime:B157_Salter', resources: {}, takenBy: [] } as any

describe('salterPickAction', () => {
  // resolveChoice 3 位参签名 (ctx, choice, payload?) — types.ts:539-543
  const callResolve = (s: GameState, p: PlayerState, payload: Record<string, unknown>) =>
    salterPickAction.resolveChoice!(
      { state: s, player: p, space } as any,
      'confirm',
      payload,
    )

  it('execute: 无 board 动物 → fail', () => {
    const p = createPlayer()
    const s = createState(p)
    const r = salterPickAction.execute({ state: s, player: p, space, params: {} } as any)
    expect(r.type).toBe('fail')
  })

  it('execute: board 多只 → request animal-quantity-select', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 2, boar: 1 },
      pastures: [
        { id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 2 },
        { id: 'p2', size: 1, tiles: [{ row: 2, col: 1 }], stables: 0, animalType: 'boar', animalCount: 1 },
      ],
    })
    const s = createState(p)
    const r = salterPickAction.execute({ state: s, player: p, space, params: {} } as any)
    expect(r.type).toBe('request')
    if (r.type === 'request') {
      expect(r.request.kind).toBe('animal-quantity-select')
      if (r.request.kind === 'animal-quantity-select') {
        expect(r.request.availableByType).toEqual({ sheep: 2, boar: 1, cattle: 0 })
      }
    }
  })

  it('execute: presetCounts 直接 resolve（跳 panel）→ flow', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }],
    })
    const s = createState(p, 3)
    const r = salterPickAction.execute({ state: s, player: p, space, params: { presetCounts: { sheep: 1 } } } as any)
    expect(r.type).toBe('flow')
    expect(p.resources.sheep).toBe(0)
    expect(p.pastures[0].animalCount).toBe(0)
    // queueFutureMeeplesFlow pushed → pendingFutureMeeples 应有 1 条
    expect(s.pendingFutureMeeples.length).toBe(1)
    expect(s.pendingFutureMeeples[0]).toMatchObject({
      cardId: 'B157_Salter', startRound: 4, count: 3, resources: { food: 1 },
    })
  })

  it('resolveChoice: 0 总数 → fail', () => {
    const p = createPlayer()
    const s = createState(p)
    const r = callResolve(s, p, { sheep: 0, boar: 0, cattle: 0 })
    expect(r.type).toBe('fail')
  })

  it('resolveChoice: 超 onBoard → fail', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }],
    })
    const s = createState(p)
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

  it('resolveChoice: 接 {animalCounts: {...}} 包装 payload（来自 session-core）', () => {
    const p = createPlayer({
      resources: { ...emptyResources(), sheep: 1 },
      pastures: [{ id: 'p1', size: 1, tiles: [{ row: 2, col: 0 }], stables: 0, animalType: 'sheep', animalCount: 1 }],
    })
    const s = createState(p, 3)
    const r = callResolve(s, p, { animalCounts: { sheep: 1, boar: 0, cattle: 0 } })
    expect(r.type).toBe('flow')
    expect(s.pendingFutureMeeples.length).toBe(1)
  })

  it('resolveChoice clampRound: round=13 sheep → futureMeeples 入队 startRound=14 count=3', () => {
    // pending 入队 startRound=14 count=3；clampRound 由后续 resolveFutureMeepleRequests 处理（实际 future entries 只剩 round 14 一条，session 测试覆盖）
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
