// Helpers of ae-negative-36-native-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, PlayerState, Resource } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/36/oa-probes';
export const traces: unknown[] = [];
export const order = ['sheep-market', 'fencing', 'major-improvement', 'grain-utilization', 'wish-children', 'house-redevelopment', 'western-quarry', 'pig-market', 'vegetable-seeds', 'cattle-market', 'eastern-quarry', 'cultivation', 'urgent-wish-children', 'farm-redevelopment'];
export const prerequisites: Record<string, number> = { C048_Farmstead: 1, D044_ForestWell: 2, D046_PelletPress: 2, E046_WaterlilyPond: 2 };
export function ok(r: SessionResponse): SessionResponse { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return JSON.parse(JSON.stringify(r)); }
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify({ commands: traces, value }, null, 2)); }
export function make(card: string, configure: (st: GameState) => void = () => { }, played = true, round = 5) { const s = createWorkSession({ seed: 4236, options: { playerCount: 2 }, configure(st) { st.round = round; st.roundActionOrder = [...order]; for (const [p, i] of st.players.map((p, i): [
        PlayerState,
        number
    ] => [p, i])) {
        p.occupationHand = i === 0 ? ['A125_Priest', 'A103_Portmonger'] : ['A116_WoodCutter', 'A123_FrameBuilder'];
        p.minorHand = i === 0 ? ['B004_WoodPile', 'A006_StorageBarn'] : ['__test_placeholder__'];
        p.occupationPlayed = [];
        p.minorPlayed = [];
        p.improvements = [];
        p.cardStates = {};
        Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 100, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 });
    } const p = st.players[0]!; if (played) {
        p.minorPlayed = [card];
        occupations(p, prerequisites[card] ?? 0);
        if (card === 'D048_CivicFacade')
            house(p, 3);
    }
    else
        p.minorHand.unshift(card); configure(st); for (const owner of st.players)
        for (const id of [...owner.minorHand, ...owner.minorPlayed, ...owner.occupationHand, ...owner.occupationPlayed])
            if (id !== '__test_placeholder__')
                assert.ok(fs.existsSync(new URL(`../../../../shared/cards/${id[0]}/${id}.ts`, import.meta.url)), `Unknown fixture card ${id}`); if (!played)
        assert.ok(p.minorHand.includes(card)); } }); sessions.push(s); return s; }
export function take(s: GameSession, a: number, space: string) { const n = order.indexOf(space) + 1; assert.ok(!n || n <= s.state.round); traces.push({ command: 'takeAction', actor: a, space, round: s.state.round }); return ok(s.takeAction(a, space)); }
export function choose(s: GameSession, a: number, value: string, payload?: Parameters<GameSession['resolveChoice']>[2]) { traces.push({ command: 'resolveChoice', actor: a, value, payload }); return ok(s.resolveChoice(a, value, payload)); }
export function select(s: GameSession, a: number, payload: Parameters<GameSession['commitSelectionChoice']>[1]) { traces.push({ command: 'commitSelectionChoice', actor: a, payload }); return ok(s.commitSelectionChoice(a, payload)); }
export function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && 'options' in r.interaction.request ? r.interaction.request.options ?? [] : []; }
export function finish(s: GameSession, first: SessionResponse, accept = true, markers: string[] = [], forbidden?: string) { let r = ok(first); for (let n = 0; n < 120 && r.interaction.stateId === 'wait'; n++) {
    if (forbidden)
        assert.equal(JSON.stringify(r.interaction.request).includes(forbidden), false, JSON.stringify(r.interaction));
    r = passPreparationExchanges(s, r);
    const i = r.interaction;
    if (i.stateId !== 'wait' || i.request.kind === 'confirm-next-player')
        return ok(r);
    const q = i.request;
    if (q.kind === 'confirm-player-switch')
        r = choose(s, q.fromPlayerIndex, 'confirm');
    else if (q.kind === 'choice' || q.kind === 'select-trigger') {
        const active = q.options.filter(o => !('disabled' in o && o.disabled)), preferred = markers.flatMap(m => active.filter(o => JSON.stringify(o).includes(m))).find(o => !['__pass__', '__skip__', '__done__'].includes(o.value));
        const picked = (accept ? preferred ?? active.find(o => !['__pass__', '__skip__', '__done__'].includes(o.value) && o.labelKey !== 'actions.exchange.name') : undefined) ?? active.find(o => ['__pass__', '__skip__', '__done__'].includes(o.value)) ?? active[0];
        assert.ok(picked, JSON.stringify(i));
        r = choose(s, i.playerIndex, picked.value);
    }
    else if (q.kind === 'farm-select' && q.farm.farmType === 'plow')
        r = select(s, i.playerIndex, { tile: q.farm.selectableTiles[0]! });
    else if (q.kind === 'animal-reorg')
        r = choose(s, i.playerIndex, 'confirm', { zones: q.zones });
    else if (q.kind === 'feed')
        r = choose(s, i.playerIndex, 'confirm', { selections: [] });
    else
        assert.fail(JSON.stringify(i));
} assert.notEqual(r.interaction.stateId, 'wait'); return ok(r); }
export function ready(s: GameSession, accept = true, markers: string[] = [], forbidden?: string) { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
    traces.push({ command: 'resolveChoice', actor: r.interaction.request.nextPlayerIndex, value: 'confirm' });
    r = confirmNext(s, r);
} return finish(s, r, accept, markers, forbidden); }
export function fill(s: GameSession, accept = true, markers: string[] = [], forbidden?: string) { const r = ready(s, accept, markers, forbidden); if (r.state.gameOver || r.interaction.stateId === 'wait')
    return r; const a = r.state.currentPlayerIndex, av = s.getActionAvailability(a), space = ['clay-pit', 'reed-bank', 'grain-seeds', 'forest', 'fishing', 'day-laborer'].find(id => av[id]); assert.ok(space, JSON.stringify(av)); return finish(s, take(s, a, space), accept, markers, forbidden); }
export function reach(s: GameSession, target: number, accept = true, markers: string[] = [], forbidden?: string) { for (let n = 0; n < 120; n++) {
    const r = ready(s, accept, markers, forbidden);
    if (r.state.round === target || r.state.gameOver || r.interaction.stateId === 'wait')
        return r;
    assert.ok(r.state.round < target);
    fill(s, accept, markers, forbidden);
} assert.fail('Natural phase not reached'); }
export function end(s: GameSession, accept = true, markers: string[] = [], forbidden?: string) { return reach(s, s.state.round + 1, accept, markers, forbidden); }
export function final(s: GameSession) { for (let n = 0; n < 25; n++) {
    if (s.state.gameOver)
        return ok(s.getState());
    fill(s);
} assert.fail('Actual final not reached'); }
export function minor(s: GameSession, a = 0) { let r = take(s, a, 'meeting-place'); for (let n = 0; n < 10; n++) {
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction));
    if (opts(r).some(o => o.value === 'B004_WoodPile' || o.value === 'A006_StorageBarn' || o.value.startsWith('Major_')))
        return r;
    const o = opts(r).find(o => o.value.startsWith('action-improvement-'));
    assert.ok(o);
    r = choose(s, a, o.value);
} assert.fail('Minor menu not reached'); }
export function purchase(s: GameSession, id: string, markers: string[] = []) { const p = minor(s), o = opts(p).find(o => o.value === id || o.value === `minor:${id}`); assert.ok(o, JSON.stringify(p.interaction)); return finish(s, choose(s, 0, o.value), true, markers); }
export function rejectBuy(s: GameSession, id: string) { const p = minor(s); assert.equal(opts(p).some(o => (o.value === id || o.value === `minor:${id}`) && !('disabled' in o && o.disabled)), false); const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, id)), r = finish(s, choose(s, 0, 'B004_WoodPile')); assert.ok(r.state.players[0]!.minorHand.includes(id)); return { p, bad, r }; }
export function undo(s: GameSession) { traces.push({ command: 'undoAction' }); return ok(s.undoAction()); }
export function resource(r: SessionResponse, expected: Partial<Resource>, p = 0) { for (const [k, v] of Object.entries(expected))
    assert.equal(Object.entries(r.state.players[p]!.resources).find(([key]) => key === k)?.[1], v, k); }
export function future(r: SessionResponse, id: string) { return r.state.futureMeeples.filter(e => e.cardId === id).flatMap(e => Array.from({ length: e.resources.food ?? 0 }, () => e.round)).sort((a, b) => a - b); }
export function bonus(r: SessionResponse, id: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => 'cardId' in e && e.cardId === id).reduce((n, e) => n + e.score, 0) ?? 0; }
export function points(r: SessionResponse, id: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cards')?.entries.filter(e => 'cardId' in e && e.cardId === id).reduce((n, e) => n + e.score, 0) ?? 0; }
export function occupied(r: SessionResponse, a = 0) { return r.state.actionSpaces.flatMap(x => x.takenBy).filter(x => x.playerId === r.state.players[a]!.id); }
export function major(s: GameSession, id: string, a = 0) { let r = take(s, a, 'major-improvement'); for (let n = 0; n < 15; n++) {
    if (r.state.players[a]!.improvements.includes(id))
        return finish(s, r);
    assert.ok(r.interaction.stateId === 'wait');
    const o = opts(r).find(o => o.value === id) ?? opts(r).find(o => o.value.startsWith('action-improvement-')) ?? opts(r).find(o => o.value !== '__skip__' && o.value !== '__pass__' && o.labelKey !== 'actions.exchange.name');
    assert.ok(o, JSON.stringify(r.interaction));
    r = choose(s, r.interaction.playerIndex, o.value);
} assert.fail('Major purchase not reached'); }
export function ownMajor(st: GameState, id: string, a = 0) { assert.ok(st.availableMajorImprovements.includes(id), `Unavailable fixture major ${id}`); st.players[a]!.improvements.push(id); st.availableMajorImprovements = st.availableMajorImprovements.filter(x => x !== id); }
export function occupations(p: PlayerState, n: number) { p.occupationPlayed = ['A110_Roughcaster', 'A100_Curator', 'A099_FellowGrazer'].slice(0, n); }
export function house(p: PlayerState, n: number) { p.rooms = n; p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }].slice(0, n); }
export function stables(p: PlayerState, n: number) { p.stableTiles = Array.from({ length: n }, (_, i) => ({ row: 0, col: i + 1 })); p.stableAnimals = {}; }
export const square = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'];
export function enclose(p: PlayerState, edges: string[]) { p.fenceSegments = edges.map(edge => { const segment: PlayerState['fenceSegments'][number] = { edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }; return segment; }); }
export function sheep(p: PlayerState, n: number) { if (n) {
    p.pastures = [{ id: 'sheep', tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }], animalType: 'sheep', animalCount: n }];
    enclose(p, ['H-0-1', 'H-1-1', 'H-0-2', 'H-1-2', 'V-0-1', 'V-0-3']);
} p.resources.sheep = n; }
export function front(st: GameState, n: number) { occupations(st.players[0]!, 3); ['Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2', 'Major_Well', 'Major_ClayOven', 'Major_StoneOven'].slice(0, n - 3).forEach(id => ownMajor(st, id)); }
export function plow(s: GameSession, a = 0, forbidden?: string) { let r = take(s, a, 'farmland'); for (let n = 0; n < 15; n++) { if(forbidden&&r.interaction.stateId==='wait')assert.equal(JSON.stringify(r.interaction.request).includes(forbidden),false,JSON.stringify(r.interaction));
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow')
        return r;
    assert.ok(r.interaction.stateId === 'wait');
    const o = opts(r).find(o => !('disabled' in o && o.disabled) && !['__pass__', '__skip__'].includes(o.value));
    assert.ok(o);
    r = choose(s, r.interaction.playerIndex, o.value);
} assert.fail('Plow menu not reached'); }
export function fence(s: GameSession) { let r = take(s, 0, 'fencing'); for (let n = 0; n < 15; n++) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'fence')
        return finish(s, select(s, 0, { edges: square, palisadeEdges: [], extraWood: 0 }));
    assert.ok(r.interaction.stateId === 'wait');
    const o = opts(r).find(o => !('disabled' in o && o.disabled) && !['__pass__', '__skip__'].includes(o.value));
    assert.ok(o);
    r = choose(s, r.interaction.playerIndex, o.value);
} assert.fail('Fence menu not reached'); }
export function expansion(s: GameSession, room: boolean) { let r = take(s, 0, 'farm-expansion'), builtRoom = false, builtStable = false; for (let n = 0; n < 30 && r.interaction.stateId === 'wait'; n++) {
    if (r.interaction.request.kind === 'confirm-next-player')
        return r;
    const q = r.interaction.request;
    if (q.kind === 'farm-select') {
        if (q.farm.farmType === 'room') {
            r = select(s, 0, { rooms: [{ row: 1, col: 1 }] });
            builtRoom = true;
            continue;
        }
        if (q.farm.farmType === 'stable') {
            r = select(s, 0, { stables: [{ row: 0, col: room ? 2 : 1 }] });
            builtStable = true;
            continue;
        }
    }
    const os = opts(r).filter(o => !('disabled' in o && o.disabled));
    const o = room && !builtRoom ? os.find(o => o.labelKey === 'actions.construct.name') : !builtStable ? os.find(o => o.labelKey === 'actions.stables.name' || o.labelKey === 'actions.buildStables.name') : os.find(o => ['__done__', '__skip__'].includes(o.value));
    const pick = o ?? os.find(o => !['__pass__', '__skip__'].includes(o.value));
    assert.ok(pick, JSON.stringify(r.interaction));
    r = choose(s, 0, pick.value);
} return finish(s, r); }
export function anytime(s: GameSession, id: string) { traces.push({ command: 'takeAnytimeAction', actor: 0, id }); return ok(s.takeAnytimeAction(0, id)); }
