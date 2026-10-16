import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A008_FoodBasket'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A008_FoodBasket';

const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist'];

const IMPROVEMENTS = ['A041_VegetableSlicer', 'B010_Caravan'];

const setup = ({ occupations, improvements, reed, }: {
    occupations: number;
    improvements: number;
    reed: number;
}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 8, options: { playerCount: 2 } }));
    const state = session.getState().state;
    stabilizeRandomHands(state.players);
    state.currentPlayerIndex = 0;
    state.round = 1;
    state.roundPhase = 'work';
    const player = state.players[0]!;
    setWorkersAtHome(state, player, 2);
    player.minorHand = [CARD_ID];
    player.occupationPlayed = OCCUPATIONS.slice(0, occupations);
    player.minorPlayed = IMPROVEMENTS.slice(0, improvements);
    player.resources.reed = reed;
    player.resources.grain = 0;
    player.resources.vegetable = 0;
    session.loadState(state);
    return session;
};

const openMinorPrompt = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place');
    expect(response.ok, response.error).toBe(true);
    if (response.interaction.stateId !== 'wait')
        return response;
    if (getChoiceOptions(response)?.some((option) => option.value === CARD_ID))
        return response;
    const improvement = getChoiceOptions(response)?.find((option) => option.value.startsWith('action-improvement-'));
    if (improvement)
        response = session.resolveChoice(0, improvement.value);
    return response;
};

const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
    : undefined;

const playMinor = (session: GameSession) => {
    const response = openMinorPrompt(session);
    if (!response.state.players[0]!.minorHand.includes(CARD_ID))
        return response;
    const option = cardOption(response);
    expect(option).toBeDefined();
    return session.resolveChoice(0, option!.value);
};

describe('A008 Food Basket parity', () => {
    it('A008 S1: prerequisites and one reed grant grain and vegetable before the card passes', () => {
        const response = playMinor(setup({ occupations: 2, improvements: 2, reed: 1 }));
        expect(response.ok, response.error).toBe(true);
        expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, grain: 1, vegetable: 1 });
        expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID);
        expect(response.state.players[1]!.minorHand).toContain(CARD_ID);
    });
    it('A008 S2: one occupation keeps Food Basket unavailable', () => {
        const session = setup({ occupations: 1, improvements: 2, reed: 1 });
        const response = openMinorPrompt(session);
        expect(cardOption(response)).toBeUndefined();
        expect(response.state.players[0]!.resources.reed).toBe(1);
        expect(response.state.players[0]!.minorHand).toContain(CARD_ID);
    });
    it('A008 S3: one improvement keeps Food Basket unavailable', () => {
        const session = setup({ occupations: 2, improvements: 1, reed: 1 });
        const response = openMinorPrompt(session);
        expect(cardOption(response)).toBeUndefined();
        expect(response.state.players[0]!.resources.reed).toBe(1);
        expect(response.state.players[0]!.minorHand).toContain(CARD_ID);
    });
    it('A008 S4: no reed keeps Food Basket unavailable after both prerequisites', () => {
        const session = setup({ occupations: 2, improvements: 2, reed: 0 });
        const response = openMinorPrompt(session);
        expect(cardOption(response)).toBeUndefined();
        expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, grain: 0, vegetable: 0 });
        expect(response.state.players[0]!.minorHand).toContain(CARD_ID);
        expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID);
    });
});

describe("A008 command boundaries", () => {
    const BASKET = 'A008_FoodBasket';
    const MARKET = 'A009_YoungAnimalMarket';
    function setup(card: string, { ownMajors = [], opponentMajors = [], occupations = 0, improvements = 0, resources = {}, opponentPrerequisites = false, inHand = true }: {
        ownMajors?: string[];
        opponentMajors?: string[];
        occupations?: number;
        improvements?: number;
        resources?: Partial<PlayerState['resources']>;
        opponentPrerequisites?: boolean;
        inHand?: boolean;
    } = {}) {
        const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
                state.round = 14;
                state.players.forEach(p => {
                    p.minorHand = ['B007_Wage', 'A054_Credit'];
                    p.occupationHand = ['__test_placeholder__'];
                    Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, cattle: 0 });
                });
                const p = state.players[0]!;
                if (inHand)
                    p.minorHand.push(card);
                else
                    state.players[1]!.minorHand.push(card);
                p.improvements = ownMajors;
                if (card === MARKET && resources.sheep === 1)
                    p.minorPlayed = ['A017_ReclamationPlow'];
                state.players[1]!.improvements = opponentMajors;
                const target = state.players[opponentPrerequisites ? 1 : 0]!;
                target.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist'].slice(0, occupations);
                target.minorPlayed = ['A041_VegetableSlicer', 'B010_Caravan'].slice(0, improvements);
                Object.assign(p.resources, resources);
                if (resources.cattle === 1) {
                    p.houseAnimals = { '2-0': 'cattle' };
                }
            } }));
        return s;
    }
    function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
    function options(r: SessionResponse) {
        ok(r);
        assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction));
        return r.interaction.request.options;
    }
    function enter(s: GameSession) {
        let r = ok(s.takeAction(0, 'meeting-place'));
        const branch = options(r).find(o => o.value.startsWith('action-improvement-'));
        if (branch)
            r = ok(s.resolveChoice(0, branch.value));
        return r;
    }
    function buy(s: GameSession, r: SessionResponse, card: string) {
        assert.ok(options(r).some(o => o.value === card));
        return ok(s.resolveChoice(0, card));
    }
    function passed(r: SessionResponse, card: string) {
        const p = r.state.players[0]!;
        assert.equal(p.minorHand.includes(card), false);
        assert.equal(p.minorPlayed.includes(card), false);
        assert.equal(r.state.players[1]!.minorHand.filter(id => id === card).length, 1);
        assert.equal(r.state.roundPhase, 'work');
        assert.deepEqual([r.state.players[1]!.resources.stone, r.state.players[1]!.resources.wood, r.state.players[1]!.resources.clay, r.state.players[1]!.resources.reed, r.state.players[1]!.resources.grain, r.state.players[1]!.resources.vegetable, r.state.players[1]!.resources.sheep, r.state.players[1]!.resources.cattle], [0, 0, 0, 0, 0, 0, 0, 0]);
        assert.equal(r.scores?.length, 2);
        const plays = r.state.events.filter(event => 'fromPlayerId' in event && event.cardId === card);
        assert.equal(plays.length, 1);
        const play = plays[0]!;
        assert.ok('fromPlayerId' in play);
        assert.equal(play.fromPlayerId, p.id);
        assert.equal(play.toPlayerId, r.state.players[1]!.id);
        const payments = r.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === card);
        const expectedCost = card === BASKET ? { reed: 1 } : card === MARKET ? { sheep: 1 } : {};
        assert.equal(payments.length, Object.keys(expectedCost).length ? 1 : 0);
        if (payments.length) {
            const payment = payments[0]!;
            assert.ok(payment.type === 'resource.paid');
            assert.deepEqual(payment.resources, expectedCost);
        }
        const rewards = r.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card && event.reason === 'cardEffect');
        const expectedGain = card === BASKET ? { grain: 1, vegetable: 1 } : card === MARKET ? { cattle: 1 } : {
            ...(p.improvements.includes('Major_Well') ? { stone: 1 } : {}),
            ...(p.improvements.includes('Major_Joinery') ? { wood: 1 } : {}),
            ...(p.improvements.includes('Major_Pottery') ? { clay: 1 } : {}),
            ...(p.improvements.includes('Major_Basket') ? { reed: 1 } : {}),
        };
        assert.equal(rewards.length, Object.keys(expectedGain).length ? 1 : 0);
        if (rewards.length) {
            const reward = rewards[0]!;
            assert.ok(reward.type === 'resource.moved');
            assert.deepEqual(reward.resources, expectedGain);
            assert.deepEqual(reward.to, { kind: 'player', playerId: p.id });
        }
    }
    function resources(r: SessionResponse) {
        const p = r.state.players[0]!.resources;
        return { stone: p.stone, wood: p.wood, clay: p.clay, reed: p.reed, grain: p.grain, vegetable: p.vegetable, sheep: p.sheep, cattle: p.cattle };
    }
    const ZERO = { stone: 0, wood: 0, clay: 0, reed: 0, grain: 0, vegetable: 0, sheep: 0, cattle: 0 };
    function noRepeat(s: GameSession, card: string) { assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); }
    it("two occupations and mixed major minor prerequisites pay reed for exactly one of each crop", () => {
        const s = setup(BASKET, { occupations: 2, improvements: 1, ownMajors: ['Major_Fireplace1'], resources: { reed: 2 } });
        const offer = enter(s);
        assert.deepEqual(resources(offer), { ...ZERO, reed: 2 });
        assertRejectedUnchanged(s, () => s.resolveChoice(1, BASKET));
        const r = buy(s, offer, BASKET);
        assert.deepEqual(resources(r), { ...ZERO, reed: 1, grain: 1, vegetable: 1 });
        passed(r, BASKET);
        noRepeat(s, BASKET);
    });
    for (const scenario of [
        { name: "one occupation rejects forged purchase before legal retry", occupations: 1, improvements: 2, reed: 1 },
        { name: "one improvement rejects forged purchase before legal retry", occupations: 2, improvements: 1, reed: 1 },
        { name: "zero reed rejects forged purchase before legal retry", occupations: 2, improvements: 2, reed: 0 },
    ]) {
        it(scenario.name, () => {
            const s = setup(BASKET, { ...scenario, resources: { reed: scenario.reed } });
            const r = enter(s);
            assert.equal(options(r).some(o => o.value === BASKET), false);
            assertRejectedUnchanged(s, () => s.resolveChoice(0, BASKET));
            const retry = buy(s, r, 'A054_Credit');
            assert.deepEqual(resources(retry), { ...ZERO, reed: scenario.reed });
            assert.equal(retry.state.players[0]!.minorHand.includes(BASKET), true);
            assert.equal(retry.state.players[1]!.minorHand.includes(BASKET), false);
        });
    }
    it("opponents occupations and improvements cannot satisfy own prerequisites", () => {
        const s = setup(BASKET, { occupations: 2, improvements: 2, opponentPrerequisites: true, resources: { reed: 1 } });
        const r = enter(s);
        assert.equal(options(r).some(o => o.value === BASKET), false);
        assertRejectedUnchanged(s, () => s.resolveChoice(0, BASKET));
        assert.deepEqual(resources(buy(s, r, 'A054_Credit')), { ...ZERO, reed: 1 });
    });
    it("undo restores paid reed crops hand and worker before a single legal retry", () => {
        const s = setup(BASKET, { occupations: 2, improvements: 2, resources: { reed: 1 } });
        const before = undoRuleSnapshot(s.getState());
        passed(buy(s, enter(s), BASKET), BASKET);
        assertUndoRestored(before, s.undoAction());
        const r = buy(s, enter(s), BASKET);
        assert.deepEqual(resources(r), { ...ZERO, grain: 1, vegetable: 1 });
        passed(r, BASKET);
    });
});
