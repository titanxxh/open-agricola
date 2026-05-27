import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/B/B129_Seatmate'

const CARD_ID = 'B129_Seatmate'

type RoleAtR13 = 'owner' | 'left' | 'right' | 'opposite'

// CLAUDE.md "Common Pitfalls": 空 hand 会触发 normalizeState 第 161 行 re-deal 随机化，
// 用占位 id 让 placement-buyable 判定走 getMinorImprovement undefined 路径，避免随机性。
const PLACEHOLDER_HAND = ['__test_placeholder__']

const setup = (opts: { playerCount: 2 | 3 | 4; round?: number; takenByR13?: RoleAtR13[] }) => {
  const session = new GameSession(undefined, undefined, { playerCount: opts.playerCount })
  const state = session.getState().state
  for (const p of state.players) {
    p.minorHand = [...PLACEHOLDER_HAND]
    p.occupationHand = [...PLACEHOLDER_HAND]
  }
  state.round = opts.round ?? 13
  const ownerIdx = 0
  const ownerId = state.players[ownerIdx]!.id
  state.players[ownerIdx]!.occupationPlayed.push(CARD_ID)
  const r13Id = state.roundActionOrder[12]!
  const r13Setup = state.actionSpaces.find((s) => s.id === r13Id)!
  const n = state.players.length
  // Direction follows C150_ParrotBreeder convention: right neighbour = (idx - 1 + n) % n.
  const idxMap: Record<RoleAtR13, number> = {
    owner: ownerIdx,
    right: (ownerIdx - 1 + n) % n,
    left: (ownerIdx + 1) % n,
    opposite: (ownerIdx + Math.floor(n / 2)) % n,
  }
  r13Setup.takenBy = (opts.takenByR13 ?? []).map((role, i) => {
    const player = state.players[idxMap[role]]!
    return {
      playerId: player.id,
      workerId: player.workers[i]?.id ?? `seed-${role}-${i + 1}`,
    }
  })
  session.loadState(state)
  // 注意：loadState 会经 normalizeState 重新构造 players / actionSpaces；只 return
  // 稳定 id（string）与下标映射，不要 return pre-loadState 的 player / space 引用。
  return {
    session,
    ownerId,
    r13Id,
    idxMap,
    playerIds: state.players.map((p) => p.id),
  }
}

const readR13 = (session: GameSession, r13Id: string) =>
  session.getState().state.actionSpaces.find((s) => s.id === r13Id)!

describe('B129_Seatmate session', () => {
  it.each<[RoleAtR13]>([['left'], ['right']])(
    'Test 1: 3p neighbour-only occupies r13, owner enters OK (%s)',
    (neighbour) => {
      const { session, ownerId, r13Id, playerIds, idxMap } = setup({
        playerCount: 3,
        takenByR13: [neighbour],
      })
      const neighbourId = playerIds[idxMap[neighbour]]!

      expect(session.getActionAvailability(0)[r13Id]).toBe(true)
      const resp = session.takeAction(0, r13Id)
      expect(resp.ok).toBe(true)

      const takenByIds = readR13(session, r13Id).takenBy.map((t) => t.playerId)
      expect(takenByIds).toEqual(expect.arrayContaining([neighbourId, ownerId]))
      expect(session.getActionAvailability(0)[r13Id]).toBe(false)
    },
  )

  it.each<[RoleAtR13]>([['left'], ['right']])(
    'Test 2: 4p neighbour-only occupies r13, opposite empty, owner enters OK (%s)',
    (neighbour) => {
      const { session, ownerId, r13Id, playerIds, idxMap } = setup({
        playerCount: 4,
        takenByR13: [neighbour],
      })
      const neighbourId = playerIds[idxMap[neighbour]]!
      const oppositeId = playerIds[idxMap.opposite]!

      expect(session.getActionAvailability(0)[r13Id]).toBe(true)
      const resp = session.takeAction(0, r13Id)
      expect(resp.ok).toBe(true)

      const takenByIds = readR13(session, r13Id).takenBy.map((t) => t.playerId)
      expect(takenByIds).toEqual(expect.arrayContaining([neighbourId, ownerId]))
      expect(takenByIds).not.toContain(oppositeId)
      expect(session.getActionAvailability(0)[r13Id]).toBe(false)
    },
  )

  it('Test 3: 4p opposite-only occupies r13, owner entry BLOCKED', () => {
    const { session, r13Id, playerIds, idxMap } = setup({
      playerCount: 4,
      takenByR13: ['opposite'],
    })
    const oppositeId = playerIds[idxMap.opposite]!

    const resp = session.takeAction(0, r13Id)
    expect(resp.ok).toBe(false)

    const r13After = readR13(session, r13Id).takenBy.map((t) => t.playerId).sort()
    expect(r13After).toEqual([oppositeId])
    expect(session.getActionAvailability(0)[r13Id]).toBe(false)
  })

  it('Test 4: 4p neighbour AND opposite occupy r13, owner entry BLOCKED', () => {
    const { session, r13Id, playerIds, idxMap } = setup({
      playerCount: 4,
      takenByR13: ['left', 'opposite'],
    })
    const expectedIds = [playerIds[idxMap.left]!, playerIds[idxMap.opposite]!].sort()

    const resp = session.takeAction(0, r13Id)
    expect(resp.ok).toBe(false)

    const r13After = readR13(session, r13Id).takenBy.map((t) => t.playerId).sort()
    expect(r13After).toEqual(expectedIds)
    expect(session.getActionAvailability(0)[r13Id]).toBe(false)
  })

  it('Test 5(a): round < 13, listener short-circuits via round guard', () => {
    const { session, r13Id, playerIds, idxMap } = setup({
      playerCount: 4,
      round: 12,
      takenByR13: ['left'],
    })
    const expectedIds = [playerIds[idxMap.left]!].sort()

    const resp = session.takeAction(0, r13Id)
    expect(resp.ok).toBe(false)

    const r13After = readR13(session, r13Id).takenBy.map((t) => t.playerId).sort()
    expect(r13After).toEqual(expectedIds)
    expect(session.getActionAvailability(0)[r13Id]).toBe(false)
  })

  it('Test 5(b): r13 occupied by owner only, listener short-circuits owner-only', () => {
    const { session, ownerId, r13Id } = setup({
      playerCount: 4,
      takenByR13: ['owner'],
    })

    const resp = session.takeAction(0, r13Id)
    expect(resp.ok).toBe(false)

    const r13After = readR13(session, r13Id).takenBy.map((t) => t.playerId)
    expect(r13After).toEqual([ownerId])
    expect(session.getActionAvailability(0)[r13Id]).toBe(false)
  })

  it.each<[2 | 3 | 4, RoleAtR13]>([
    [3, 'left'],
    [4, 'left'],
  ])(
    'Test 5(c): %ip owner plus neighbour occupy r13, owner entry BLOCKED (%s)',
    (playerCount, neighbour) => {
      const { session, ownerId, r13Id, playerIds, idxMap } = setup({
        playerCount,
        takenByR13: ['owner', neighbour],
      })
      const expectedIds = [ownerId, playerIds[idxMap[neighbour]]!].sort()

      const resp = session.takeAction(0, r13Id)
      expect(resp.ok).toBe(false)

      const r13After = readR13(session, r13Id).takenBy.map((t) => t.playerId).sort()
      expect(r13After).toEqual(expectedIds)
      expect(session.getActionAvailability(0)[r13Id]).toBe(false)
    },
  )

  it('Test 5(d): 2-player falls through to "other player counts" defensive return', () => {
    const { session, r13Id, playerIds, idxMap } = setup({
      playerCount: 2,
      takenByR13: ['left'],
    })
    const expectedIds = [playerIds[idxMap.left]!].sort()

    const resp = session.takeAction(0, r13Id)
    expect(resp.ok).toBe(false)

    const r13After = readR13(session, r13Id).takenBy.map((t) => t.playerId).sort()
    expect(r13After).toEqual(expectedIds)
    expect(session.getActionAvailability(0)[r13Id]).toBe(false)
  })

  it('Test 5(e): B129 does not affect non-r13 spaces', () => {
    const { session, r13Id, playerIds, idxMap } = setup({
      playerCount: 4,
      takenByR13: ['left'],
    })
    const leftId = playerIds[idxMap.left]!

    // 在 Test 2 正向 setup 之上叠加 forest 被 left 占
    const state = session.getState().state
    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    forest.takenBy = [{ playerId: leftId, workerId: 'seed-forest' }]
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(false)
    expect(session.getActionAvailability(0)['forest']).toBe(false)
    // r13 不应被 forest 改动污染
    expect(session.getActionAvailability(0)[r13Id]).toBe(true)
  })
})
