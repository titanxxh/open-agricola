import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { buildRoomCostPerUnit } from '../../actions/payment/internal/room-payment'
import type { CostModifier, PlayerState } from '../../contract/types'

const D15_TRADE_MODIFIER: CostModifier = {
  type: 'trade',
  cardId: 'D15_ClaySupports',
  appliesTo: ['construct'],
  from: { wood: 1 },
  to: { clay: 3, reed: 1 },
}

const setup = (houseType: 'wood' | 'clay' | 'stone' = 'clay') => {
  const session = new GameSession(42)
  const core = session as any
  core.state.players.forEach((p: PlayerState) => {
    ;(p as any).minorHand = ['__test_placeholder__']
    ;(p as any).occupationHand = ['__test_placeholder__']
  })
  const p = core.state.players[0]
  p.houseType = houseType
  p.rooms = 1
  ;(p as any).minorPlayed = ['D15_ClaySupports']
  ;(p as any).activeModifiers = [D15_TRADE_MODIFIER]
  return { session, core, player: p as PlayerState }
}

describe('D15_ClaySupports', () => {
  it('player without wood can still pay base 5 clay + 2 reed', () => {
    const { player } = setup('clay')
    player.resources = { wood: 0, clay: 5, reed: 2, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 } as any
    const result = buildRoomCostPerUnit(player) as any
    const fees = result.fees ?? [result]
    expect(fees).toEqual(expect.arrayContaining([{ clay: 5, reed: 2 }]))
  })

  it('player with wood gets both base and trade option', () => {
    const { player } = setup('clay')
    player.resources = { wood: 1, clay: 5, reed: 2, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 } as any
    const result = buildRoomCostPerUnit(player) as any
    const fees = result.fees ?? [result]
    expect(fees).toEqual(expect.arrayContaining([
      { clay: 5, reed: 2 },
      { clay: 2, reed: 1, wood: 1 },
    ]))
  })

  it('does NOT apply when houseType=wood', () => {
    const { player } = setup('wood')
    player.resources = { wood: 5, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 } as any
    const result = buildRoomCostPerUnit(player) as any
    const fees = result.fees ?? [result]
    expect(fees.every((f: any) => !('clay' in f))).toBe(true)
  })
})
