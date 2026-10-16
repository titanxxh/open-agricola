import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { expectPublicCardGoods } from './_helpers/card-public-presentation'
import '../../shared/cards/A/A102_Grocer'
import { type AnytimeAction, type GameState } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A102_Grocer session', () => {
  const setup = () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A102_Grocer')
    session.loadState(state)
    session.devPlayCard(0, 'A102_Grocer')
    return session
  }

  /** Take farmland action to enter active interaction with a plow choice */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('onBuy places 8 items on the stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const stack = getCardStack(player, 'A102_Grocer')
    expect(stack).toEqual([
      'vegetable', 'reed', 'clay', 'vegetable', 'stone', 'reed', 'grain', 'wood',
    ])
    expect(stack.length).toBe(8)
    expectPublicCardGoods(session, 'A102_Grocer', { stack })
  })

  it('anytime action appears during active interaction with food and non-empty stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('A102-grocer-anytime')
  })

  it('anytime action not available without food', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 0
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A102-grocer-anytime')
  })

  it('anytime action not available with empty stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    // Clear the stack
    player.cardStates!['A102_Grocer']!.stack = []
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A102-grocer-anytime')
  })

  it('taking top: pay 1 food, gain wood (top of stack)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    player.resources.wood = 0
    session.loadState(state)

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.food).toBe(4) // 5 - 1
    expect(updatedPlayer.resources.wood).toBe(1)
    // Stack should now have 7 items
    const stack = getCardStack(updatedPlayer, 'A102_Grocer')
    expect(stack.length).toBe(7)
    expect(stack[stack.length - 1]).toBe('grain')
    expectPublicCardGoods(session, 'A102_Grocer', { stack })
  })

  it('second take: gain grain (new top after first take)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 5
    player.resources.wood = 0
    player.resources.grain = 0
    session.loadState(state)

    enterActiveInteraction(session)

    // First take: wood
    const resp1 = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(resp1.ok).toBe(true)
    expect(resp1.state.players[0]!.resources.wood).toBe(1)

    // Second take: grain
    const resp2 = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(resp2.ok).toBe(true)

    const updatedPlayer = resp2.state.players[0]!
    expect(updatedPlayer.resources.food).toBe(3) // 5 - 2
    expect(updatedPlayer.resources.grain).toBe(1)
    expect(updatedPlayer.resources.wood).toBe(1)
    const stack = getCardStack(updatedPlayer, 'A102_Grocer')
    expect(stack.length).toBe(6)
    expect(stack[stack.length - 1]).toBe('reed')
  })

  it('can drain the entire stack', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.food = 10
    session.loadState(state)

    enterActiveInteraction(session)

    // Take all 8 items
    let lastResp: SessionResponse | undefined
    for (let i = 0; i < 8; i++) {
      lastResp = session.takeAnytimeAction(0, 'A102-grocer-anytime')
      expect(lastResp.ok).toBe(true)
    }

    assert.ok(lastResp)
    const updatedPlayer = lastResp.state.players[0]!
    expect(updatedPlayer.resources.food).toBe(2) // 10 - 8
    const stack = getCardStack(updatedPlayer, 'A102_Grocer')
    expect(stack.length).toBe(0)
    expectPublicCardGoods(session, 'A102_Grocer', { stack: [] })

    // Verify anytime is no longer available after stack is drained
    const anytimeIds = lastResp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A102-grocer-anytime')
  })
})

describe("A102 command boundaries", () => {
    const GROCER = 'A102_Grocer';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, played = true) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 3;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                const player = state.players[0]!;
                player.occupationPlayed = played ? [GROCER] : [];
                player.occupationHand = played ? ['__test_placeholder__'] : [GROCER];
                configure(state);
            } }));
        return session;
    }
    function ready(session: GameSession, actor: number) { let response = session.getState(); if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'confirm-next-player')
        response = confirmNext(session, response); assert.equal(response.interaction.stateId, 'idle'); assert.equal(response.state.currentPlayerIndex, actor); }
    function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)); }
    function grocer(food = 8) { return setup(state => state.players[0]!.resources.food = food, false); }
    function buyGrocer(session: GameSession) {
        let response = turn(session, 0, 'lessons');
        if (response.state.players[0]!.occupationHand.includes(GROCER))
            response = ok(session.resolveChoice(0, GROCER));
        assert.ok(response.state.players[0]!.occupationPlayed.includes(GROCER));
        return response;
    }
    function enterGrocer(session: GameSession) { buyGrocer(session); turn(session, 1, 'grain-seeds'); return turn(session, 0, 'farmland'); }
    function take(session: GameSession) { return ok(session.takeAnytimeAction(0, 'A102-grocer-anytime')); }
    it("real Lessons purchase initializes the eight goods in printed order", () => {
        const session = grocer();
        const response = buyGrocer(session);
        assert.deepEqual(getCardStack(response.state.players[0]!, GROCER), ['vegetable', 'reed', 'clay', 'vegetable', 'stone', 'reed', 'grain', 'wood']);
        assert.equal(response.state.players[0]!.resources.food, 8);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A102-N1', response);
    });
    it("eight actual top purchases each pay one food and drain in the printed order", () => {
        const session = grocer();
        enterGrocer(session);
        const order = ['wood', 'grain', 'reed', 'stone', 'vegetable', 'clay', 'reed', 'vegetable'] as const;
        for (const [i, resource] of order.entries()) {
            const before = session.getState().state.players[0]!.resources[resource];
            const response = take(session);
            assert.equal(response.state.players[0]!.resources[resource], before + 1);
            assert.equal(response.state.players[0]!.resources.food, 7 - i);
            assert.equal(getCardStack(response.state.players[0]!, GROCER).length, 7 - i);
            assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select');
            assert.equal(response.interaction.request.farm.farmType, 'plow');
            assert.equal(response.interaction.playerIndex, 0);
            assert.equal(response.state.currentPlayerIndex, 0);
            save(`A102-N2-${i}`, response);
        }
        assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, 'A102-grocer-anytime'));
    });
    it("zero food blocks and exactly one food buys only the top wood", () => {
        const zero = grocer(0);
        enterGrocer(zero);
        assertRejectedUnchanged(zero, () => zero.takeAnytimeAction(0, 'A102-grocer-anytime'));
        assert.equal(getCardStack(zero.getState().state.players[0]!, GROCER).length, 8);
        const session = grocer(1);
        enterGrocer(session);
        const response = take(session);
        assert.equal(response.state.players[0]!.resources.wood, 1);
        assert.equal(response.state.players[0]!.resources.food, 0);
        assertRejectedUnchanged(session, () => session.takeAnytimeAction(0, 'A102-grocer-anytime'));
        assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select');
        assert.equal(response.interaction.request.farm.farmType, 'plow');
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A102-N3', response);
    });
    it("wrong player and nonexistent purchase cannot spend or take stack goods", () => {
        const session = grocer();
        enterGrocer(session);
        assertRejectedUnchanged(session, () => session.takeAnytimeAction(1, 'A102-grocer-anytime'));
        assertRejectedUnchanged(session, () => session.resolveChoice(0, 'take-bottom-vegetable'));
        const response = take(session);
        assert.equal(response.state.players[0]!.resources.vegetable, 0);
        assert.equal(response.state.players[0]!.resources.wood, 1);
        assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select');
        assert.equal(response.interaction.request.farm.farmType, 'plow');
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A102-N4', response);
    });
    it("whole action undo restores purchased stack top and food before one retry", () => {
        const session = grocer();
        buyGrocer(session);
        turn(session, 1, 'grain-seeds');
        ready(session, 0);
        const undoInteraction = JSON.stringify(session.getState().interaction);
        const pending = turn(session, 0, 'farmland');
        take(session);
        take(session);
        const undone = ok(session.undoAction());
        assert.equal(JSON.stringify(undone.interaction), undoInteraction);
        assert.equal(undone.interaction.stateId, 'idle');
        assert.equal(undone.state.currentPlayerIndex, 0);
        assert.equal(undone.state.players[0]!.resources.food, 8);
        assert.equal(getCardStack(undone.state.players[0]!, GROCER).length, 8);
        assert.equal(undone.state.players[0]!.resources.wood, 0);
        assert.equal(undone.state.players[0]!.resources.grain, 0);
        turn(session, 0, 'farmland');
        const response = take(session);
        assert.equal(response.state.players[0]!.resources.food, 7);
        assert.equal(response.state.players[0]!.resources.wood, 1);
        assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select');
        assert.equal(response.interaction.request.farm.farmType, 'plow');
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A102-N5', { pending, undone, response });
    });
});
