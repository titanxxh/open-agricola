import { expectWait } from './_helpers/trigger-select'
import { type SessionResponse, GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { describe, expect, it } from 'vitest'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A111_WallBuilder'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions, expectTileFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A111_WallBuilder'

describe('A111_WallBuilder session', () => {
  const setup = () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    // Enough for a wood room (5 wood + 2 reed).
    player.resources = { ...player.resources, wood: 10, reed: 3, clay: 0, stone: 0 }
    player.houseType = 'wood'

    session.loadState(state)
    return session
  }

  it('queues 1 FOOD on each of next 4 round spaces after building a room', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    // farm-expansion OR between construct & stables with both resources present.
    if (resp.interaction.stateId === 'wait') {
      const constructOption = getChoiceOptions(resp)?.find(
        (o) => o.labelKey === 'actions.construct.name',
      )
      expect(constructOption).toBeDefined()
      resp = session.resolveChoice(0, constructOption!.value)
    }
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const room = expectTileFarmSelection(resp, 'room').selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { rooms: [room] })
    expect(resp.ok).toBe(true)

    const playerId = resp.state.players[0]!.id
    const entries = resp.state.futureMeeples.filter(
      (e) => e.cardId === CARD_ID && e.playerId === playerId,
    )
    expect(entries).toHaveLength(4)
    const rounds = entries.map((e) => e.round).sort((a, b) => a - b)
    expect(rounds).toEqual([4, 5, 6, 7])
    entries.forEach((entry) => {
      expect(entry.resources.food).toBe(1)
    })
  })

  it('does not trigger when card is not played', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.resources = { ...player.resources, wood: 10, reed: 3 }

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait') {
      const constructOption = getChoiceOptions(resp)?.find(
        (o) => o.labelKey === 'actions.construct.name',
      )
      resp = session.resolveChoice(0, constructOption!.value)
    }
    if (resp.interaction.stateId !== 'wait') return

    const room = expectTileFarmSelection(resp, 'room').selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { rooms: [room] })
    expect(resp.ok).toBe(true)
    const entries = resp.state.futureMeeples.filter((e) => e.cardId === CARD_ID)
    expect(entries).toHaveLength(0)
  })
})

describe('A111 Wall Builder parity', () => {
  const CARD_ID = 'A111_WallBuilder'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, round = 5, wood = 10, reed = 4, food = 0,
  }: { played?: boolean; round?: number; wood?: number; reed?: number; food?: number } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6111 + round, options: { playerCount: 2 } }))
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.wood = wood
    owner.resources.reed = reed
    owner.resources.food = food
    owner.houseType = 'wood'
    session.loadState(state)
    return session
  }

  const chooseConstruct = (session: GameSession, response: SessionResponse) => {
    if (response.interaction.stateId !== 'wait') return response
    const option = getChoiceOptions(response)?.find((candidate) => {
      return candidate.labelKey === 'actions.construct.name'
    })
    return option ? session.resolveChoice(response.interaction.playerIndex, option.value) : response
  }

  const buildRooms = (session: GameSession, count: number) => {
    const response = chooseConstruct(session, session.takeAction(0, 'farm-expansion'))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { farm: { farmType: 'room' } },
    })
    if (response.interaction.stateId !== 'wait') return response
    const rooms = expectTileFarmSelection(response, 'room').selectableTiles.slice(0, count)
    expect(rooms).toHaveLength(count)
    return session.commitSelectionChoice(response.interaction.playerIndex, { rooms })
  }

  const buildStable = (session: GameSession) => {
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.stateId !== 'wait') return response
    const option = getChoiceOptions(response)?.find((candidate) => {
      return candidate.labelKey === 'actions.buildStables.name'
    })
    if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
    if (response.interaction.stateId !== 'wait') return response
    const stable = expectTileFarmSelection(response, 'stable').selectableTiles[0]
    return session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable!] })
  }

  const futureFoodRounds = (response: SessionResponse) => response.state.futureMeeples
    .filter((entry) => entry.cardId === CARD_ID && entry.resources.food === 1)
    .map((entry) => entry.round)
    .sort((left, right) => left - right)

  it('A111 S3: building two rooms in one action still schedules only four food', () => {
    const response = buildRooms(setup(), 2)

    expect(response.ok, response.error).toBe(true)
    expect(futureFoodRounds(response)).toEqual([6, 7, 8, 9])
  })

  it('A111 S4: building only a stable schedules no Wall Builder food', () => {
    const response = buildStable(setup({ wood: 2, reed: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(futureFoodRounds(response)).toEqual([])
  })

  it('A111 S5: the first scheduled food is received at the start of the next round', () => {
    const session = setup({ food: 20 })
    const built = buildRooms(session, 1)
    expect(futureFoodRounds(built)).toEqual([6, 7, 8, 9])
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureFoodRounds(response)).toEqual([7, 8, 9])
  })

  it('A111 S6: building in round twelve schedules food only for rounds thirteen and fourteen', () => {
    const response = buildRooms(setup({ round: 12 }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(futureFoodRounds(response)).toEqual([13, 14])
  })
})

describe("A111 command boundaries", () => {
    const WALL = 'A111_WallBuilder';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
    function setup(configure: (state: GameState) => void = () => { }, played = true, round = 5) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = round;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 10, clay: 10, reed: 4, stone: 10, grain: 0, vegetable: 0 });
                state.players[0]!.occupationPlayed = played ? [WALL] : [];
                state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [WALL];
                configure(state);
            } }));
        return session;
    }
    function ready(session: GameSession, actor: number) {
        let r = session.getState();
        if (r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'confirm-next-player')
            r = confirmNext(session, r);
        assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction));
        assert.equal(r.state.currentPlayerIndex, actor);
    }
    function turn(session: GameSession, actor: number, space: string) { ready(session, actor); return ok(session.takeAction(actor, space)); }
    function build(session: GameSession, count: number, actor = 0, stable = false) {
        let r = turn(session, actor, 'farm-expansion');
        if (r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice') {
            const option = getChoiceOptions(r).find(o => o.labelKey === (stable ? 'actions.stables.name' : 'actions.construct.name'));
            assert.ok(option);
            r = ok(session.resolveChoice(actor, option.value));
        }
        assert.ok(r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'farm-select');
        let completed = ok(session.commitSelectionChoice(actor, stable ? { stables: [{ row: 0, col: 1 }] } : { rooms: Array.from({ length: count }, (_, i) => ({ row: i + 1, col: 1 })) }));
        if (completed.interaction.stateId === 'wait' && expectWait(completed).interaction.request.kind === 'choice') {
            const skip = getChoiceOptions(completed).find(o => o.value === '__skip__' || o.value === '__done__');
            if (skip)
                completed = ok(session.resolveChoice(actor, skip.value));
        }
        return completed;
    }
    function schedule(r: SessionResponse) { return r.state.futureMeeples.filter(e => e.cardId === WALL).map(e => ({ round: e.round, food: e.resources.food, owner: e.playerId })).sort((a, b) => a.round - b.round); }
    function finish(session: GameSession) {
        turn(session, 0, 'grain-seeds');
        turn(session, 1, 'reed-bank');
        turn(session, 0, 'day-laborer');
        let r = confirmNext(session, turn(session, 1, 'clay-pit'));
        for (let n = 0; n < 15 && r.interaction.stateId === 'wait'; n++) {
            const i = r.interaction;
            if (i.request.kind === 'feed')
                r = ok(session.resolveChoice(i.playerIndex, 'confirm', { selections: [] }));
            else if (i.request.kind === 'confirm-player-switch')
                r = ok(session.resolveChoice(i.request.toPlayerIndex, 'confirm'));
            else
                assert.fail(JSON.stringify(i));
        }
        assert.equal(r.interaction.stateId, 'idle');
        return r;
    }
    it("one and two rooms schedule four food once while a stable schedules none", () => {
        for (const count of [1, 2]) {
            const r = build(setup(), count);
            assert.deepEqual(schedule(r).map(e => [e.round, e.food]), [[6, 1], [7, 1], [8, 1], [9, 1]]);
            assert.equal(r.state.players[0]!.resources.food, 40);
            save(`A111-N1-${count}`, r);
        }
        const stable = build(setup(), 1, 0, true);
        assert.deepEqual(schedule(stable), []);
        save('A111-N1-stable', stable);
    });
    it("natural rounds deliver to the owner once and consume each scheduled food", () => {
        const session = setup();
        const built = build(session, 1);
        turn(session, 1, 'reed-bank');
        turn(session, 0, 'day-laborer');
        let r = confirmNext(session, turn(session, 1, 'clay-pit'));
        assert.equal(r.state.round, 6);
        assert.equal(r.state.players[0]!.resources.food, 43);
        assert.equal(r.state.players[1]!.resources.food, 40);
        assert.deepEqual(schedule(r).map(e => e.round), [7, 8, 9]);
        r = finish(session);
        assert.equal(r.state.round, 7);
        assert.equal(r.state.players[0]!.resources.food, 46);
        r = finish(session);
        assert.equal(r.state.round, 8);
        assert.equal(r.state.players[0]!.resources.food, 45);
        r = finish(session);
        assert.equal(r.state.round, 9);
        assert.equal(r.state.players[0]!.resources.food, 48);
        assert.deepEqual(schedule(r), []);
        assert.deepEqual(session.getState().state, r.state);
        save('A111-N2', { built, r });
    });
    it("late rounds clip future food at round fourteen", () => {
        for (const round of [12, 14]) {
            const r = build(setup(undefined, true, round), 1);
            assert.deepEqual(schedule(r).map(e => e.round), round === 12 ? [13, 14] : []);
            assert.equal(r.state.players[0]!.resources.food, 40);
            save(`A111-N3-${round}`, r);
        }
    });
    it("unplayed opponent illegal build and undo cannot leave owner schedule", () => {
        const unplayed = build(setup(undefined, false), 1);
        assert.deepEqual(schedule(unplayed), []);
        const opponent = setup();
        turn(opponent, 0, 'grain-seeds');
        const other = build(opponent, 1, 1);
        assert.deepEqual(schedule(other), []);
        assert.ok(unplayed.interaction.stateId === 'wait');
        assert.deepEqual(unplayed.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(unplayed.state.currentPlayerIndex, 0);
        assert.ok(other.interaction.stateId === 'wait');
        assert.deepEqual(other.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 });
        assert.equal(other.state.currentPlayerIndex, 1);
        save('A111-N4-opponent', other);
        const session = setup();
        turn(session, 0, 'farm-expansion');
        let r = session.getState();
        if (r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice') {
            const option = getChoiceOptions(r).find(o => o.labelKey === 'actions.construct.name');
            assert.ok(option);
            r = ok(session.resolveChoice(0, option.value));
        }
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { rooms: [{ row: 99, col: 99 }] }));
        assert.deepEqual(schedule(session.getState()), []);
        r = ok(session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }));
        const undone = ok(session.undoAction());
        assert.deepEqual(schedule(undone), []);
        assert.equal(undone.state.players[0]!.rooms, 2);
        assert.equal(undone.state.players[0]!.resources.wood, 10);
        save('A111-N4', { r, undone, unplayed });
    });
});
