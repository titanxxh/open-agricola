import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'
import { D015_ClaySupports } from '../../shared/cards/D/D015_ClaySupports'
import { setWorkersAtHome } from '../../shared/domain/player'
import { computePaymentOptionsForTest } from '../../shared/actions/payment/__tests__/test-helpers'

// Keep side-effect imports referenced.
void A143_Stonecutter
void D015_ClaySupports

describe('D15 ClaySupports via play-path (with A143 Stonecutter co-played)', () => {
  it('D15 trade modifier is registered via play-path with scope:unit, surfaces in construct enumeration', () => {
    // Both cards register through their cards static fields and reach
    // `player.activeModifiers` via `rebuildActiveModifiers` during loadState.
    // D15 targets `construct`; A143 contributes a BonusModifier (`construct`,
    // stone -1) plus other listener paths. This test exercises the same
    // gameplay path used by the production server (no test-only injection
    // into `activeModifiers`).
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players.forEach((p) => {
      ;(p as any).minorHand = ['__test_placeholder__']
      ;(p as any).occupationHand = ['__test_placeholder__']
    })
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = ['A143_Stonecutter']
    player.minorPlayed = ['D015_ClaySupports']
    player.houseType = 'clay'
    player.resources = {
      ...player.resources,
      wood: 3,
      clay: 5,
      reed: 3,
      stone: 0,
    }
    session.loadState(state)

    const after = session.getState().state.players[0]!
    expect(after.minorPlayed).toContain('D015_ClaySupports')
    expect(after.occupationPlayed).toContain('A143_Stonecutter')
    expect(after.houseType).toBe('clay')

    // D15 trade modifier must be present on activeModifiers after loadState
    // with scope:'unit' (T5.2 migration).
    expect(after.activeModifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'trade',
          cardId: 'D015_ClaySupports',
          appliesTo: ['construct'],
          scope: 'unit',
          from: { wood: 1 },
          to: { clay: 3, reed: 1 },
          conditions: { houseTypeClay: 1 },
        }),
      ]),
    )

    // Construct enumeration for 1 clay room surfaces both base and D15 swap.
    const sols = computePaymentOptionsForTest(
      after,
      { unitFee: { clay: 5, reed: 2 }, nb: 1 },
      'construct',
    )
    expect(sols.length).toBeGreaterThan(0)

    // Σ-times across solutions covers k∈{0,1} (single room, scope:unit budget = nb = 1).
    const swapCounts = new Set(
      sols.map((s) => s.tradesUsed.reduce((acc, t) => acc + t.times, 0)),
    )
    expect(swapCounts).toEqual(new Set([0, 1]))

    // Affordability with {wood:3, clay:5, reed:3}: both k=0 and k=1 affordable.
    const k0 = sols.find((s) => s.tradesUsed.every((t) => t.times === 0))
    expect(k0).toBeDefined()
    expect(k0!.resourcesPaid.clay).toBe(5)
    expect(k0!.resourcesPaid.reed).toBe(2)

    const k1 = sols.find((s) =>
      s.tradesUsed.some((t) => t.times === 1 && t.trade.from.wood === 1),
    )
    expect(k1).toBeDefined()
    // D15 swap: pays clay:2 + reed:1 + wood:1.
    expect(k1!.resourcesPaid.clay).toBe(2)
    expect(k1!.resourcesPaid.reed).toBe(1)
    expect(k1!.resourcesPaid.wood).toBe(1)
  })
})
