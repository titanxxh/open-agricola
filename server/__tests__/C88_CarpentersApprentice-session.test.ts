import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, collectComputeCostsForFarmChoice } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { PlayerState, GameState } from '../../shared/contract/types'
import { getAllTilePositions, positionKey } from '../../shared/domain/farm'

import '../../shared/cards/C/C88_CarpentersApprentice'
import '../../shared/cards/B/B30_WoodPalisades'

const makeFencePlayer = (fenceCount: number, wood = 0): PlayerState => {
  const session = new GameSession()
  const state = session.getState().state
  const p = state.players[0]!
  p.occupationPlayed.push('C88_CarpentersApprentice')
  p.fenceSegments = Array.from({ length: fenceCount }, (_, i) => ({
    edge: `fence-stub-${i}`,
    type: 'fence' as const,
  }))
  p.resources.wood = wood
  return p
}

const fenceCostWood = (player: PlayerState, newFenceEdges: string[]): number => {
  const listener = getRegisteredCardListeners().find(
    (l) =>
      l.cardIds?.includes('C88_CarpentersApprentice') &&
      l.actions?.includes('fence') &&
      l.phases?.includes('computeCosts'),
  )
  if (!listener) throw new Error('C88 fenceCostListener (computeCosts/fence) not registered')
  const ctx = {
    state: {} as GameState,
    player,
    space: {} as never,
    actionId: 'fence',
    phase: 'computeCosts',
    params: { newFenceEdges },
  } as unknown as CardListenerContext
  const result = listener.handler(ctx)
  if (!result || typeof result !== 'object') return 0
  return (result as { costs?: { wood?: number } }).costs?.wood ?? 0
}

const fenceEdges = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `new-edge-${i}`)

const stablesDiscount = (player: PlayerState, stableCount = 1): number => {
  const listeners = getRegisteredCardListeners().filter((l) =>
    l.cardIds?.includes('C88_CarpentersApprentice'),
  )
  const stableListener = listeners.find(
    (l) =>
      l.actions?.includes('stables') &&
      l.phases?.includes('computeCosts'),
  )
  if (!stableListener) return 0
  const ctx = {
    state: {} as GameState,
    player,
    space: {} as never,
    actionId: 'stables',
    phase: 'computeCosts',
    params: { stableCount },
  } as unknown as CardListenerContext
  const result = stableListener.handler(ctx)
  if (!result || typeof result !== 'object') return 0
  const costs = (result as { costs?: { wood?: number } }).costs
  return costs?.wood ?? 0
}

describe('C88 Carpenter\'s Apprentice — session w/ palisades', () => {
  it('低 fence 不打折:0 fence 造 2 fence + 2 palisade 全额付费', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // 0 fence: 第 1、2 个 fence 不在 13-15 区间 → 不免费。
    // 2 fence × 1 wood = 2,2 palisade × 2 wood = 4,total = 6 wood。
    player.resources.wood = 6
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.minorPlayed.push('B30_WoodPalisades')
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    const result = resp.state.players[0]!
    expect(result.resources.wood).toBe(0)
    expect(result.pastures).toHaveLength(1)
  })

  it('palisade 不打折:5 wood 不足 6 wood 的 2 fence + 2 palisade build', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // 需 6 wood(2 fence 全额 + 2 palisade 全额);只有 5 → 不足。
    player.resources.wood = 5
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.minorPlayed.push('B30_WoodPalisades')
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'],
      palisadeEdges: ['H-0-0', 'V-0-0'],
      extraWood: 0,
    })

    expect(resp.ok).toBe(false)
  })

  describe('stables-cost listener cap (3rd & 4th stables only)', () => {
    const makePlayer = (stables: number, farmHand = false): PlayerState => {
      const session = new GameSession()
      const state = session.getState().state
      const p = state.players[0]!
      p.occupationPlayed.push('C88_CarpentersApprentice')
      p.stableTiles = Array.from({ length: stables }, (_, i) => ({ row: 0, col: i }))
      if (farmHand) {
        p.cardStates = {
          ...p.cardStates,
          B85_FarmHand: { extraData: { position: { row: 2, col: 2 } } },
        }
      }
      return p
    }

    it('0 stables built → no discount on next stable (1st)', () => {
      expect(stablesDiscount(makePlayer(0))).toBe(0)
    })

    it('1 stable built → no discount on next stable (2nd)', () => {
      expect(stablesDiscount(makePlayer(1))).toBe(0)
    })

    it('2 stables built → -1 wood on next stable (3rd)', () => {
      expect(stablesDiscount(makePlayer(2))).toBe(-1)
    })

    it('3 stables built → -1 wood on next stable (4th)', () => {
      expect(stablesDiscount(makePlayer(3))).toBe(-1)
    })

    it('4 stables built → no further discount (cap)', () => {
      expect(stablesDiscount(makePlayer(4))).toBe(0)
    })

    it('before counts the B85 FarmHand stable: 1 ordinary + B85 (card-facing=2) → next (3rd) is -1', () => {
      expect(stablesDiscount(makePlayer(1, true))).toBe(-1)
    })

    it('mixed build crossing 3rd & 4th: 2 card-facing + build 2 → total discount -2', () => {
      expect(stablesDiscount(makePlayer(2), 2)).toBe(-2)
    })

    it('mixed build with only the 3rd discounted: 1 card-facing + build 2 (2nd & 3rd) → -1', () => {
      expect(stablesDiscount(makePlayer(1), 2)).toBe(-1)
    })

    it('mixed build below the discount band: 0 card-facing + build 2 (1st & 2nd) → 0', () => {
      expect(stablesDiscount(makePlayer(0), 2)).toBe(0)
    })

    it('mixed build all-discount band: 2 card-facing + build 1 → -1 (3rd only)', () => {
      expect(stablesDiscount(makePlayer(2), 1)).toBe(-1)
    })
  })
})

describe('C88 — fenceCostListener 区间公式(第 13-15 个 fence 免费)', () => {
  it('before 0,造 2 个 → 无折扣(第 1、2 个不在 13-15)', () => {
    expect(fenceCostWood(makeFencePlayer(0), fenceEdges(2))).toBe(0)
  })
  it('before 12,造 3 个(第 13/14/15)→ -3', () => {
    expect(fenceCostWood(makeFencePlayer(12), fenceEdges(3))).toBe(-3)
  })
  it('consumed fence supply removes the 15th fence from the free interval', () => {
    const player = makeFencePlayer(12)
    player.supplyTokensConsumed = { fence: 1 }
    expect(fenceCostWood(player, fenceEdges(3))).toBe(-2)
  })
  it('before 13,造 2 个(第 14/15)→ -2', () => {
    expect(fenceCostWood(makeFencePlayer(13), fenceEdges(2))).toBe(-2)
  })
  it('before 11,造 4 个(第 12 付费 + 13/14/15 免费)→ -3', () => {
    expect(fenceCostWood(makeFencePlayer(11), fenceEdges(4))).toBe(-3)
  })
  it('before 15,造 1 个 → 无折扣(已满)', () => {
    expect(fenceCostWood(makeFencePlayer(15), fenceEdges(1))).toBe(0)
  })
  it('newFenceEdges 为空 → 无折扣', () => {
    expect(fenceCostWood(makeFencePlayer(13), [])).toBe(0)
  })
})

const fenceDoable = (player: PlayerState, state = {} as GameState): boolean => {
  const listener = getRegisteredCardListeners().find(
    (l) =>
      l.cardIds?.includes('C88_CarpentersApprentice') &&
      l.actions?.includes('fence') &&
      l.phases?.includes('isDoable'),
  )
  if (!listener) throw new Error('C88 fenceIsDoableListener (isDoable/fence) not registered')
  const ctx = {
    state,
    player,
    space: {} as never,
    actionId: 'fence',
    phase: 'isDoable',
    doable: false,
  } as unknown as CardListenerContext
  const result = listener.handler(ctx)
  return (result as { doable?: boolean } | void)?.doable === true
}

describe('C88 — fenceIsDoableListener 精确 BGA doability', () => {
  it('before 12,wood 0 → doable(第 13-15 全免费)', () => {
    expect(fenceDoable(makeFencePlayer(12, 0))).toBe(true)
  })
  it('before 13,wood 0 → doable', () => {
    expect(fenceDoable(makeFencePlayer(13, 0))).toBe(true)
  })
  it('12 fences,no legal commit → not doable', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    const roomTiles = [
      { row: 1, col: 0 },
      { row: 1, col: 1 },
    ]
    const roomKeys = new Set(roomTiles.map(positionKey))
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.resources.wood = 0
    player.roomTiles = roomTiles
    player.fields = getAllTilePositions()
      .filter((tile) => !roomKeys.has(positionKey(tile)))
      .map((tile) => ({ ...tile, stacks: [] }))
    player.fenceSegments = [
      'H-0-1', 'H-0-2', 'H-0-3', 'H-0-4',
      'H-3-1', 'H-3-2', 'H-3-3', 'H-3-4',
      'V-0-1', 'V-1-1', 'V-2-1', 'V-0-5',
    ].map((edge) => ({ edge, type: 'fence' as const }))

    expect(fenceDoable(player, state)).toBe(false)
  })
  it('before 10,wood 1 → 不 doable(自费撑不到第 12 个)', () => {
    expect(fenceDoable(makeFencePlayer(10, 1))).toBe(false)
  })
  it('before 10,wood 2 → doable(自费够到第 12,免费区解锁)', () => {
    expect(fenceDoable(makeFencePlayer(10, 2))).toBe(true)
  })
  it('before 11,wood 1 → doable(自费够到第 12,免费区解锁)', () => {
    expect(fenceDoable(makeFencePlayer(11, 1))).toBe(true)
  })
  it('before 0,wood 0 → 不 doable(自费撑不到第 12 个)', () => {
    expect(fenceDoable(makeFencePlayer(0, 0))).toBe(false)
  })
  it('before 15,wood 0 → 不 doable(fence 已满)', () => {
    expect(fenceDoable(makeFencePlayer(15, 0))).toBe(false)
  })
  it('consumed fence supply makes the dynamic 14th fence the cap', () => {
    const player = makeFencePlayer(14, 0)
    player.supplyTokensConsumed = { fence: 1 }
    expect(fenceDoable(player)).toBe(false)
  })
})

describe('C88 — fence 折扣经 collectComputeCostsForFarmChoice 聚合', () => {
  it('before 12,造 3 个 → 聚合 wood -3(hook 路径生效)', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = makeFencePlayer(12)
    state.players[0] = player
    const result = collectComputeCostsForFarmChoice(
      state,
      player,
      'fence',
      { newFenceEdges: fenceEdges(3) },
    )
    expect(result.wood).toBe(-3)
  })
  it('before 0,造 2 个 → 聚合无 wood 折扣', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = makeFencePlayer(0)
    state.players[0] = player
    const result = collectComputeCostsForFarmChoice(
      state,
      player,
      'fence',
      { newFenceEdges: fenceEdges(2) },
    )
    expect(result.wood ?? 0).toBe(0)
  })
})

describe('C88 — fence 折扣 Session 端到端(第 13-14 个免费)', () => {
  it('0 fence 一次造 14 个 fence:第 13/14 个免费,wood 12→0', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // 14 个普通 fence 围 row 0-2, col 1-4 的 3×4 矩形(col 0 是初始房间):
    // 第 1-12 个付 12 wood,第 13、14 个免费。
    player.resources.wood = 12
    player.occupationPlayed.push('C88_CarpentersApprentice')
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      edges: [
        'H-0-1', 'H-0-2', 'H-0-3', 'H-0-4',
        'H-3-1', 'H-3-2', 'H-3-3', 'H-3-4',
        'V-0-1', 'V-1-1', 'V-2-1',
        'V-0-5', 'V-1-5', 'V-2-5',
      ],
      palisadeEdges: [],
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.fenceSegments.length).toBe(14)
  })
})
