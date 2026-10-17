import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { plowAction } from '../../shared/actions/effects/plow'
import type { ActionFlow, ActionSpace } from '../../shared/contract/types'

import { D001_ZigzagHarrow } from '../../shared/cards/D/D001_ZigzagHarrow'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit13Minor from './_helpers/audit/ae-negative-13-minor'

describe('D001_ZigzagHarrow session', () => {
  const setupZigzagState = (withStable = false) => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 0, col: 3, stacks: [] },
      { row: 1, col: 3, stacks: [] },
    ]
    player.roomTiles = [
      { row: 2, col: 0 },
      { row: 1, col: 0 },
    ]
    player.stableTiles = withStable ? [{ row: 1, col: 4 }] : []
    player.minorPlayed.push('D001_ZigzagHarrow')
    session.loadState(state)
    return { session: session, state, player }
  }

  const getD1PlowLeaf = (ruleOwner: SessionRuleOwner, state: ReturnType<typeof setupZigzagState>['state'], player: ReturnType<typeof setupZigzagState>['player']) => {
    const flow = ruleOwner.withCtx(() => runCardEffectHook(state, player, 'D001_ZigzagHarrow', 'onBuy'))
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('plow')
    return leaf
  }

  it('onBuy returns optional plow leaf restricted to raw zigzag candidates', () => {
    const { session: ruleSession, state, player } = setupZigzagState(true)
    const leaf = getD1PlowLeaf(ruleSession, state, player)
    expect(leaf.optional).toBe(true)
    expect(leaf.sourceCard).toBe('D001_ZigzagHarrow')
    expect(leaf.actionContext?.allowedTiles).toEqual([
      { row: 1, col: 4 },
      { row: -1, col: 2 },
    ])
  })

  it('D1 plow farm-select only offers zigzag selectable tiles', () => {
    const { session: ruleSession, state, player } = setupZigzagState()
    const leaf = getD1PlowLeaf(ruleSession, state, player)

    const result = ruleSession.withCtx(() => plowAction.execute({
      state,
      player,
      space: { id: 'plow' } as ActionSpace,
      sourceCard: leaf.sourceCard,
      actionContext: leaf.actionContext,
    }))

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.kind).toBe('farm-select')
    if (result.request.kind !== 'farm-select') return
    expect(result.request.farm.selectableTiles.map((tile) => `${tile.row}-${tile.col}`)).toEqual(['1-4'])
  })

  it('D1 plow rejects non-zigzag tile', () => {
    const { session: ruleSession, state, player } = setupZigzagState()
    const leaf = getD1PlowLeaf(ruleSession, state, player)

    const result = ruleSession.withCtx(() => plowAction.resolveChoice!(
      {
        state,
        player,
        space: { id: 'plow' } as ActionSpace,
        sourceCard: leaf.sourceCard,
        actionContext: leaf.actionContext,
        eventSink: { emit: () => undefined },
      },
      'confirm',
      { tile: { row: 1, col: 2 } },
    ))

    expect(result.type).toBe('fail')
    expect(player.fields).not.toContainEqual({ row: 1, col: 2, stacks: [] })
  })

  describe('prerequisite', () => {
    it('blocks when player has fewer than 2 fields', () => {
      const session = new GameSession(42)
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [{ row: 0, col: 0, stacks: [] }]
      expect(session.withCtx(() => meetsCardPrerequisites(player, D001_ZigzagHarrow, state.round, state))).toBe(false)
    })

    it('allows when fields can complete a zigzag pattern', () => {
      const session = new GameSession(42)
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 1, stacks: [] },
        { row: 1, col: 1, stacks: [] },
      ]
      expect(session.withCtx(() => meetsCardPrerequisites(player, D001_ZigzagHarrow, state.round, state))).toBe(true)
    })

    it('allows when a raw zigzag candidate is occupied by a stable', () => {
      const session = new GameSession(42)
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [
        { row: 0, col: 2, stacks: [] },
        { row: 0, col: 3, stacks: [] },
        { row: 1, col: 3, stacks: [] },
      ]
      player.stableTiles = [{ row: 1, col: 4 }]
      expect(session.withCtx(() => meetsCardPrerequisites(player, D001_ZigzagHarrow, state.round, state))).toBe(true)
    })
  })
})

describe('ae-negative-13-minor', () => {
  const { ZIG, sessions, save, ok, setup, enterMinor, buy, optional, zigzag } = audit13Minor
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('D001 N1 one wood L shaped farm plows exactly one zigzag completion and passes', () => {
    const session = setup(ZIG, 1, zigzag); const pending = optional(session, buy(session, ZIG), true)
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select' && pending.interaction.request.farm.farmType === 'plow')
    const tiles = pending.interaction.request.farm.selectableTiles; assert(tiles.length)
    const r = ok(session.commitSelectionChoice(0, { tile: tiles[0] })); assert.equal(r.state.players[0]!.fields.length, 4); assert.equal(r.state.players[0]!.resources.wood, 0); assert(r.state.players[1]!.minorHand.includes(ZIG)); save('D001-N1', r)
  })
  it('D001 N2 straight fewer and missing L shaped fields cannot pay or plow', () => {
    for (const fields of [[], [{ row: 0, col: 2, stacks: [] }], [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }, { row: 0, col: 3, stacks: [] }]]) {
      const session = setup(ZIG, 1, state => state.players[0]!.fields = fields); const r = enterMinor(session)
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction)); assert(!r.interaction.request.options.some(o => o.value === ZIG && !o.disabled)); assertRejectedUnchanged(session, () => session.resolveChoice(0, ZIG)); const legal = ok(session.resolveChoice(0, 'A030_BakingSheet')); assert.equal(legal.state.players[0]!.fields.length, fields.length); assert.equal(legal.state.players[0]!.resources.wood, 1); save(`D001-N2-${fields.length}`, legal)
    }
  })
  it('D001 N3 wrong target room outside farm and actor reject before exact legal retry', () => {
    const session = setup(ZIG, 1, zigzag); const r = optional(session, buy(session, ZIG), true)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow'); const tiles = r.interaction.request.farm.selectableTiles
    for (const tile of [{ row: 1, col: 0 }, { row: 99, col: 99 }, { row: 2, col: 4 }]) assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile }))
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { tile: tiles[0] })); const legal = ok(session.commitSelectionChoice(0, { tile: tiles[0] })); assert.equal(legal.state.players[0]!.fields.length, 4); save('D001-N3', legal)
  })
  it('D001 N4 optional decline plows none and whole undo restores field wood and passing', () => {
    const declinedSession = setup(ZIG, 1, zigzag); const declined = optional(declinedSession, buy(declinedSession, ZIG), false); assert.equal(declined.state.players[0]!.fields.length, 3); assert.equal(declined.state.players[0]!.resources.wood, 0)
    const session = setup(ZIG, 1, zigzag); const pending = optional(session, buy(session, ZIG), true); assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'farm-select' && pending.interaction.request.farm.farmType === 'plow'); const r = ok(session.commitSelectionChoice(0, { tile: pending.interaction.request.farm.selectableTiles[0] }))
    const undone = ok(session.undoAction()); assert.equal(undone.state.players[0]!.fields.length, 3); assert.equal(undone.state.players[0]!.resources.wood, 1); assert(undone.state.players[0]!.minorHand.includes(ZIG)); assert(!undone.state.players[1]!.minorHand.includes(ZIG)); save('D001-N4', { r, undone, declined })
  })
})
