import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A105_BarrowPusher'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions, expectTileFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A105_BarrowPusher'

const setup = (inHand = false) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 105, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources.clay = 0
  player.resources.food = 0
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((entry) => entry.value === CARD_ID)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const openFarmland = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected farm selection')
  expect(expectWait(response).interaction.request.kind).toBe('farm-select')
  return response
}

describe('A105 Barrow Pusher parity', () => {
  it('A105 S1: playing Barrow Pusher through Lessons keeps the occupation in play', () => {
    const response = playOccupation(setup(true))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('A105 S2: a legal new field grants one clay and one food', () => {
    const session = setup()
    const prompt = openFarmland(session)
    const tile = expectTileFarmSelection(prompt, 'plow').selectableTiles[0]
    expect(tile).toBeDefined()

    const response = session.commitSelectionChoice(0, { tile })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toContainEqual(expect.objectContaining(tile!))
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, food: 1 })
  })

  it('A105 S3: an occupied field target is rejected without Barrow Pusher resources', () => {
    const session = setup()
    openFarmland(session)
    const room = session.state.players[0]!.roomTiles[0]!

    const response = session.commitSelectionChoice(0, { tile: room })

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.fields).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0 })
  })

  it('A105 S4: a non-plow action does not trigger Barrow Pusher', () => {
    const session = setup()

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 2 })
  })
})

describe("A105 command boundaries", () => {
    const BARROW = 'A105_BarrowPusher';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, played = true, round = 5) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = round;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.occupationPlayed = played ? [BARROW] : [];
                state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [BARROW];
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
    function plowTriggers(session: GameSession, response: SessionResponse, first = BARROW) {
        for (let n = 0; n < 8 && response.interaction.stateId === 'wait'; n++) {
            const request = expectWait(response).interaction.request;
            if (request.kind === 'select-trigger') {
                const other = first === BARROW ? 'A018_WheelPlow' : BARROW;
                const option = request.options.find(option => option.value === first)
                    ?? request.options.find(option => option.value === other);
                assert.ok(option, JSON.stringify(response.interaction));
                assert.equal(option.disabled ?? false, false);
                response = ok(session.resolveChoice(0, option.value));
            }
            else if (request.kind === 'choice') {
                assert.equal(response.interaction.sourceCard, 'A018_WheelPlow');
                const matching = request.options.filter(option => option.sourceCard === 'A018_WheelPlow' && !option.disabled);
                assert.equal(matching.length, 1, JSON.stringify(response.interaction));
                const option = matching[0]!;
                response = ok(session.resolveChoice(0, option.value));
            }
            else
                break;
        }
        return response;
    }
    it("genuine one new field grants one clay and one food", () => {
        const session = setup();
        const pending = turn(session, 0, 'farmland');
        assert.ok(pending.interaction.stateId === 'wait' && expectWait(pending).interaction.request.kind === 'farm-select');
        const response = ok(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }));
        assert.equal(response.state.players[0]!.fields.length, 1);
        assert.equal(response.state.players[0]!.resources.clay, 1);
        assert.equal(response.state.players[0]!.resources.food, 41);
        save('A105-N1', response);
    });
    it("room outside farm wrong actor and duplicate target reject before legal plow", () => {
        const session = setup();
        turn(session, 0, 'farmland');
        for (const tile of [{ row: 1, col: 0 }, { row: 99, col: 99 }])
            assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile }));
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { tile: { row: 0, col: 1 } }));
        const response = ok(session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }));
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }));
        assert.equal(response.state.players[0]!.resources.clay, 1);
        save('A105-N2', response);
    });
    it("nonplow opponent and unplayed plow do not grant owner reward", () => {
        const ordinary = turn(setup(), 0, 'day-laborer');
        assert.equal(ordinary.state.players[0]!.resources.clay, 0);
        assert.equal(ordinary.state.players[0]!.resources.food, 42);
        const session = setup();
        turn(session, 0, 'grain-seeds');
        turn(session, 1, 'farmland');
        const response = ok(session.commitSelectionChoice(1, { tile: { row: 0, col: 1 } }));
        assert.equal(response.state.players[0]!.resources.clay, 0);
        assert.equal(response.state.players[1]!.resources.clay, 0);
        const unplayed = setup(undefined, false);
        turn(unplayed, 0, 'farmland');
        const result = ok(unplayed.commitSelectionChoice(0, { tile: { row: 0, col: 1 } }));
        assert.equal(result.state.players[0]!.resources.clay, 0);
        assert.ok(ordinary.interaction.stateId === 'wait');
        assert.deepEqual(ordinary.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(ordinary.state.currentPlayerIndex, 0);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 });
        assert.equal(response.state.currentPlayerIndex, 1);
        assert.ok(result.interaction.stateId === 'wait');
        assert.deepEqual(result.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(result.state.currentPlayerIndex, 0);
        save('A105-N3', { response, result });
    });
    it("three real Wheel Plow fields each award clay and food and undo restores all", () => {
        for (const first of [BARROW, 'A018_WheelPlow']) {
            const session = setup(state => state.players[0]!.minorPlayed = ['A018_WheelPlow']);
            let response = turn(session, 0, 'farmland');
            for (let n = 0; n < 3; n++) {
                response = plowTriggers(session, response, first);
                assert.ok(response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'farm-select', JSON.stringify(response.interaction));
                response = ok(session.commitSelectionChoice(0, { tile: { row: 0, col: n + 1 } }));
            }
            response = plowTriggers(session, response, first);
            assert.equal(response.state.players[0]!.fields.length, 3);
            assert.equal(response.state.players[0]!.resources.clay, 3);
            assert.equal(response.state.players[0]!.resources.food, 43);
            const undone = ok(session.undoAction());
            assert.equal(undone.state.players[0]!.fields.length, 0);
            assert.equal(undone.state.players[0]!.resources.clay, 0);
            assert.equal(undone.state.players[0]!.resources.food, 40);
            save(`A105-N4-${first}`, { response, undone });
        }
    });
});
