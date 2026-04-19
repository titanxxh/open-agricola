import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B156_StorehouseKeeper'

const CARD_ID = 'B156_StorehouseKeeper'

describe('B156_StorehouseKeeper session', () => {
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    state.players[1]!.workersAvailable = 2

    session.loadState(state)
    return session
  }

  it('offers XOR choice between clay and grain after resource-market-4', () => {
    const session = setup()
    const p = session.getState().state.players[0]!
    const clayBefore = p.resources.clay
    const grainBefore = p.resources.grain
    let resp = session.takeAction(0, 'resource-market-4')
    expect(resp.ok).toBe(true)

    // Resolve the clay/grain XOR by choosing clay
    let safety = 10
    while (safety-- > 0 && resp.pending?.type === 'choice') {
      const opts = resp.pending.options ?? []
      const clayOpt = opts.find((o: any) =>
        JSON.stringify(o).toLowerCase().includes('clay'),
      )
      if (clayOpt) {
        resp = session.resolveChoice(0, clayOpt.value)
        break
      }
      resp = session.resolveChoice(0, opts[0]!.value)
    }

    const after = resp.state.players[0]!
    // resource-market-4 baseline gives food+reed+stone. Plus Keeper = +1 clay OR +1 grain
    const clayDelta = after.resources.clay - clayBefore
    const grainDelta = after.resources.grain - grainBefore
    expect(clayDelta + grainDelta).toBe(1)
  })

  it('does not trigger on unrelated spaces', () => {
    const session = setup()
    const p = session.getState().state.players[0]!
    const clayBefore = p.resources.clay
    const grainBefore = p.resources.grain
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(clayBefore)
    expect(after.resources.grain).toBe(grainBefore)
  })
})
