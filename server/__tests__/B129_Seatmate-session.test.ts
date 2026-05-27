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
  const owner = state.players[0]!
  owner.occupationPlayed.push(CARD_ID)
  const r13Id = state.roundActionOrder[12]!
  const r13Setup = state.actionSpaces.find((s) => s.id === r13Id)!
  const n = state.players.length
  const ownerIdx = 0
  // Direction follows C150_ParrotBreeder convention: right neighbour = (idx - 1 + n) % n.
  const idxMap: Record<RoleAtR13, number> = {
    owner: ownerIdx,
    right: (ownerIdx - 1 + n) % n,
    left: (ownerIdx + 1) % n,
    opposite: (ownerIdx + Math.floor(n / 2)) % n,
  }
  r13Setup.takenBy = (opts.takenByR13 ?? []).map((role, i) => ({
    playerId: state.players[idxMap[role]]!.id,
    workerId: `seed-${role}-${i + 1}`,
  }))
  session.loadState(state)
  return {
    session,
    owner,
    r13Id,
    idxMap,
    playerIds: state.players.map((p) => p.id),
  }
}

const readR13 = (session: GameSession, r13Id: string) =>
  session.getState().state.actionSpaces.find((s) => s.id === r13Id)!

describe('B129_Seatmate session', () => {
  // test cases appended in Tasks 2-6
})
