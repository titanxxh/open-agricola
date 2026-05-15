import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A143_Stonecutter } from '../../shared/cards-display/A/A143_Stonecutter'
import { D15_ClaySupports } from '../../shared/cards-display/D/D15_ClaySupports'
import { setWorkersAtHome } from '../../shared/domain/player'
import { buildRoomCostPerUnit } from '../../shared/actions/payment/internal/room-payment'

// Keep side-effect imports referenced.
void A143_Stonecutter
void D15_ClaySupports

describe('D15 ClaySupports + A143 Stonecutter stacking', () => {
  it('D15 trade modifier is registered via play-path (no manual activeModifiers injection)', () => {
    // Both cards register through their cards-display static fields and reach
    // `player.activeModifiers` via `rebuildActiveModifiers` during loadState.
    // D15 targets `construct`; A143 contributes a BonusModifier (`construct`,
    // stone -1) plus other listener paths. This test exercises the same
    // gameplay path used by the production server (no test-only injection
    // into `activeModifiers`).
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = ['A143_Stonecutter']
    player.minorPlayed = ['D15_ClaySupports']
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
    expect(after.minorPlayed).toContain('D15_ClaySupports')
    expect(after.occupationPlayed).toContain('A143_Stonecutter')
    expect(after.houseType).toBe('clay')

    // D15 trade modifier must be present on activeModifiers after loadState.
    expect(after.activeModifiers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'trade',
        cardId: 'D15_ClaySupports',
        appliesTo: ['construct'],
        from: { wood: 1 },
        to: { clay: 3, reed: 1 },
        conditions: { houseTypeClay: 1 },
      }),
    ]))

    // Cost preview for a clay-room construct must offer the trade alternative.
    const costPreview = buildRoomCostPerUnit(after) as any
    const fees = costPreview.fees ?? [costPreview]
    expect(fees).toEqual(expect.arrayContaining([
      { clay: 5, reed: 2 },                  // base
      { clay: 2, reed: 1, wood: 1 },          // D15 alternative
    ]))
  })
})
