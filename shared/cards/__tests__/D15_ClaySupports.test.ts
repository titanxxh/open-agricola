import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { buildRoomCostPerUnit } from '../../actions/payment/internal/room-payment'
import type { PlayerState } from '../../contract/types'

// D15_ClaySupports wires its trade through the static `modifier` field on the
// cards-display definition (see ../cards-display/D/D15_ClaySupports.ts). The
// modifier is synced into `player.activeModifiers` by `rebuildActiveModifiers`
// during `loadState`, the same path the production code uses for any
// modifier-bearing card. No manual `activeModifiers` injection here.

const setupClayHouseWithD15 = (houseType: 'wood' | 'clay' | 'stone' = 'clay') => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.players.forEach((p) => {
    ;(p as any).minorHand = ['__test_placeholder__']
    ;(p as any).occupationHand = ['__test_placeholder__']
  })
  const p = state.players[0]!
  p.houseType = houseType
  p.rooms = 1
  p.minorPlayed = ['D15_ClaySupports']
  session.loadState(state)
  return session.getState().state.players[0]! as PlayerState
}

describe('D15_ClaySupports', () => {
  it('registers D15 trade modifier on player.activeModifiers after loadState', () => {
    const player = setupClayHouseWithD15('clay')
    expect(player.activeModifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'trade',
        cardId: 'D15_ClaySupports',
        appliesTo: ['construct'],
        from: { wood: 1 },
        to: { clay: 3, reed: 1 },
        conditions: { houseTypeClay: 1 },
      }),
    ]))
  })

  it('player without wood can still pay base 5 clay + 2 reed', () => {
    const player = setupClayHouseWithD15('clay')
    player.resources = { wood: 0, clay: 5, reed: 2, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 } as any
    const result = buildRoomCostPerUnit(player) as any
    const fees = result.fees ?? [result]
    expect(fees).toEqual(expect.arrayContaining([{ clay: 5, reed: 2 }]))
  })

  it('player with wood gets both base and trade option (clay house)', () => {
    const player = setupClayHouseWithD15('clay')
    player.resources = { wood: 1, clay: 5, reed: 2, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 } as any
    const result = buildRoomCostPerUnit(player) as any
    const fees = result.fees ?? [result]
    expect(fees).toEqual(expect.arrayContaining([
      { clay: 5, reed: 2 },
      { clay: 2, reed: 1, wood: 1 },
    ]))
  })

  it('does NOT apply when houseType=wood (modifier registered, condition gates it off)', () => {
    const player = setupClayHouseWithD15('wood')
    player.resources = { wood: 5, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 } as any
    const result = buildRoomCostPerUnit(player) as any
    const fees = result.fees ?? [result]
    // Wood-house base cost is {wood:5, reed:2}; no clay-based alternative
    // should appear because the D15 condition `houseTypeClay: 1` blocks it.
    expect(fees.every((f: any) => !('clay' in f))).toBe(true)
  })

  it('does NOT apply when houseType=stone', () => {
    const player = setupClayHouseWithD15('stone')
    player.resources = { wood: 5, clay: 0, reed: 5, stone: 5, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 } as any
    const result = buildRoomCostPerUnit(player) as any
    const fees = result.fees ?? [result]
    expect(fees.every((f: any) => !('clay' in f))).toBe(true)
  })
})
