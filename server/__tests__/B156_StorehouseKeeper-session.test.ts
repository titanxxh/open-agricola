import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B156_StorehouseKeeper'
import type { ActionChoiceOption } from '../../shared/contract/types'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit30Native from './_helpers/audit/ae-negative-30-native'

const CARD_ID = 'B156_StorehouseKeeper'

describe('B156_StorehouseKeeper session', () => {
  const setup = () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    state.players[1]!.workersAvailable = 2
    state.players.slice(2).forEach((extraPlayer) => setWorkersAtHome(state, extraPlayer, 0))

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
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      const opts = resp.interaction.request.options ?? []
      const clayOpt = opts.find((o: ActionChoiceOption) =>
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

describe('ae-negative-30-native', () => {
  const { sessions, commands, save, make, take, finish, play, undo, res } = audit30Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); commands.splice(0); });
  it('B156 N1 real purchase and Resource Market choose exactly one clay', () => { const b = make('B156_StorehouseKeeper', undefined, false), bought = finish(b, play(b, 'B156_StorehouseKeeper')), u = undo(b), s = make('B156_StorehouseKeeper'), r = finish(s, take(s, 0, 'resource-market-4'), true, ['"clay"']); res(r, { reed: 1, stone: 1, food: 101, clay: 1, grain: 0 }); save('B156-N1', { bought, u, r }); });
  it('B156 N2 grain alternative rejects an invented option before a legal choice', () => { const s = make('B156_StorehouseKeeper'), p = take(s, 0, 'resource-market-4'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'invented-b156')), r = finish(s, p, true, ['"grain"']); res(r, { grain: 1, clay: 0, reed: 1, stone: 1, food: 101 }); save('B156-N2', { p, bad, r }); });
  it('B156 N3 hand opponent and unrelated work have no Storehouse choice', () => { for (const mode of ['hand', 'opponent', 'unrelated']) {
      const a = mode === 'opponent' ? 1 : 0, s = make('B156_StorehouseKeeper', st => { st.currentPlayerIndex = a; }, mode !== 'hand'), p = take(s, a, mode === 'unrelated' ? 'grain-seeds' : 'resource-market-4'), r = finish(s, p, true, [], 'B156_StorehouseKeeper');
      res(r, { grain: mode === 'unrelated' ? 1 : 0, clay: 0 });
      save(`B156-N3-${mode}`, { p, r });
  } });
})
