import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import '../../shared/cards/A/A104_WoodHarvester'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A104_WoodHarvester'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, spaceWood = {} }: { played?: boolean; spaceWood?: Record<string, number> } = {}) => {
  // Four players admit Forest, Grove and Copse, the three wood accumulation thresholds under test.
  const session = sessionEvidence.track(createWorkSession({ seed: 5104, options: { playerCount: 4 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = played ? 4 : 1
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = played ? 20 : 0
    player.resources.wood = 0
    if (played) markAllWorkersUsed(state, player)
    else setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  state.actionSpaces.forEach((space) => {
    space.resources.wood = spaceWood[space.id] ?? 0
  })
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

describe('A104 Wood Harvester parity', () => {
  it('A104 S1: Wood Harvester is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A104 S2: each qualifying wood accumulation space grants its threshold reward at harvest', () => {
    const response = autoAdvanceRoundEnd(setup({ spaceWood: { forest: 2, grove: 3, copse: 4 } }))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 18 })
  })

  it('A104 S3: wood accumulation spaces below two wood grant nothing', () => {
    const response = autoAdvanceRoundEnd(setup({ spaceWood: { forest: 1, grove: 0, copse: 1 } }))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 16 })
  })

  it('A104 S4: ignores wood sitting on non-wood accumulation spaces', () => {
    const response = autoAdvanceRoundEnd(setup({ spaceWood: { 'clay-pit': 2, 'reed-bank': 3 } }))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 16 })
  })
})

describe("A104 command boundaries", () => {
    const WOOD = 'A104_WoodHarvester';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, played = true, round = 5) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = round;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                state.players[0]!.occupationPlayed = played ? [WOOD] : [];
                state.players[0]!.occupationHand = played ? ['__test_placeholder__'] : [WOOD];
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
    function harvest(session: GameSession) {
        turn(session, 0, 'grain-seeds');
        turn(session, 1, 'reed-bank');
        turn(session, 0, 'day-laborer');
        let response = confirmNext(session, turn(session, 1, 'clay-pit'));
        for (let n = 0; n < 12 && response.interaction.stateId === 'wait'; n++) {
            const interaction = response.interaction;
            if (interaction.request.kind === 'feed')
                response = ok(session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] }));
            else if (interaction.request.kind === 'confirm-player-switch')
                response = ok(session.resolveChoice(interaction.request.toPlayerIndex, 'confirm'));
            else
                assert.fail(JSON.stringify(interaction));
        }
        assert.equal(response.state.round, 5);
        assert.equal(response.interaction.stateId, 'idle');
        return response;
    }
    it("natural round four harvest reads zero one two three and five wood thresholds", () => {
        for (const amount of [0, 1, 2, 3, 5]) {
            const session = setup(state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = amount, true, 4);
            const response = harvest(session);
            assert.equal(response.state.players[0]!.resources.wood, Number(amount === 2));
            assert.equal(response.state.players[0]!.resources.food, 38 + Number(amount >= 3));
            assert.equal(response.state.actionSpaces.find(s => s.id === 'forest')!.resources.wood, amount + 3);
            save(`A104-N1-${amount}`, response);
        }
    });
    it("nonharvest round and unplayed card cannot grant wood pile rewards", () => {
        const session = setup(state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 2);
        turn(session, 0, 'grain-seeds');
        turn(session, 1, 'reed-bank');
        turn(session, 0, 'day-laborer');
        const response = confirmNext(session, turn(session, 1, 'clay-pit'));
        assert.equal(response.state.round, 6);
        assert.equal(response.state.players[0]!.resources.wood, 0);
        assert.equal(response.state.players[0]!.resources.food, 42);
        const unplayed = harvest(setup(state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 2, false, 4));
        assert.equal(unplayed.state.players[0]!.resources.wood, 0);
        assert.equal(response.interaction.stateId, 'idle');
        assert.equal(response.state.roundPhase, 'work');
        assert.equal(unplayed.interaction.stateId, 'idle');
        assert.equal(unplayed.state.roundPhase, 'work');
        save('A104-N2', { response, unplayed });
    });
    it("owner reward cannot transfer to opponent and ordinary collection is not harvest", () => {
        const session = setup(state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 2, true, 4);
        const response = harvest(session);
        assert.equal(response.state.players[0]!.resources.wood, 1);
        assert.equal(response.state.players[1]!.resources.wood, 0);
        const collected = turn(setup(state => state.actionSpaces.find(s => s.id === 'forest')!.resources.wood = 2), 0, 'forest');
        assert.equal(collected.state.players[0]!.resources.wood, 2);
        assert.equal(collected.state.players[0]!.resources.food, 40);
        assert.equal(response.interaction.stateId, 'idle');
        assert.equal(response.state.roundPhase, 'work');
        assert.ok(collected.interaction.stateId === 'wait');
        assert.deepEqual(collected.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(collected.state.currentPlayerIndex, 0);
        save('A104-N3', { response, collected });
    });
});
