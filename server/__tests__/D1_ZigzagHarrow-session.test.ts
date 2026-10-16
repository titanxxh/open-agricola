import { expectWait } from './_helpers/trigger-select'
import { type GameSession as SessionRuleOwner, GameSession, type SessionResponse } from '../game/authoritative-session'
import { describe, expect, it } from 'vitest'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { plowAction } from '../../shared/actions/effects/plow'
import { createBufferedEventSink } from '../../shared/engine/card-trigger-events'
import { type GameState } from '../../shared/contract/types'
import { D001_ZigzagHarrow } from '../../shared/cards/D/D001_ZigzagHarrow'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions, expectTileFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('D001_ZigzagHarrow session', () => {
  const setupZigzagState = (withStable = false) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
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
    assert.ok(flow?.type === 'leaf')
    const leaf = flow
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
      space: state.actionSpaces.find(space => space.id === 'farmland')!,
      actionHooks: ruleSession.actionHooks,
      eventSink: createBufferedEventSink().sink,
      sourceCard: leaf.sourceCard,
      actionContext: leaf.actionContext,
    }))

    assert.ok(result.type === 'request')
    assert.ok(result.request.kind === 'farm-select')
    assert.ok(result.request.farm.farmType === 'plow')
    expect(result.request.farm.selectableTiles.map((tile) => `${tile.row}-${tile.col}`)).toEqual(['1-4'])
  })

  it('D1 plow rejects non-zigzag tile', () => {
    const { session: ruleSession, state, player } = setupZigzagState()
    const leaf = getD1PlowLeaf(ruleSession, state, player)

    const result = ruleSession.withCtx(() => plowAction.resolveChoice!(
      {
        state,
        player,
        space: state.actionSpaces.find(space => space.id === 'farmland')!,
        actionHooks: ruleSession.actionHooks,
        sourceCard: leaf.sourceCard,
        actionContext: leaf.actionContext,
        eventSink: createBufferedEventSink().sink,
      },
      'confirm',
      { tile: { row: 1, col: 2 } },
    ))

    expect(result.type).toBe('fail')
    expect(player.fields).not.toContainEqual({ row: 1, col: 2, stacks: [] })
  })

  describe('prerequisite', () => {
    it('blocks when player has fewer than 2 fields', () => {
      const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
      const state = session.getState().state
      const player = state.players[0]!
      player.fields = [{ row: 0, col: 0, stacks: [] }]
      expect(session.withCtx(() => meetsCardPrerequisites(player, D001_ZigzagHarrow, state.round, state))).toBe(false)
    })

    it('allows when fields can complete a zigzag pattern', () => {
      const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
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
      const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
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

describe("D001 command boundaries", () => {
    const ZIG = 'D001_ZigzagHarrow';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
    function setup(wood: number, configure: (state: GameState) => void = () => { }) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 14;
                for (const p of state.players)
                    Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.resources.wood = wood;
                state.players[0]!.minorHand = [ZIG, 'A030_BakingSheet', 'A016_RammedClay'];
                configure(state);
            } }));
        return session;
    }
    function enterMinor(session: GameSession) {
        let r = ok(session.takeAction(0, 'meeting-place'));
        assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice');
        const action = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'));
        assert.ok(action, JSON.stringify(r.interaction));
        r = ok(session.resolveChoice(0, action.value));
        return r;
    }
    function buy(session: GameSession, card: string) {
        let r = enterMinor(session);
        if (r.state.players[0]!.minorHand.includes(card)) {
            assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice', JSON.stringify(r.interaction));
            const option = getChoiceOptions(r).find(o => o.value === card);
            assert.ok(option, JSON.stringify(r.interaction));
            r = ok(session.resolveChoice(0, option.value));
        }
        assert(r.state.players[1]!.minorHand.includes(card));
        return r;
    }
    function optional(session: GameSession, r: SessionResponse, accept: boolean) {
        assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice', JSON.stringify(r.interaction));
        assert.equal(r.interaction.sourceCard, ZIG);
        const matching = getChoiceOptions(r).filter(option => accept ? option.sourceCard === ZIG && !option.disabled : option.value === '__skip__');
        assert.equal(matching.length, 1, JSON.stringify(r.interaction));
        const option = matching[0]!;
        return ok(session.resolveChoice(0, option.value));
    }
    function zigzag(state: GameState) { state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }, { row: 0, col: 3, stacks: [] }, { row: 1, col: 3, stacks: [] }]; }
    it("one wood L shaped farm plows exactly one zigzag completion and passes", () => {
        const session = setup(1, zigzag);
        const pending = optional(session, buy(session, ZIG), true);
        assert.equal(expectTileFarmSelection(pending, 'plow').farmType, 'plow');
        const tiles = expectTileFarmSelection(pending, 'plow').selectableTiles;
        assert(tiles.length);
        const r = ok(session.commitSelectionChoice(0, { tile: tiles[0] }));
        assert.equal(r.state.players[0]!.fields.length, 4);
        assert.equal(r.state.players[0]!.resources.wood, 0);
        assert(r.state.players[1]!.minorHand.includes(ZIG));
        assert.ok(r.interaction.stateId === 'wait');
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(r.interaction.playerIndex, 0);
        assert.equal(r.state.currentPlayerIndex, 0);
        save('D001-N1', r);
    });
    it("straight fewer and missing L shaped fields cannot pay or plow", () => {
        for (const fields of [[], [{ row: 0, col: 2, stacks: [] }], [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }, { row: 0, col: 3, stacks: [] }]]) {
            const session = setup(1, state => state.players[0]!.fields = fields);
            const r = enterMinor(session);
            assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice', JSON.stringify(r.interaction));
            assert(!getChoiceOptions(r).some(o => o.value === ZIG && !o.disabled));
            assertRejectedUnchanged(session, () => session.resolveChoice(0, ZIG));
            const legal = ok(session.resolveChoice(0, 'A030_BakingSheet'));
            assert.equal(legal.state.players[0]!.fields.length, fields.length);
            assert.equal(legal.state.players[0]!.resources.wood, 1);
            assert.ok(legal.interaction.stateId === 'wait');
            assert.deepEqual(legal.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
            assert.equal(legal.interaction.playerIndex, 0);
            assert.equal(legal.state.currentPlayerIndex, 0);
            save(`D001-N2-${fields.length}`, legal);
        }
    });
    it("wrong target room outside farm and actor reject before exact legal retry", () => {
        const session = setup(1, zigzag);
        const r = optional(session, buy(session, ZIG), true);
        assert.equal(expectTileFarmSelection(r, 'plow').farmType, 'plow');
        const tiles = expectTileFarmSelection(r, 'plow').selectableTiles;
        for (const tile of [{ row: 1, col: 0 }, { row: 99, col: 99 }, { row: 2, col: 4 }])
            assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile }));
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { tile: tiles[0] }));
        const legal = ok(session.commitSelectionChoice(0, { tile: tiles[0] }));
        assert.equal(legal.state.players[0]!.fields.length, 4);
        assert.ok(legal.interaction.stateId === 'wait');
        assert.deepEqual(legal.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(legal.interaction.playerIndex, 0);
        assert.equal(legal.state.currentPlayerIndex, 0);
        save('D001-N3', legal);
    });
    it("optional decline plows none and whole undo restores field wood and passing", () => {
        const declinedSession = setup(1, zigzag);
        const declined = optional(declinedSession, buy(declinedSession, ZIG), false);
        assert.equal(declined.state.players[0]!.fields.length, 3);
        assert.equal(declined.state.players[0]!.resources.wood, 0);
        const session = setup(1, zigzag);
        const undoInteraction = JSON.stringify(session.getState().interaction);
        const pending = optional(session, buy(session, ZIG), true);
        assert.equal(expectTileFarmSelection(pending, 'plow').farmType, 'plow');
        const r = ok(session.commitSelectionChoice(0, { tile: expectTileFarmSelection(pending, 'plow').selectableTiles[0] }));
        const undone = ok(session.undoAction());
        assert.equal(JSON.stringify(undone.interaction), undoInteraction);
        assert.equal(undone.interaction.stateId, 'idle');
        assert.equal(undone.state.currentPlayerIndex, 0);
        assert.equal(undone.state.players[0]!.fields.length, 3);
        assert.equal(undone.state.players[0]!.resources.wood, 1);
        assert(undone.state.players[0]!.minorHand.includes(ZIG));
        assert(!undone.state.players[1]!.minorHand.includes(ZIG));
        assert.ok(declined.interaction.stateId === 'wait');
        assert.deepEqual(declined.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(declined.state.currentPlayerIndex, 0);
        assert.ok(r.interaction.stateId === 'wait');
        assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(r.interaction.playerIndex, 0);
        assert.equal(r.state.currentPlayerIndex, 0);
        save('D001-N4', { r, undone, declined });
    });
});
