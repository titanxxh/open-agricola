import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/B/B129_Seatmate'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit28Seatmate from './_helpers/audit/ae-negative-28-seatmate'

const CARD_ID = 'B129_Seatmate'
const FIXED_HANDS = [
  { occupation: 'A116_WoodCutter', minor: 'A004_Baseboards' },
  { occupation: 'B116_Shoreforester', minor: 'B003_Moonshine' },
  { occupation: 'C109_SchnappsDistiller', minor: 'C004_WritingBoards' },
  { occupation: 'E113_Godmother', minor: 'E007_Pumpernickel' },
]

type RoleAtR13 = 'owner' | 'left' | 'right' | 'opposite'

// CLAUDE.md "Common Pitfalls": 空 hand 会触发 normalizeState 第 161 行 re-deal 随机化，
// 用占位 id 让 placement-buyable 判定走 getMinorImprovement undefined 路径，避免随机性。
const PLACEHOLDER_HAND = ['__test_placeholder__']

const setup = (opts: { playerCount: 2 | 3 | 4; round?: number; takenByR13?: RoleAtR13[] }) => {
  const session = new GameSession(undefined, undefined, { playerCount: opts.playerCount })
  const state = session.getState().state
  state.players.forEach((player, index) => {
    player.minorHand = [FIXED_HANDS[index]?.minor ?? PLACEHOLDER_HAND[0]!]
    player.occupationHand = [FIXED_HANDS[index]?.occupation ?? PLACEHOLDER_HAND[0]!]
  })
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
    'B129 S1: three-player neighbor occupancy permits owner entry (%s)',
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
    'B129 S2: four-player neighbor occupancy permits entry while opposite is empty (%s)',
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

  it('B129 S3: four-player opposite-only occupancy blocks entry without changing the space', () => {
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

  it('B129 S3: four-player neighbor and opposite occupancy also blocks entry', () => {
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

  it('B129 S5: round 13 space cannot be entered before round 13', () => {
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

  it('B129 S4: owner already occupying round 13 cannot enter again', () => {
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
    'B129 S4: %ip owner plus neighbor occupancy remains blocked (%s)',
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

  it('B129 S5: Seatmate does not affect occupied non-round-13 spaces', () => {
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

describe('ae-negative-28-seatmate', () => {
  const { sessions, save, ok, ready, make, turn, target, occupied, neighbors } = audit28Seatmate
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B129 N1 actual left or right neighbor placement on revealed round thirteen lets owner enter with one original worker in three or four players',()=>{for(const players of[3,4]as const)for(const neighbor of[1,players-1]){const s=make(players),t=neighbors(s,neighbor),before=ok(s.getState()),refs=occupied(s,t);assert.equal(refs.length,1);assert.equal(refs[0]!.playerId,s.state.players[neighbor]!.id);assert.ok(s.getActionAvailability(0)[t]);const r=turn(s,0,t);assert.equal(occupied(s,t).length,2);assert.equal(occupied(s,t).filter(w=>w.playerId===s.state.players[0]!.id).length,1);assert.ok(occupied(s,t).every(w=>r.state.players.some(p=>p.id===w.playerId&&p.workers.some(x=>x.id===w.workerId))));assert.deepEqual(r.state.players[0]!.workers.map(w=>w.id),before.state.players[0]!.workers.map(w=>w.id));save(`B129-N1-${players}-${neighbor}`,{before,r})}})
  it('B129 N2 actual four player opposite occupant blocks owner entry while retaining the neighbors completed action',()=>{const s=make(4),t=neighbors(s,2),before=ok(s.getState());assert.ok(!s.getActionAvailability(0)[t]);const error=assertRejectedUnchanged(s,()=>s.takeAction(0,t));assert.deepEqual(occupied(s,t),before.state.actionSpaces.find(a=>a.id===t)!.takenBy);save('B129-N2',{before,error,r:turn(s,0,'grain-seeds')})})
  it('B129 N3 owners actual prior round thirteen placement blocks a second entry even while another original worker is available',()=>{const s=make(),t=target(s);turn(s,0,t);turn(s,1,'forest');turn(s,2,'reed-bank');ready(s);assert.ok(!s.getActionAvailability(0)[t]);const before=ok(s.getState()),error=assertRejectedUnchanged(s,()=>s.takeAction(0,t));assert.equal(occupied(s,t).length,1);save('B129-N3',{before,error,r:turn(s,0,'grain-seeds')})})
  it('B129 N4 real occupied non round thirteen space and card in hand remain unavailable to the owner',()=>{for(const mode of['other','hand']){const s=make(3,mode!=='hand'),t=mode==='other'?'forest':target(s);turn(s,0,'day-laborer');turn(s,1,t);turn(s,2,'reed-bank');ready(s);const before=ok(s.getState());assert.ok(!s.getActionAvailability(0)[t]);const error=assertRejectedUnchanged(s,()=>s.takeAction(0,t));save(`B129-N4-${mode}`,{before,error,r:turn(s,0,'grain-seeds')})}})
  it('B129 N5 whole owners occupied space action undo keeps neighbors real worker and restores original own worker before one replay',()=>{const s=make(),t=neighbors(s,1),before=ok(s.getState()),r=turn(s,0,t),undone=ok(s.undoAction());assert.deepEqual(undone.state.actionSpaces,before.state.actionSpaces);assert.deepEqual(undone.state.players[0]!.workers,before.state.players[0]!.workers);assert.deepEqual(undone.state.players[0]!.resources,before.state.players[0]!.resources);assert.equal(occupied(s,t).length,1);const retry=turn(s,0,t);assert.equal(occupied(s,t).length,2);save('B129-N5',{before,r,undone,retry})})
})
