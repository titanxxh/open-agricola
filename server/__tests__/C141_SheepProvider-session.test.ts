import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/C/C141_SheepProvider'
import * as audit53Cards from './_helpers/audit/ae-negative-53-cards'

const CARD_ID = 'C141_SheepProvider'

describe('C141_SheepProvider session', () => {
  const setup = (currentPlayerIndex: number, played = true) => {
    const session = new GameSession(141, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 14

    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.grain = 0
    })

    const owner = state.players[0]!
    if (played) owner.occupationPlayed.push(CARD_ID)
    else owner.occupationHand = [CARD_ID]

    // Ensure sheep-market is the first round action (opens at round 1)
    state.roundActionOrder = state.roundActionOrder.map((id) =>
      id === 'sheep-market' ? null : id,
    )
    state.roundActionOrder[0] = 'sheep-market'

    // Ensure sheep-market has accumulated resources
    const sheepMarket = state.actionSpaces.find((s) => s.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market space missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)
    return session
  }

  it('C141 S1: playing Sheep Provider through Lessons keeps the occupation in play', () => {
    const response = setup(0, false).takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('C141 S3: another player using Sheep Market gives the owner one grain', () => {
    const session = setup(1)
    const grainBefore = session.getState().state.players[0]!.resources.grain

    // Opponent takes sheep-market; sheep collection triggers animalReorg first
    let resp = session.takeAction(1, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Confirm animal reorg for opponent (p1) — engine finishes, after-hooks fire
    resp = session.resolveChoice(1, 'confirm', [])

    // After-hooks silently switch to owner, auto-gain grain, and switch back
    // Grain should be gained by owner (no confirmPlayerSwitch needed for auto-gains)
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('C141 S2: the owner using Sheep Market gains one grain', () => {
    const session = setup(0)
    const grainBefore = session.getState().state.players[0]!.resources.grain

    // Owner takes sheep-market; sheep collection triggers animalReorg first
    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')

    // Confirm animal reorg for owner — engine finishes, after-hooks fire
    // No PlayerSwitch needed since owner triggered it
    resp = session.resolveChoice(0, 'confirm', [])

    // Grain should be gained by owner
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('C141 S4: an unrelated action gives the owner no grain', () => {
    const response = setup(0).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('ae-negative-53-cards', () => {
  const { sessions, save, ok, make, finish, ready, resources, pool } = audit53Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C141 N1 owner and actual opponent Sheep Market each grant owner exactly one grain without rewarding third player', () => { const s = make('C141_SheepProvider', st => pool(st, 'sheep-market', 'sheep', 1)), r = finish(s, ok(s.takeAction(0, 'sheep-market')), false); resources(r, { grain: 1, sheep: 1 }); resources(r, { grain: 0 }, 2); const c = make('C141_SheepProvider', st => pool(st, 'sheep-market', 'sheep', 1)); finish(c, ok(c.takeAction(0, 'day-laborer')), false); ready(c); const cr = finish(c, ok(c.takeAction(1, 'sheep-market')), false); resources(cr, { grain: 1 }); resources(cr, { grain: 0, sheep: 1 }, 1); resources(cr, { grain: 0 }, 2); save('C141-N1', { r, cr }) })
  it('C141 N2 nonmarket use and unplayed Sheep Provider cannot grant extra grain', () => { const s = make('C141_SheepProvider'), r = finish(s, ok(s.takeAction(0, 'grain-seeds')), false); resources(r, { grain: 1 }); const c = make('C141_SheepProvider', st => pool(st, 'sheep-market', 'sheep', 1), false), cr = finish(c, ok(c.takeAction(0, 'sheep-market')), false); resources(cr, { grain: 0, sheep: 1 }); save('C141-N2', { r, cr }) })
})
