import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { executeCardListener } from '../../shared/cards/card-listeners'
import { type DraftGameEvent } from '../../shared/contract/events'
import { A103_Portmonger_impl } from '../../shared/cards/A/A103_Portmonger'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A103_Portmonger'

const setup = (fishingFood: number) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('fishing space missing')
  fishing.resources.food = fishingFood

  session.loadState(state)
  return session
}

const supplyCardEffectFood = (food: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'supply' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'cardEffect',
})

const fishingFood = (food: number): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { food },
  from: { kind: 'actionSpace', spaceId: 'fishing' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
})

const runListener = (
  transactionEvents: DraftGameEvent[],
  resourcesGained: { food?: number },
  actionEvents?: DraftGameEvent[],
) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5103, configure(state) {
    state.players[0]!.occupationPlayed = [CARD_ID]
  } }))
  const registration = A103_Portmonger_impl.listeners?.[0]
  assert.ok(registration)
  const space = session.state.actionSpaces.find(candidate => candidate.id === 'fishing')
  assert.ok(space)
  return session.withCtx(() => executeCardListener(registration, {
    state: session.state, player: session.state.players[0]!, space,
    actionId: 'collect', phase: 'after', transactionEvents, actionEvents,
    result: { type: 'ok', resourcesGained }, actionHooks: session.actionHooks,
  }))
}

describe('A103_Portmonger session', () => {
  it.each([
    { food: 1, gain: { vegetable: 1 } },
    { food: 2, gain: { grain: 1 } },
    { food: 3, gain: { reed: 1 } },
  ])('maps $food action-space food to $gain', ({ food, gain }) => {
    const session = setup(food)
    const foodBefore = session.getState().state.players[0]!.resources.food

    const resp = session.takeAction(0, 'fishing')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + food)
    expect(resp.state.players[0]!.resources).toMatchObject(gain)
  })
})

describe('A103_Portmonger listener provenance guard', () => {
  it('ignores generic supply/cardEffect food even when result reports food gained', () => {
    const result = runListener([supplyCardEffectFood(3)], { food: 3 })

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction food when current action has no food movement', () => {
    const result = runListener([fishingFood(3)], { food: 3 }, [])

    expect(result).toBeUndefined()
  })
})

describe("A103 command boundaries", () => {
    const PORT = 'A103_Portmonger';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, played = true, round = 5) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = round;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.occupationPlayed = played ? [PORT] : [];
                state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [PORT];
                configure(state);
            } }));
        return session;
    }
    function ready(session: GameSession, actor: number) {
        let response = session.getState();
        if (response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'confirm-next-player')
            response = confirmNext(session, response);
        assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction));
        assert.equal(response.state.currentPlayerIndex, actor);
    }
    function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)); }
    function goods(response: SessionResponse, actor = 0) { const r = response.state.players[actor]!.resources; return { food: r.food, wood: r.wood, clay: r.clay, reed: r.reed, grain: r.grain, vegetable: r.vegetable }; }
    it("original one two three and five food piles give vegetable grain and reed respectively", () => {
        for (const [amount, resource] of [[1, 'vegetable'], [2, 'grain'], [3, 'reed'], [5, 'reed']] as const) {
            const session = setup(state => state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = amount);
            const response = turn(session, 0, 'fishing');
            assert.equal(response.state.players[0]!.resources[resource], 1);
            assert.equal(response.state.players[0]!.resources.food, 40 + amount);
            assert.equal(response.state.actionSpaces.find(s => s.id === 'fishing')!.resources.food, 0);
            assert.ok(response.interaction.stateId === 'wait');
            assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
            assert.equal(response.interaction.playerIndex, 0);
            assert.equal(response.state.currentPlayerIndex, 0);
            save(`A103-N1-${amount}`, response);
        }
    });
    it("Day Laborer food and nonfood collection cannot grant accumulation bonuses", () => {
        const response = turn(setup(), 0, 'day-laborer');
        assert.deepEqual(goods(response), { food: 42, wood: 0, clay: 0, reed: 0, grain: 0, vegetable: 0 });
        const forest = turn(setup(), 0, 'forest');
        assert.equal(forest.state.players[0]!.resources.wood, 3);
        assert.equal(forest.state.players[0]!.resources.reed, 0);
        assert.equal(forest.state.players[0]!.resources.grain, 0);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.state.currentPlayerIndex, 0);
        assert.ok(forest.interaction.stateId === 'wait');
        assert.deepEqual(forest.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(forest.state.currentPlayerIndex, 0);
        save('A103-N2', { response, forest });
    });
    it("unplayed card and actual opponent Fishing cannot reward the owner", () => {
        const unplayed = turn(setup(state => state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 1, false), 0, 'fishing');
        assert.equal(unplayed.state.players[0]!.resources.vegetable, 0);
        const session = setup(state => state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 1);
        turn(session, 0, 'grain-seeds');
        const response = turn(session, 1, 'fishing');
        assert.equal(response.state.players[0]!.resources.vegetable, 0);
        assert.equal(response.state.players[1]!.resources.vegetable, 0);
        assert.equal(response.state.players[1]!.resources.food, 41);
        assert.ok(unplayed.interaction.stateId === 'wait');
        assert.deepEqual(unplayed.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(unplayed.state.currentPlayerIndex, 0);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 });
        assert.equal(response.state.currentPlayerIndex, 1);
        save('A103-N3', response);
    });
    it("occupied source rejects and whole undo restores pile and exactly one bonus", () => {
        const session = setup(state => state.actionSpaces.find(s => s.id === 'fishing')!.resources.food = 2);
        const undoInteraction = JSON.stringify(session.getState().interaction);
        let response = turn(session, 0, 'fishing');
        assert.equal(response.state.players[0]!.resources.grain, 1);
        const undone = ok(session.undoAction());
        assert.equal(JSON.stringify(undone.interaction), undoInteraction);
        assert.equal(undone.interaction.stateId, 'idle');
        assert.equal(undone.state.currentPlayerIndex, 0);
        assert.equal(undone.state.players[0]!.resources.grain, 0);
        assert.equal(undone.state.players[0]!.resources.food, 40);
        assert.equal(undone.state.actionSpaces.find(s => s.id === 'fishing')!.resources.food, 2);
        response = turn(session, 0, 'fishing');
        turn(session, 1, 'day-laborer');
        ready(session, 0);
        assertRejectedUnchanged(session, () => session.takeAction(0, 'fishing'));
        assert.equal(session.getState().state.players[0]!.resources.grain, 1);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A103-N4', { response, undone });
    });
});
