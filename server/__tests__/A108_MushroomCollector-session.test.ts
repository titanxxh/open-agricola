import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A108_MushroomCollector'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertEmptyAccumulationRejected, assertRejectedUnchanged, confirmNext , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A108_MushroomCollector'

const FILLER = '__test_placeholder__'

const setup = ({ woodOnSpace = 3, woodInSupply = 0, played = true } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5108, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.wood = woodInSupply
  owner.resources.food = 0
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = woodOnSpace
  forest.takenBy = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const cardOption = (response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return undefined
  return getChoiceOptions(response)?.find((option) =>
    option.sourceCard === CARD_ID && option.value !== '__skip__')
}

const accept = (session: GameSession, response: SessionResponse) => {
  const option = cardOption(response)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.stateId === 'wait'
    ? response.interaction.playerIndex : 0, option!.value)
}

describe('A108 Mushroom Collector parity', () => {
  it('A108 S1: Mushroom Collector is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A108 S2: after using Forest the player may return one wood there for two food', () => {
    const session = setup()

    const response = accept(session, session.takeAction(0, 'forest'))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 2 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(1)
  })

  it('A108 S3: the exchange after using Forest may be declined', () => {
    const session = setup()
    let response = session.takeAction(0, 'forest')
    expect(cardOption(response)).toBeDefined()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(0)
  })

  it('A108 S4: an empty wood accumulation space is rejected despite wood already in supply', () => {
    const session = setup({ woodOnSpace: 0, woodInSupply: 1 })
    const before = session.getState()

    const response = session.takeAction(0, 'forest')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })

  })

  it('A108 S5: a non-wood accumulation space does not trigger Mushroom Collector', () => {
    const session = setup()
    const state = session.getState().state
    const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')!
    clayPit.resources.clay = 2
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})

describe("A108 command boundaries", () => {
    const MUSH = 'A108_MushroomCollector';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, played = true) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 5;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.occupationPlayed = played ? [MUSH] : [];
                state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [MUSH];
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
    function choice(response: SessionResponse) {
        assert.ok(response.interaction.stateId === 'wait' && expectWait(response).interaction.request.kind === 'choice', JSON.stringify(response.interaction));
        return getChoiceOptions(response);
    }
    function accept(session: GameSession, response: SessionResponse) {
        const option = choice(response).find(o => o.sourceCard === MUSH && o.value !== '__skip__');
        assert.ok(option, JSON.stringify(response.interaction));
        return ok(session.resolveChoice(0, option.value));
    }
    it("exchange returns exactly one wood to the used source for two food", () => {
        const session = setup();
        const pending = turn(session, 0, 'forest');
        assert.equal(pending.state.players[0]!.resources.wood, 3);
        const response = accept(session, pending);
        assert.equal(response.state.players[0]!.resources.wood, 2);
        assert.equal(response.state.players[0]!.resources.food, 42);
        assert.equal(response.state.actionSpaces.find(s => s.id === 'forest')!.resources.wood, 1);
        assert.equal(response.state.actionSpaces.find(s => s.id === 'clay-pit')!.resources.wood ?? 0, 0);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A108-N1', response);
    });
    it("decline and no wood cannot grant food or return nonexistent wood", () => {
        const session = setup();
        const pending = turn(session, 0, 'forest');
        choice(pending);
        const response = ok(session.resolveChoice(0, '__skip__'));
        assert.equal(response.state.players[0]!.resources.wood, 3);
        assert.equal(response.state.players[0]!.resources.food, 40);
        assert.equal(response.state.actionSpaces.find(s => s.id === 'forest')!.resources.wood, 0);
        const emptySession = setup(state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 0);
        const empty = assertEmptyAccumulationRejected(emptySession, 0, 'forest');
        assert.equal(empty.state.players[0]!.resources.food, 40);
        assert.equal(empty.state.players[0]!.resources.wood, 0);
        assert.equal(empty.state.actionSpaces.find(s => s.id === 'forest')!.resources.wood, 0);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A108-N2', { response, empty });
    });
    it("empty source rejects without exchanging existing reserve wood", () => {
        const session = setup(state => { state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 0; state.players[0]!.resources.wood = 1; });
        const response = assertEmptyAccumulationRejected(session, 0, 'forest');
        assert.equal(response.state.players[0]!.resources.wood, 1);
        assert.equal(response.state.players[0]!.resources.food, 40);
        assert.equal(response.state.actionSpaces.find(s => s.id === 'forest')!.resources.wood, 0);
        save('A108-N3', response);
    });
    it("nonwood opponent and unplayed collections do not offer owner exchange", () => {
        const clay = turn(setup(state => state.players[0]!.resources.wood = 1), 0, 'clay-pit');
        assert.equal(clay.state.players[0]!.resources.food, 40);
        assert.equal(clay.state.players[0]!.resources.wood, 1);
        const unplayed = turn(setup(undefined, false), 0, 'forest');
        assert.equal(unplayed.state.players[0]!.resources.food, 40);
        assert.equal(unplayed.state.players[0]!.resources.wood, 3);
        const session = setup();
        turn(session, 0, 'grain-seeds');
        const response = turn(session, 1, 'forest');
        assert.equal(response.state.players[0]!.resources.food, 40);
        assert.equal(response.state.players[1]!.resources.food, 40);
        assert.equal(response.state.players[1]!.resources.wood, 3);
        assert.ok(clay.interaction.stateId === 'wait');
        assert.deepEqual(clay.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(clay.state.currentPlayerIndex, 0);
        assert.ok(unplayed.interaction.stateId === 'wait');
        assert.deepEqual(unplayed.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(unplayed.state.currentPlayerIndex, 0);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 });
        assert.equal(response.state.currentPlayerIndex, 1);
        save('A108-N4', { response, clay, unplayed });
    });
    it("invalid actor value and stale exchange reject and undo restores exact source", () => {
        const session = setup();
        const undoInteraction = JSON.stringify(session.getState().interaction);
        const pending = turn(session, 0, 'forest');
        const option = choice(pending).find(o => o.sourceCard === MUSH && o.value !== '__skip__');
        assert.ok(option);
        assertRejectedUnchanged(session, () => session.resolveChoice(1, option.value));
        assertRejectedUnchanged(session, () => session.resolveChoice(0, '__invented_exchange__'));
        const response = ok(session.resolveChoice(0, option.value));
        assertRejectedUnchanged(session, () => session.resolveChoice(0, option.value));
        assert.equal(response.state.players[0]!.resources.food, 42);
        const undone = ok(session.undoAction());
        assert.equal(JSON.stringify(undone.interaction), undoInteraction);
        assert.equal(undone.interaction.stateId, 'idle');
        assert.equal(undone.state.currentPlayerIndex, 0);
        assert.equal(undone.state.players[0]!.resources.food, 40);
        assert.equal(undone.state.players[0]!.resources.wood, 0);
        assert.equal(undone.state.actionSpaces.find(s => s.id === 'forest')!.resources.wood, 3);
        const retry = accept(session, turn(session, 0, 'forest'));
        assert.equal(retry.state.players[0]!.resources.food, 42);
        assert.equal(retry.state.actionSpaces.find(s => s.id === 'forest')!.resources.wood, 1);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        assert.ok(retry.interaction.stateId === 'wait');
        assert.deepEqual(retry.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(retry.interaction.playerIndex, 0);
        assert.equal(retry.state.currentPlayerIndex, 0);
        save('A108-N5', { response, undone, retry });
    });
});
