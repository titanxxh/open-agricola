import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { isMinorImprovementPlayable, playMinorImprovement } from '../../shared/actions/effects/improvement'
import { buildRenovationPlan, canRenovate } from '../../shared/actions/effects/renovation'

import '../../shared/cards/A/A010_WoodenShed'
import { A010_WoodenShed } from '../../shared/cards/A/A010_WoodenShed'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { familySize } from '../../shared/domain/player'
import * as audit05Housing from './_helpers/audit/ae-negative-05-housing'

const CARD_ID = 'A010_WoodenShed'

describe('A010_WoodenShed session', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('prerequisite passes in wood house', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.houseType).toBe('wood')
    expect(session.withCtx(() => meetsCardPrerequisites(player, A010_WoodenShed, state.round, state))).toBe(true)
  })

  it('prerequisite fails when house is clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(session.withCtx(() => meetsCardPrerequisites(player, A010_WoodenShed, state.round, state))).toBe(false)
  })

  it('adds +1 extra room capacity when played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(0)
    player.minorPlayed.push(CARD_ID)
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(1)
  })

  it('blocks direct renovation planning when played', () => {
    const session = setup()
    const player = session.getState().state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = player.rooms
    player.resources.reed = 1

    expect(buildRenovationPlan(player, 'clay')).toBeNull()
    expect(canRenovate(player)).toBe(false)
  })

  describe('Major-Improvement-action gate', () => {
    const givePayResources = (player: ReturnType<GameSession['getState']>['state']['players'][number]) => {
      player.resources.wood = 5
      player.resources.reed = 5
    }

    it('is not playable through the minor-improvement action space', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      expect(session.withCtx(() => isMinorImprovementPlayable(state, player, CARD_ID, 'improvement', undefined, ['minor']))).toBe(false)
    })

    it('is playable through the improvement-any (Major Improvement) action space', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      expect(session.withCtx(() => isMinorImprovementPlayable(state, player, CARD_ID, 'improvement-any'))).toBe(true)
    })

    it('playMinorImprovement(actionCardId="minor-improvement") fails for A10', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      const result = session.withCtx(() => playMinorImprovement(state, player, CARD_ID, 'minor-improvement', undefined, undefined, undefined, session.actionHooks))
      expect(result.type).toBe('fail')
      expect(player.minorPlayed).not.toContain(CARD_ID)
    })

    it('playMinorImprovement(actionCardId="improvement-any") succeeds for A10', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      const result = session.withCtx(() => playMinorImprovement(state, player, CARD_ID, 'improvement-any', undefined, undefined, undefined, session.actionHooks))
      expect(result.type === 'ok' || result.type === 'flow').toBe(true)
      expect(player.minorPlayed).toContain(CARD_ID)
    })
  })
})

describe('ae-negative-05-housing', () => {
  const { SHED, sessions, ok, setup, choose, ready, turn, purchaseFrom, purchase, blockedPurchase, finishGrowth } = audit05Housing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  describe('Wooden Shed negative audit', () => {
    it('A010 N1 actual purchase enforces cost wooden house and major permission with undo', () => {
      blockedPurchase(setup({ resources: { wood: 1, reed: 1 } }), SHED)
      blockedPurchase(setup({ resources: { wood: 2, reed: 0 } }), SHED)
      blockedPurchase(setup({ houseType: 'clay', resources: { wood: 2, reed: 1 } }), SHED)
      blockedPurchase(setup({ resources: { wood: 2, reed: 1 } }), SHED, 'meeting-place')
      const s = setup({ resources: { wood: 2, reed: 1 } }); const before = undoRuleSnapshot(s.getState())
      let r = ok(purchase(s, SHED)); assert.ok(r.state.players[0]!.minorPlayed.includes(SHED)); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(r.state.players[0]!.resources.reed, 0)
      assertUndoRestored(before, s.undoAction()); r = ok(purchase(s, SHED)); assert.equal(r.state.players[0]!.rooms, 2)
    })
    it('A010 N2 actual growth uses exactly one extra room and undo restores the newborn', () => {
      const s = setup({ round: 5, played: true }); turn(s, 0, 'grain-seeds'); turn(s, 1, 'forest')
      ready(s, 0); const before = undoRuleSnapshot(s.getState())
      let r = finishGrowth(s, turn(s, 0, 'wish-children')); assert.equal(familySize(r.state.players[0]!), 3); assert.equal(r.state.players[0]!.rooms, 2)
      assertUndoRestored(before, s.undoAction()); r = finishGrowth(s, turn(s, 0, 'wish-children')); assert.equal(familySize(r.state.players[0]!), 3)
      r = confirmNext(s, turn(s, 1, 'clay-pit')); assert.equal(r.state.round, 6); assert.equal(r.interaction.stateId, 'idle')
      assertRejectedUnchanged(s, () => s.takeAction(0, 'wish-children'))
      r = turn(s, 0, 'grain-seeds'); assert.equal(familySize(r.state.players[0]!), 3)
    })
    it('A010 N3 Shed blocks renovation while renovation first excludes buying Shed', () => {
      const s = setup({ played: true, resources: { clay: 2, reed: 1, wood: 8 } })
      for (const id of ['house-redevelopment', 'farm-redevelopment']) assertRejectedUnchanged(s, () => s.takeAction(0, id))
      const control = setup({ resources: { clay: 2, reed: 1, wood: 2 } })
      let r = turn(control, 0, 'house-redevelopment')
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = choose(control, r, o => o.value === '__skip__')
      assert.equal(r.state.players[0]!.houseType, 'clay'); assert.equal(r.state.players[0]!.resources.clay, 0); assert.equal(r.state.players[0]!.resources.reed, 0)
      assert.ok(r.state.players[0]!.minorHand.includes(SHED)); assertRejectedUnchanged(control, () => control.resolveChoice(0, SHED))
    })
    it('A010 N4 Angler grants the required major purchase permission', () => {
      const s = setup({ angler: true, resources: { wood: 2, reed: 1 } }); const r = purchaseFrom(s, turn(s, 0, 'fishing'), SHED)
      assert.ok(r.state.players[0]!.minorPlayed.includes(SHED)); assert.deepEqual({ wood: r.state.players[0]!.resources.wood, reed: r.state.players[0]!.resources.reed, food: r.state.players[0]!.resources.food }, { wood: 0, reed: 0, food: 41 })
    })
  })
})
