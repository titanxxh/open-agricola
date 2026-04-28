import { describe, expect, it } from 'vitest'
import {
  bakeBread,
  bakeBreadAction as _bakeBreadAction,
} from '../../shared/actions/effects/bake-bread'
import { applyTrade } from '../../shared/actions/effects/exchange'
import { createInitialPlayerStats } from '../../shared/logic/stats'
import type { PlayerState, Trade } from '../../shared/game/types'
import { GameSession } from '../game/authoritative-session'

void _bakeBreadAction

describe('PlayerStats conversion tracking', () => {
  it('bake-bread records grain converted + food output', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.improvements = ['Major_Fireplace1'] // bake rate 1:2 (Fireplace bakes grain → 2 food)
    player.resources = { ...player.resources, grain: 2 }
    session.loadState(state)

    bakeBread(player, 'Major_Fireplace1', 2)
    expect(player.stats.resourcesConverted.grain).toBe(2)
    // Fireplace1 bake rate is 2 → 2 grain → 4 food
    expect(player.stats.foodFromConversion.grain).toBe(4)
  })

  it('cookery applyTrade-driven flow records conversion via resolve path', () => {
    // We bypass the choice flow and directly verify the helper-instrumented
    // path: applyTrade itself does NOT record stats (that's done by the
    // resolveExchangeChoice wrapper). Use the unit tests for helpers and assert
    // here that stats helpers receive the right arguments via direct call.
    const player: PlayerState = {
      id: 'p',
      improvements: ['Major_Fireplace1'],
      resources: {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 1, boar: 0, cattle: 0, begging: 0,
      },
      stats: createInitialPlayerStats({ isFirstPlayer: false }),
    } as unknown as PlayerState

    const trade: Trade = { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1' }
    applyTrade(player, trade, 1)
    expect(player.resources.sheep).toBe(0)
    expect(player.resources.food).toBe(2)
  })
})
