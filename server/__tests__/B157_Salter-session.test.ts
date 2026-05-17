import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import '../../shared/cards/B/B157_Salter'

const CARD_ID = 'B157_Salter'
const placeholder = ['__test_placeholder__']

// 直接 mutate state（参考 A10_WoodenShed-session.test.ts:13-19 现有模式，不调 loadState）
const setup = (options?: {
  resources?: Partial<{ sheep: number; boar: number; cattle: number; food: number }>
  pastures?: Array<{ id:string; size:number; tiles:{row:number;col:number}[]; stables:number; animalType:'sheep'|'boar'|'cattle'|null; animalCount:number }>
  stableAnimals?: Record<string, 'sheep'|'boar'|'cattle'|null>
  round?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 3
  state.roundPhase = 'work'

  const player = state.players[0]!
  player.resources.food = options?.resources?.food ?? 5
  player.resources.sheep = options?.resources?.sheep ?? 0
  player.resources.boar = options?.resources?.boar ?? 0
  player.resources.cattle = options?.resources?.cattle ?? 0
  player.pastures = options?.pastures ?? []
  player.stableAnimals = options?.stableAnimals ?? {}
  player.occupationPlayed.push(CARD_ID)

  // CLAUDE.md Common Pitfall #3：显式 hand placeholder 避免随机 hand 影响判定
  for (const p of state.players) {
    p.minorHand = [...placeholder]
    p.occupationHand = [...placeholder]
  }
  return session
}

describe('B157_Salter session', () => {
  it('多只触发: pending interaction kind=animal-quantity-select', () => {
    const session = setup({
      resources: { sheep: 2, cattle: 1 },
      pastures: [{ id:'p1',size:2,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:2 }],
      stableAnimals: { '2-1': 'cattle' },
      round: 3,
    })
    const resp = session.takeAnytimeAction(0, 'B157-salter-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.request.kind).toBe('animal-quantity-select')
      if (resp.interaction.request.kind === 'animal-quantity-select') {
        expect(resp.interaction.request.availableByType).toEqual({ sheep:2, boar:0, cattle:1 })
      }
    }
  })

  it('commit {sheep:2,cattle:1}: 扣 board + 入 futureMeeples', () => {
    const session = setup({
      resources: { sheep: 2, cattle: 1 },
      pastures: [{ id:'p1',size:2,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:2 }],
      stableAnimals: { '2-1': 'cattle' },
      round: 3,
    })
    session.takeAnytimeAction(0, 'B157-salter-anytime')
    const resp = session.commitSelectionChoice(0, { animalCounts: { sheep:2, boar:0, cattle:1 } })
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.sheep).toBe(0)
    expect(p.resources.cattle).toBe(0)
    expect(p.pastures[0].animalCount).toBe(0)
    expect(p.pastures[0].animalType).toBeNull()
    expect(p.stableAnimals['2-1']).toBeNull()
    // futureMeeples: sheep×2 in rounds 4/5/6, cattle×1 in rounds 4..10
    const fms = resp.state.futureMeeples
    const sheepRounds = fms.filter((e) => e.resources.food === 2).map((e) => e.round).sort((a, b) => a - b)
    const cattleRounds = fms.filter((e) => e.resources.food === 1).map((e) => e.round).sort((a, b) => a - b)
    expect(sheepRounds).toEqual([4,5,6])
    expect(cattleRounds).toEqual([4,5,6,7,8,9,10])
  })

  it('Negative: reserve>0 不触发', () => {
    const session = setup({
      resources: { sheep: 3 },
      pastures: [{ id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1 }],
      round: 3,
    })
    const resp = session.takeAnytimeAction(0, 'B157-salter-anytime')
    expect(resp.ok).toBe(false)
  })

  it('Negative: round=14 不触发', () => {
    const session = setup({
      resources: { sheep: 1 },
      pastures: [{ id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1 }],
      round: 14,
    })
    const resp = session.takeAnytimeAction(0, 'B157-salter-anytime')
    expect(resp.ok).toBe(false)
  })

  it('单只 fast path: 不弹 panel, 直接 ok', () => {
    const session = setup({
      resources: { sheep: 1 },
      pastures: [{ id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1 }],
      round: 3,
    })
    const resp = session.takeAnytimeAction(0, 'B157-salter-anytime')
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.sheep).toBe(0)
    expect(p.pastures[0].animalCount).toBe(0)
    const fms = resp.state.futureMeeples
    expect(fms.map((e) => e.round).sort((a, b) => a - b)).toEqual([4,5,6])
  })

  it('commit {0,0,0}: 退回 invalid', () => {
    const session = setup({
      resources: { sheep: 2 },
      pastures: [{ id:'p1',size:2,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:2 }],
      round: 3,
    })
    session.takeAnytimeAction(0, 'B157-salter-anytime')
    const resp = session.commitSelectionChoice(0, { animalCounts: { sheep:0, boar:0, cattle:0 } })
    expect(resp.ok).toBe(false)
  })

  it('clampRound: round=13 sheep → futureMeeples 只剩 round 14 一条', () => {
    const session = setup({
      resources: { sheep: 1 },
      pastures: [{ id:'p1',size:1,tiles:[{row:2,col:0}],stables:0,animalType:'sheep',animalCount:1 }],
      round: 13,
    })
    const resp = session.takeAnytimeAction(0, 'B157-salter-anytime')  // single fast path
    expect(resp.ok).toBe(true)
    const fms = resp.state.futureMeeples
    expect(fms.length).toBe(1)
    expect(fms[0].round).toBe(14)
  })
})
