import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionSpace } from '../../shared/contract/types'

import '../../shared/cards/C/C125_Nightworker'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import { workersAtHome } from '../../shared/domain/player'
import * as audit50Cards from './_helpers/audit/ae-negative-50-cards'

const CARD_ID = 'C125_Nightworker'

describe('C125_Nightworker session — place-farmer flow', () => {
  const setupSession = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    return { session, state }
  }

  it('onBeforeWork returns optional place-farmer leaf with constraints when player has 0 of a building resource', () => {
    const { session: ruleSession, state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.clay = 5
    player.resources.reed = 3
    player.resources.stone = 2

    // Ensure at least one wood-accumulation space is set up unoccupied with
    // wood resource.
    const woodSpace = state.actionSpaces.find(
      (s: ActionSpace) => (s.gainPerRound.wood ?? 0) > 0,
    )
    if (!woodSpace) throw new Error('expected a wood accumulation space in default board')
    woodSpace.resources.wood = 3
    woodSpace.takenBy = []

    const effect = ruleSession.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = ruleSession.withCtx(() => effect!.onBeforeWork!(state, player)) as ActionFlow | undefined
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    if (flow!.type !== 'leaf') return
    expect(flow!.actionId).toBe('place-farmer')
    expect(flow!.optional).toBe(true)
    expect(flow!.sourceCard).toBe(CARD_ID)
    const constraints = (flow!.actionContext as { constraints?: string[] } | undefined)?.constraints
    expect(Array.isArray(constraints)).toBe(true)
    expect(constraints).toContain(woodSpace.id)
  })

  it('onBeforeWork returns undefined when player already has all building resource types', () => {
    const { session: ruleSession, state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 1
    player.resources.clay = 1
    player.resources.reed = 1
    player.resources.stone = 1

    const flow = ruleSession.withCtx(() => ruleSession.withCtx(() => getCardEffect(CARD_ID))!.onBeforeWork!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onBeforeWork returns undefined when no candidate accumulation space has a missing-type resource', () => {
    const { session: ruleSession, state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.clay = 1
    player.resources.reed = 1
    player.resources.stone = 1

    state.actionSpaces.forEach((s: ActionSpace) => {
      s.resources.wood = 0
    })

    const flow = ruleSession.withCtx(() => ruleSession.withCtx(() => getCardEffect(CARD_ID))!.onBeforeWork!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onBeforeWork skips occupied accumulation spaces (uses standard place-farmer rules)', () => {
    const { session: ruleSession, state } = setupSession()
    const player = state.players[0]!
    const opponent = state.players[1]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.resources.clay = 5
    player.resources.reed = 3
    player.resources.stone = 2

    // Mark every wood space as taken by opponent.
    let anyWood = false
    state.actionSpaces.forEach((s: ActionSpace) => {
      if ((s.gainPerRound.wood ?? 0) > 0) {
        s.resources.wood = 3
        s.takenBy = [{ playerId: opponent.id, workerId: 'w1' }]
        anyWood = true
      }
    })
    expect(anyWood).toBe(true)

    const flow = ruleSession.withCtx(() => ruleSession.withCtx(() => getCardEffect(CARD_ID))!.onBeforeWork!(state, player))
    expect(flow).toBeUndefined()
  })

  it('onBeforeWork returns undefined when player has no available worker', () => {
    const { session: ruleSession, state } = setupSession()
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 0
    player.workers.forEach((w) => {
      w.isActive = false
    })

    const flow = ruleSession.withCtx(() => ruleSession.withCtx(() => getCardEffect(CARD_ID))!.onBeforeWork!(state, player))
    expect(flow).toBeUndefined()
  })
})

describe('ae-negative-50-cards', () => {
  const { sessions, save, ok, make, finish, reach, resources, extraPlace } = audit50Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C125 N1 natural before-work placement collects missing wood with one regular person', () => { const s = make('C125_Nightworker', undefined, true, 5); const p = reach(s, 6), r = finish(s, extraPlace(s, p, 'C125_Nightworker', 'forest'), false); assert.equal(r.state.round, 6); resources(r, { wood: 3 }); assert.equal(workersAtHome(r.state, r.state.players[0]!).length, 1); assert.equal(r.state.currentPlayerIndex, 0); assert.equal(r.state.actionSpaces.find(a => a.id === 'forest')!.takenBy.length, 1); save('C125-N1', { p, r }) })
  it('C125 N2 decline or owning all building resources suppresses extra placement while illegal nonaccumulation target rejects', () => { const c = make('C125_Nightworker', undefined, true, 5), cr = finish(c, reach(c, 6), false); resources(cr, { wood: 0 }); assert.equal(workersAtHome(cr.state, cr.state.players[0]!).length, 2); const a = make('C125_Nightworker', st => Object.assign(st.players[0]!.resources, { wood: 1, clay: 1, reed: 1, stone: 1 }), true, 5), ar = finish(a, reach(a, 6), false); assert.equal(workersAtHome(ar.state, ar.state.players[0]!).length, 2); const s = make('C125_Nightworker', undefined, true, 5); let p = reach(s, 6); while (p.interaction.stateId === 'wait' && p.interaction.promptKey !== 'ui.interactionPlaceFarmerExtra') { const i = p.interaction; assert.ok(i.request.kind === 'choice' || i.request.kind === 'select-trigger'); const o = i.request.options.find(o => o.sourceCard === 'C125_Nightworker' && o.value !== '__skip__' && o.value !== '__pass__'); assert.ok(o); p = ok(s.resolveChoice(i.playerIndex, o.value)) } const rejected = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'day-laborer')), r = finish(s, extraPlace(s, p, 'C125_Nightworker', 'forest'), false); resources(r, { wood: 3 }); save('C125-N2', { cr, ar, p, rejected, r }) })
})
