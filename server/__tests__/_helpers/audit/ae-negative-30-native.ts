// Helpers of ae-negative-30-native-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, PlayerState, ActionChoiceOption, Resource } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/30/oa-probes';
export const legalOrder = ['sheep-market', 'fencing', 'major-improvement', 'grain-utilization', 'wish-children', 'house-redevelopment', 'western-quarry', 'pig-market', 'vegetable-seeds', 'cattle-market', 'eastern-quarry', 'cultivation', 'urgent-wish-children', 'farm-redevelopment'];
export const twoCell = ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3'];
export const commands: unknown[] = [];
export function ok(r: SessionResponse): SessionResponse { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return JSON.parse(JSON.stringify(r)); }
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify({ commands, value }, null, 2)); }
export function make(card: string, configure: (st: GameState) => void = () => { }, played = true, round = 5) {
    const s = createWorkSession({ seed: 4230, options: { playerCount: 4 }, configure(st) {
            st.round = round;
            st.roundActionOrder = [...legalOrder];
            st.players.forEach(p => {
                p.occupationHand = ['__test_placeholder__'];
                p.minorHand = ['__test_placeholder__'];
                p.occupationPlayed = [];
                p.minorPlayed = [];
                p.improvements = [];
                p.cardStates = {};
                Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 100, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 });
            });
            st.players[0]!.occupationPlayed = played ? [card] : [];
            st.players[0]!.occupationHand = played ? ['A125_Priest', 'A133_Braggart'] : [card, 'A125_Priest'];
            if (card === 'B148_PetBroker') st.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 1;
            configure(st);
            if (!played) assert.ok(st.players[0]!.occupationHand.includes(card));
        } });
    sessions.push(s);
    return s;
}
export function take(s: GameSession, actor: number, space: string) { const slot=legalOrder.indexOf(space)+1; if(slot)assert.ok(slot<=s.state.round); commands.push({ command: 'takeAction', actor, space }); return ok(s.takeAction(actor, space)); }
export function choice(s: GameSession, actor: number, value: string, payload?: Parameters<GameSession['resolveChoice']>[2]) { commands.push({ command: 'resolveChoice', actor, value, payload }); return ok(s.resolveChoice(actor, value, payload)); }
export function select(s: GameSession, actor: number, payload: Parameters<GameSession['commitSelectionChoice']>[1]) { commands.push({ command: 'commitSelectionChoice', actor, payload }); return ok(s.commitSelectionChoice(actor, payload)); }
export function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && 'options' in r.interaction.request ? r.interaction.request.options ?? [] : []; }
export function finish(s: GameSession, first: SessionResponse, accept = true, markers: string[] = [], forbidden?: string) {
    let r = ok(first);
    for (let n = 0; n < 100 && r.interaction.stateId === 'wait'; n++) {
        if (forbidden)
            assert.equal(JSON.stringify(r.interaction.request).includes(forbidden), false, JSON.stringify(r.interaction));
        r = passPreparationExchanges(s, r);
        const i = r.interaction;
        if (i.stateId !== 'wait' || i.request.kind === 'confirm-next-player')
            return ok(r);
        const q = i.request;
        if (q.kind === 'confirm-player-switch')
            r = choice(s, q.fromPlayerIndex, 'confirm');
        else if (q.kind === 'choice' || q.kind === 'select-trigger') {
            const allowed = q.options.filter(o => !('disabled' in o && o.disabled));
            const preferred = markers.flatMap(m => allowed.filter(o => JSON.stringify(o).includes(m))).find(o => !['__pass__', '__skip__', '__done__'].includes(o.value));
            const picked = (accept ? preferred ?? allowed.find(o => !['__pass__', '__skip__', '__done__'].includes(o.value) && o.labelKey !== 'actions.exchange.name') : undefined)
                ?? allowed.find(o => ['__pass__', '__skip__', '__done__'].includes(o.value))
                ?? allowed.find(o => o.value !== '__pass__');
            assert.ok(picked, JSON.stringify(i));
            r = choice(s, i.playerIndex, picked.value);
        }
        else if (q.kind === 'animal-reorg') {
            const zones = q.zones.map(z => {
                if (z.zoneType === 'pasture' && z.id === 'negative30')
                    return { ...z, animalType: 'sheep', animalCount: r.state.players[i.playerIndex]!.resources.sheep };
                if (z.zoneType === 'house' && r.state.players[i.playerIndex]!.occupationPlayed.includes('B148_PetBroker'))
                    return { ...z, animalType: null, animalCount: 0 };
                if (z.zoneType === 'card' && z.id === 'card:B148_PetBroker')
                    return { ...z, animalType: 'sheep', animalCount: Math.min(z.capacity, r.state.players[i.playerIndex]!.resources.sheep) };
                return z;
            });
            r = choice(s, i.playerIndex, 'confirm', { zones });
        }
        else if (q.kind === 'farm-select' && q.farm.farmType === 'stable')
            r = select(s, i.playerIndex, { stables: [{ row: 0, col: 1 }] });
        else if (q.kind === 'farm-select' && q.farm.farmType === 'room')
            r = select(s, i.playerIndex, { rooms: [q.farm.selectableTiles[0]!] });
        else if (q.kind === 'farm-select' && q.farm.farmType === 'plow')
            r = select(s, i.playerIndex, { tile: q.farm.selectableTiles[0]! });
        else if (q.kind === 'feed')
            r = choice(s, i.playerIndex, 'confirm', { selections: [] });
        else
            assert.fail(`Unexpected pending ${JSON.stringify(i)}`);
    }
    assert.notEqual(r.interaction.stateId, 'wait', 'Resolution exhausted');
    return ok(r);
}
export function ready(s: GameSession) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    r = confirmNext(s, r); r = finish(s, r, false); if (!r.state.gameOver)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction)); return r; }
export function play(s: GameSession, card: string) { let r = take(s, 0, 'lessons'); if (r.state.players[0]!.occupationHand.includes(card)) {
    const c = opts(r).find(o => o.value === card);
    assert.ok(c, JSON.stringify(r.interaction));
    r = choice(s, 0, c.value);
} assert.ok(r.state.players[0]!.occupationPlayed.includes(card)); return r; }
export function undo(s: GameSession) { commands.push({ command: 'undoAction', actor: 0 }); return ok(s.undoAction()); }
export function ownerTurn(s: GameSession) { for (let n = 0; n < 4; n++) {
    const r = ready(s);
    if (r.state.currentPlayerIndex === 0)
        return r;
    fill(s);
} assert.fail('owner turn not reached'); }
export function fill(s: GameSession, excluded: string[] = []) { const r = ready(s); if (r.state.gameOver)
    return r; const a = r.state.currentPlayerIndex, av = s.getActionAvailability(a); const space = ['grain-seeds', 'forest', 'clay-pit', 'reed-bank', 'fishing', 'grove', 'copse', 'hollow-4', 'hollow', 'traveling-players', 'resource-market-4', 'resource-market', 'day-laborer'].find(id => av[id] && !excluded.includes(id)); assert.ok(space, JSON.stringify(av)); return finish(s, take(s, a, space), false); }
export function reach(s: GameSession, target: number, excluded: string[] = []) { for (let n = 0; n < 120; n++) {
    const r = ready(s);
    if (r.state.round === target || r.state.gameOver)
        return r;
    assert.ok(r.state.round < target);
    fill(s, excluded);
} assert.fail('natural transition not reached'); }
export function final(s: GameSession) { for (let n = 0; n < 16; n++) {
    if (s.getState().state.gameOver)
        return ok(s.getState());
    fill(s);
} assert.fail('final scoring not reached'); }
export function pasture(p: PlayerState, sheep = 0) { p.pastures = [{ id: 'negative30', tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }], animalType: sheep ? 'sheep' : null, animalCount: sheep }]; p.stableTiles = [{ row: 0, col: 1 }]; p.fenceSegments = twoCell.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })); p.resources.sheep = sheep; }
export function rooms(p: PlayerState, n: number) { p.rooms = n; p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }].slice(0, n); }
export function pile(st: GameState, space: string, type: keyof Resource, amount: number) { const p = st.actionSpaces.find(x => x.id === space); assert.ok(p); p.resources[type] = amount; }
export function at(r: SessionResponse, space: string, actor = 0) { return r.state.actionSpaces.find(x => x.id === space)!.takenBy.filter(x => x.playerId === r.state.players[actor]!.id); }
export function res(r: SessionResponse, values: Partial<Resource>, actor = 0) { for (const [k, v] of Object.entries(values))
    assert.equal(Object.entries(r.state.players[actor]!.resources).find(([key]) => key === k)?.[1], v, k); }
export function bonus(r: SessionResponse, card: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => 'cardId' in e && e.cardId === card).reduce((sum, e) => sum + e.score, 0) ?? 0; }
export function enter(s: GameSession, r: SessionResponse, test: (o: ActionChoiceOption) => boolean) { for (let n = 0; n < 12; n++) {
    assert.ok(r.interaction.stateId === 'wait');
    const found = opts(r).find(test);
    if (found)
        return choice(s, r.interaction.playerIndex, found.value);
    if (r.interaction.request.kind === 'select-trigger') {
        const source = opts(r).find(o => o.value !== '__pass__' && o.labelKey !== 'actions.exchange.name');
        assert.ok(source);
        r = choice(s, r.interaction.playerIndex, source.value);
    }
    else
        assert.fail(JSON.stringify(r.interaction));
} assert.fail('choice not reached'); }
export function expansion(s: GameSession, actor = 0, room = false) { let r = take(s, actor, 'farm-expansion'); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    r = enter(s, r, o => o.labelKey === (room ? 'actions.construct.name' : 'actions.stables.name')); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select'); if (room) {
    assert.equal(r.interaction.request.farm.farmType, 'room');
    assert.ok(r.interaction.request.farm.farmType === 'room');
    return select(s, actor, { rooms: [r.interaction.request.farm.selectableTiles[0]!] });
} assert.equal(r.interaction.request.farm.farmType, 'stable'); return select(s, actor, { stables: [{ row: 0, col: 1 }] }); }
export function buyMajor(s: GameSession, actor = 0) { let r = take(s, actor, 'major-improvement'); if (!r.state.players[actor]!.improvements.includes('Major_Fireplace1'))
    r = enter(s, r, o => o.value === 'Major_Fireplace1'); assert.ok(r.state.players[actor]!.improvements.includes('Major_Fireplace1')); return r; }
export function reorg(s: GameSession) { const r = take(s, 0, 'sheep-market'); assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg'); return r; }
export function future(r: SessionResponse) { return r.state.futureMeeples.filter(x => x.cardId === 'B164_SheepWhisperer').map(x => x.round).sort((a, b) => a - b); }
export function occupiedByOpponent(s: GameSession, target = 'day-laborer') { finish(s, take(s, 1, target), true); ownerTurn(s); }
export function phase(s: GameSession, placements: Array<[
    number,
    string
]>, excluded: string[] = []) { for (const [a, space] of placements) {
    assert.equal(ready(s).state.currentPlayerIndex, a);
    finish(s, take(s, a, space), false);
} const before = ok(s.getState()), target = before.state.round + 1, r = reach(s, target, excluded); return { before, r }; }
export const qualifying: Array<[
    number,
    string
]> = [[0, 'forest'], [1, 'clay-pit'], [2, 'reed-bank'], [3, 'fishing'], [0, 'grove']];
export function plow(s: GameSession, a: number, tile = { row: 0, col: 2 }) { const p = take(s, a, 'farmland'); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'farm-select'); return finish(s, select(s, a, { tile }), true); }
export const pub: Array<[
    number,
    string
]> = [[0, 'forest'], [1, 'clay-pit'], [2, 'reed-bank'], [3, 'fishing'], [0, 'grain-seeds']];
export function weak(st: GameState, n: number) { st.actionSpaces.forEach(x => { Object.assign(x.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 }); }); pile(st, 'forest', 'wood', n); }
