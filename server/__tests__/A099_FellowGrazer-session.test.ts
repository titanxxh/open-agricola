import { captureStateWithHistory } from '../../shared/session/history-streams'
import { getChoiceOptions, assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { type PlayerState, type GameState, type FarmTilePosition } from '../../shared/contract/types'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A099_FellowGrazer'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A099_FellowGrazer'

const FILLER = '__test_placeholder__'

const pasture = (id: string, row: number, size: number): PlayerState['pastures'][number] => ({ id, tiles: Array.from({ length: size }, (_, col) => ({ row, col: col + 1 })), animalType: null, animalCount: 0 })

const setup = ({ played = true, pastureSizes = [] }: { played?: boolean; pastureSizes?: number[] } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5099, options: { playerCount: 2 } }))
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
  owner.resources.food = 0
  owner.pastures = pastureSizes.map((size, index) => pasture(`p${index + 1}`, index, size))
  const boundaries = owner.pastures.flatMap(pasture => {
    const edges = new Set<string>()
    for (const { row, col } of pasture.tiles) {
      for (const edge of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]) {
        if (edges.has(edge)) edges.delete(edge)
        else edges.add(edge)
      }
    }
    return [...edges]
  })
  owner.fenceSegments = [...new Set(boundaries)].map(edge => ({ edge, type: 'fence' }))
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

const bonusScore = (session: GameSession) => {
  const scores = session.getState().scores
  assert.ok(scores)
  return scores[0]!.categories.find(category => category.key === 'cardBonusVp')
    ?.entries.find(entry => entry.type === 'bonus' && entry.cardId === CARD_ID)?.score ?? 0
}

describe('A099 Fellow Grazer parity', () => {
  it('A099 S1: Fellow Grazer is played as the first occupation without paying food', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A099 S2: no pasture scores no Fellow Grazer bonus', () => {
    expect(bonusScore(setup())).toBe(0)
  })

  it('A099 S3: a two-space pasture is below the scoring threshold', () => {
    expect(bonusScore(setup({ pastureSizes: [2] }))).toBe(0)
  })

  it('A099 S4: one three-space pasture scores two bonus points', () => {
    expect(bonusScore(setup({ pastureSizes: [3] }))).toBe(2)
  })

  it('A099 S5: two qualifying pastures score four bonus points', () => {
    expect(bonusScore(setup({ pastureSizes: [3, 3] }))).toBe(4)
  })
})

describe("A099 command boundaries", () => {
    const GRAZER = 'A099_FellowGrazer';
    function save(id: string, value: unknown) {
        sessionEvidence.record(id, value);
    }
    function ok(response: SessionResponse) { assert.equal(response.ok, true, response.error); return response; }
    function setup(configure: (state: GameState) => void = () => { }, played = true, owner = 0) {
        const session = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 14;
                for (const player of state.players)
                    Object.assign(player.resources, { food: 40, wood: 15, clay: 5, reed: 0, stone: 0, grain: 0, vegetable: 0 });
                const player = state.players[owner]!;
                player.occupationPlayed = played ? [GRAZER] : [];
                player.occupationHand = played ? ['__test_placeholder__'] : [GRAZER];
                configure(state);
                for (const player of state.players)
                    for (const card of player.improvements)
                        takeMajorImprovementFromSupply(state, card);
            } }));
        assert.equal(session.getState().state.players.length, 2);
        return session;
    }
    function bonus(response: SessionResponse, card: string, owner = 0) {
        assert.ok(response.scores);
        return response.scores[owner]!.categories.find(category => category.key === 'cardBonusVp')?.entries
            .filter(entry => entry.type === 'bonus' && entry.cardId === card).reduce((sum, entry) => sum + entry.score, 0) ?? 0;
    }
    function pasture(state: GameState, tiles: FarmTilePosition[], owner = 0) {
        const player = state.players[owner]!;
        player.pastures.push({ id: `pasture-${player.pastures.length}`, tiles, animalType: null, animalCount: 0 });
        const edges = new Set<string>();
        for (const { row, col } of tiles)
            for (const edge of [`H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`]) {
                if (edges.has(edge))
                    edges.delete(edge);
                else
                    edges.add(edge);
            }
        for (const edge of edges)
            if (!player.fenceSegments.some(segment => segment.edge === edge))
                player.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } });
    }
    it("two three and four tile pastures use the three tile threshold", () => {
        for (const [size, expected] of [[2, 0], [3, 2], [4, 2]]) {
            const session = setup(state => pasture(state, Array.from({ length: size }, (_, col) => ({ row: 0, col: col + 1 }))));
            const response = session.getState();
            assert.equal(bonus(response, GRAZER), expected);
            save(`A099-N1-${size}`, response);
        }
    });
    it("two qualifying pastures count separately and empty pasture still qualifies", () => {
        const session = setup(state => { pasture(state, [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }]); pasture(state, [{ row: 1, col: 2 }, { row: 1, col: 3 }, { row: 1, col: 4 }]); });
        const response = session.getState();
        assert.equal(bonus(response, GRAZER), 4);
        assert.equal(bonus(session.getState(), GRAZER), 4);
        save('A099-N2', response);
    });
    it("own card in hand and opponent pasture do not grant owner points", () => {
        const tiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }];
        assert.equal(bonus(setup(state => pasture(state, tiles), false).getState(), GRAZER), 0);
        const opponentPasture = setup(state => pasture(state, tiles, 1)).getState();
        assert.deepEqual(opponentPasture.state.players.map(player => player.occupationPlayed), [[GRAZER], []]);
        assert.deepEqual(opponentPasture.state.players.map(player => player.pastures.map(pasture => pasture.tiles)), [[], [tiles]]);
        assert.deepEqual(opponentPasture.state.players[1]!.fenceSegments.map(segment => segment.edge).sort(), [
            'H-0-1', 'H-0-2', 'H-0-3', 'H-1-1', 'H-1-2', 'H-1-3', 'V-0-1', 'V-0-4',
        ]);
        assert.equal(bonus(opponentPasture, GRAZER), 0);
        assert.equal(bonus(opponentPasture, GRAZER, 1), 0);
        assert.equal(opponentPasture.interaction.stateId, 'idle');
        assert.equal(opponentPasture.state.currentPlayerIndex, 0);
        save('A099-N3-opponent-only', opponentPasture);
        const response = setup(state => pasture(state, tiles, 1), true, 1).getState();
        assert.equal(bonus(response, GRAZER), 0);
        assert.equal(bonus(response, GRAZER, 1), 2);
        save('A099-N3', response);
    });
    it("real three tile pasture scores two and whole action undo removes the bonus", () => {
        const session = setup();
        const rawBefore = { ...session.getState(), state: captureStateWithHistory(session.getState().state), interaction: structuredClone(session.getState().interaction), scores: structuredClone(session.getState().scores) };
        assert.equal(rawBefore.interaction.stateId, 'idle');
        assert.equal(rawBefore.state.currentPlayerIndex, 0);
        const undoInteraction = JSON.stringify(rawBefore.interaction);
        ok(session.takeAction(0, 'fencing'));
        const edges = ['H-0-1', 'H-0-2', 'H-0-3', 'H-1-1', 'H-1-2', 'H-1-3', 'V-0-1', 'V-0-4'];
        const response = ok(session.commitSelectionChoice(0, { edges, extraWood: 0 }));
        assert.equal(bonus(response, GRAZER), 2);
        assert.equal(response.state.players[0]!.resources.wood, 7);
        const undone = ok(session.undoAction());
        save('A099-raw-undo', { before: rawBefore, undone });
        assertUndoRestored(undoRuleSnapshot(rawBefore), undone);
        const live = session.getState();
        assertUndoRestored(undoRuleSnapshot(rawBefore), live);
        assert.deepEqual(live.interaction, rawBefore.interaction);
        assert.equal(live.interaction.stateId, 'idle');
        assert.equal(live.state.currentPlayerIndex, 0);
        assert.equal(JSON.stringify(undone.interaction), undoInteraction);
        assert.equal(undone.interaction.stateId, 'idle');
        assert.equal(undone.state.currentPlayerIndex, 0);
        assert.equal(bonus(undone, GRAZER), 0);
        assert.equal(undone.state.players[0]!.pastures.length, 0);
        assert.equal(undone.state.players[0]!.resources.wood, 15);
        assert.ok(response.interaction.stateId === 'wait');
        assert.deepEqual(response.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: 1 });
        assert.equal(response.interaction.playerIndex, 0);
        assert.equal(response.state.currentPlayerIndex, 0);
        save('A099-N4', { response, undone });
    });
});
