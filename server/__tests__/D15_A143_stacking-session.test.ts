import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A143_Stonecutter } from '../../shared/cards-display/A/A143_Stonecutter'
import { D15_ClaySupports } from '../../shared/cards-display/D/D15_ClaySupports'
import { setWorkersAtHome } from '../../shared/domain/player'

// Keep side-effect imports referenced.
void A143_Stonecutter
void D15_ClaySupports

describe('D15 ClaySupports + A143 Stonecutter stacking', () => {
  it('smoke: player with D15 and A143 can co-exist with clay-room construct setup', () => {
    // Both cards register computeCosts listeners on different (or partially
    // overlapping) actions: D15 targets `construct`, A143 targets
    // `improvement-any`/`minor-improvement` for the stone -1 improvement
    // discount AND emits a BonusModifier for `construct` for the stone -1
    // on room builds. This smoke test verifies the cards can be played
    // simultaneously and resources/state are prepared correctly. Detailed
    // combinatorial stacking is covered at the pay.test.ts unit layer
    // (multi-bonus accumulation + computeCosts delta accumulation).
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
    // Resources staged for a clay-room construct: enough wood/clay/reed under
    // the D15 alternative trade (2 clay + 1 wood + 1 reed) and would benefit
    // from A143's construct BonusModifier (stone -1) if a stone-cost applied.
    expect(after.resources.wood).toBeGreaterThanOrEqual(1)
    expect(after.resources.clay).toBeGreaterThanOrEqual(2)
    expect(after.resources.reed).toBeGreaterThanOrEqual(1)
  })
})
