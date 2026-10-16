import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A110_Roughcaster'
import '../../shared/cards/A/A087_Conservator'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions, expectTileFarmSelection, getFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A110_Roughcaster'

const FILLER = '__test_placeholder__'

const setup = ({
  played = true, houseType = 'wood', resources = {}, conservator = false,
}: {
  played?: boolean
  houseType?: 'wood' | 'clay'
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
  conservator?: boolean
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6110, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = [
    ...(played ? [CARD_ID] : []),
    ...(conservator ? ['A087_Conservator'] : []),
  ]
  player.houseType = houseType
  Object.assign(player.resources, resources)
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

const buildRoom = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (getFarmSelection(response)?.farmType !== 'room') {
    const construct = getChoiceOptions(response)?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(construct).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, construct!.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const room = expectTileFarmSelection(response, 'room').selectableTiles[0]
  expect(room).toBeDefined()
  return session.commitSelectionChoice(response.interaction.playerIndex, { rooms: [room!] })
}

const renovate = (session: GameSession, target?: 'clay' | 'stone'): SessionResponse => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    expect(target).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, target!)
  }
  return response
}

describe('A110 Roughcaster parity', () => {
  it('A110 S1: Roughcaster is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A110 S2: building at least one clay room gains three food', () => {
    const response = buildRoom(setup({
      houseType: 'clay', resources: { clay: 5, reed: 2 },
    }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 3, resources: { food: 3 },
    })
  })

  it('A110 S3: renovating a clay house to stone gains three food', () => {
    const response = renovate(setup({
      houseType: 'clay', resources: { stone: 2, reed: 1 },
    }))

    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { food: 3 },
    })
  })

  it('A110 S4: building a wood room grants no food', () => {
    const response = buildRoom(setup({ resources: { wood: 5, reed: 2 } }))

    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood', rooms: 3, resources: { food: 0 },
    })
  })

  it('A110 S5: renovating a wood house to clay grants no food', () => {
    const response = renovate(setup({ resources: { clay: 2, reed: 1 } }))

    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { food: 0 },
    })
  })

  it('A110 S6: a Conservator renovation directly from wood to stone grants no food', () => {
    const response = renovate(setup({
      conservator: true, resources: { stone: 2, reed: 1 },
    }), 'stone')

    expect(response.state.players[0]).toMatchObject({
      houseType: 'stone', resources: { food: 0 },
    })
  })
})

describe("A110 command boundaries", () => {
    const ROUGH = 'A110_Roughcaster';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
    function setup(configure: (state: GameState) => void = () => { }, played = true, round = 5) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = round;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 10, clay: 10, reed: 4, stone: 10, grain: 0, vegetable: 0 });
                state.players[0]!.occupationPlayed = played ? [ROUGH] : [];
                state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [ROUGH];
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
        sessionEvidence.record('A110-build-sequence-stage', { stable, count, actor, response: completed });
        assert.ok(completed.interaction.stateId === 'wait');
        assert.equal(completed.interaction.promptKey, 'ui.interactionFarmExpansionSelect');
        assert.equal(completed.interaction.request.kind, 'choice');
        const remaining = getChoiceOptions(completed).filter(option => option.labelKey === (stable ? 'actions.construct.name' : 'actions.stables.name'));
        assert.equal(remaining.length, 1, JSON.stringify(completed.interaction));
        const done = getChoiceOptions(completed).find(option => option.value === '__done__');
        assert.ok(done);
        completed = ok(session.resolveChoice(actor, done.value));
        assert.ok(completed.interaction.stateId === 'wait');
        assert.deepEqual(completed.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 - actor });
        return completed;
    }
    it("one and two clay rooms reward three food once but wood stone and stable do not", () => {
        for (const count of [1, 2]) {
            const r = build(setup(state => state.players[0]!.houseType = 'clay'), count);
            assert.equal(r.state.players[0]!.resources.food, 43);
            assert.equal(r.state.players[0]!.resources.clay, 10 - 5 * count);
            assert.equal(r.state.players[0]!.resources.reed, 4 - 2 * count);
            assert.equal(r.state.players[0]!.rooms, 2 + count);
            save(`A110-N1-${count}`, r);
        }
        for (const material of ['wood', 'stone'] as const) {
            const r = build(setup(state => state.players[0]!.houseType = material), 1);
            assert.equal(r.state.players[0]!.resources.food, 40);
            save(`A110-N1-${material}`, r);
        }
        const stable = build(setup(state => state.players[0]!.houseType = 'clay'), 1, 0, true);
        assert.equal(stable.state.players[0]!.resources.food, 40);
        assert.ok(stable.interaction.stateId === 'wait');
        assert.deepEqual(stable.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(stable.state.currentPlayerIndex, 0);
        save('A110-N1-stable', stable);
    });
    it("real clay to stone renovation pays cost and wood to clay gets no food", () => {
        for (const material of ['wood', 'clay'] as const) {
            const session = setup(state => state.players[0]!.houseType = material, true, 14);
            let r = turn(session, 0, 'house-redevelopment');
            if (r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice' && r.interaction.promptKey === 'ui.interactionChooseRenovationTarget')
                r = ok(session.resolveChoice(0, material === 'clay' ? 'stone' : 'clay'));
            assert.equal(r.state.players[0]!.houseType, material === 'clay' ? 'stone' : 'clay');
            assert.equal(r.state.players[0]!.resources.food, material === 'clay' ? 43 : 40);
            assert.equal(r.state.players[0]!.resources.reed, 3);
            assert.equal(r.state.players[0]!.resources[material === 'clay' ? 'stone' : 'clay'], 8);
            save(`A110-N2-${material}`, r);
        }
    });
    it("invalid rooms wrong actor and unaffordable two rooms reject before legal one room", () => {
        const session = setup(state => { state.players[0]!.houseType = 'clay'; state.players[0]!.resources.clay = 5; state.players[0]!.resources.reed = 2; });
        let r = turn(session, 0, 'farm-expansion');
        if (r.interaction.stateId === 'wait' && expectWait(r).interaction.request.kind === 'choice') {
            const option = getChoiceOptions(r).find(o => o.labelKey === 'actions.construct.name');
            assert.ok(option);
            r = ok(session.resolveChoice(0, option.value));
        }
        for (const rooms of [[{ row: 0, col: 1 }, { row: 1, col: 1 }], [{ row: 99, col: 99 }], [{ row: 1, col: 0 }]])
            assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { rooms }));
        assertRejectedUnchanged(session, () => session.commitSelectionChoice(1, { rooms: [{ row: 1, col: 1 }] }));
        const legal = ok(session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] }));
        assert.equal(legal.state.players[0]!.resources.food, 43);
        assert.equal(legal.state.players[0]!.resources.clay, 0);
        save('A110-N3', legal);
    });
    it("opponent unplayed and undo cannot leave an extra owner construction reward", () => {
        const unplayed = build(setup(state => state.players[0]!.houseType = 'clay', false), 1);
        assert.equal(unplayed.state.players[0]!.resources.food, 40);
        const opponent = setup(state => state.players[1]!.houseType = 'clay');
        turn(opponent, 0, 'grain-seeds');
        const other = build(opponent, 1, 1);
        assert.equal(other.state.players[0]!.resources.food, 40);
        assert.equal(other.state.players[1]!.resources.food, 40);
        const session = setup(state => state.players[0]!.houseType = 'clay');
        const r = build(session, 1);
        const undone = ok(session.undoAction());
        assert.equal(undone.state.players[0]!.resources.food, 40);
        assert.equal(undone.state.players[0]!.resources.clay, 10);
        assert.equal(undone.state.players[0]!.rooms, 2);
        save('A110-N4', { r, undone, other, unplayed });
    });
});
