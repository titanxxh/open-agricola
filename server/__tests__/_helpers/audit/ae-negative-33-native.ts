// Helpers of ae-negative-33-native-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import fs from '../audit-evidence-fs'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import type { GameState, PlayerState, Resource } from '../../../../shared/contract/types'
import { familySize, newbornCount } from '../../../../shared/domain/player'
import { createWorkSession } from '../session-fixtures'
import { assertRejectedUnchanged, confirmNext, passPreparationExchanges } from '../negative-rule-audit'

export const sessions: GameSession[] = [];
export const output = process.env.AGRICOLA_NEGATIVE_ARTIFACT_DIR ?? 'output/ae-negative/33/oa-probes';
export const traces: unknown[] = [];
export const order = ['sheep-market', 'fencing', 'major-improvement', 'grain-utilization', 'wish-children', 'house-redevelopment', 'western-quarry', 'pig-market', 'vegetable-seeds', 'cattle-market', 'eastern-quarry', 'cultivation', 'urgent-wish-children', 'farm-redevelopment'];
export function ok(r: SessionResponse): SessionResponse { assert.equal(r.ok, true, `${r.error} ${JSON.stringify(r.interaction)}`); return JSON.parse(JSON.stringify(r)); }
export function save(id: string, value: unknown) { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(`${output}/${id}.json`, JSON.stringify({ commands: traces, value }, null, 2)); }
export function make(card: string, configure: (st: GameState) => void = () => { }, played = true, round = 5, players = 2) { const s = createWorkSession({ seed: 4233, options: { playerCount: players }, configure(st) { st.round = round; st.roundActionOrder = [...order]; for (const p of st.players) {
        const index = st.players.indexOf(p);
        p.occupationHand = [['A125_Priest', 'A103_Portmonger'], ['A116_WoodCutter', 'A123_FrameBuilder'], ['A097_Freshman', 'A124_Knapper'], ['A101_CookeryOutfitter', 'A102_Grocer']][index]!;
        p.minorHand = index === 0 ? ['B004_WoodPile', 'A006_StorageBarn'] : ['__test_placeholder__'];
        p.occupationPlayed = [];
        p.minorPlayed = [];
        p.improvements = [];
        p.cardStates = {};
        Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 100, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 });
    } const p = st.players[0]!; if (played) {
        p.minorPlayed = [card];
        occupations(p, ({ C028_TeachersDesk: 1, D027_Retraining: 1, D028_WritingDesk: 2, D030_ArtisanDistrict: 3 } as Record<string, number>)[card] ?? 0);
    }
    else
        p.minorHand.unshift(card); configure(st); if (!played)
        assert.ok(p.minorHand.includes(card)); } }); sessions.push(s); return s; }
export function take(s: GameSession, a: number, space: string) { const n = order.indexOf(space) + 1; assert.ok(!n || n <= s.state.round); traces.push({ command: 'takeAction', actor: a, space, round: s.state.round }); return ok(s.takeAction(a, space)); }
export function choose(s: GameSession, a: number, value: string, payload?: Parameters<GameSession['resolveChoice']>[2]) { traces.push({ command: 'resolveChoice', actor: a, value, payload }); return ok(s.resolveChoice(a, value, payload)); }
export function select(s: GameSession, a: number, payload: Parameters<GameSession['commitSelectionChoice']>[1]) { traces.push({ command: 'commitSelectionChoice', actor: a, payload }); return ok(s.commitSelectionChoice(a, payload)); }
export function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && 'options' in r.interaction.request ? r.interaction.request.options ?? [] : []; }
export function finish(s: GameSession, first: SessionResponse, accept = true, markers: string[] = [], forbidden?: string, pause?: 'sow' | 'feed') {
    let r = ok(first);
    for (let n = 0; n < 100 && r.interaction.stateId === 'wait'; n++) {
        if (forbidden) {
            const q = r.interaction.request;
            const mandatoryRenovationFlag = forbidden === 'D027_Retraining' && q.kind === 'select-trigger' && q.options.some(o => o.value === '__pass__' && 'disabled' in o && o.disabled);
            if (mandatoryRenovationFlag)
                assert.deepEqual(q.options.filter(o => !('disabled' in o && o.disabled)).map(o => o.value), ['D027_Retraining']);
            else if (forbidden === 'D027_Retraining' && q.kind === 'choice' && r.interaction.spaceId === 'house-redevelopment' && q.options.some(o => o.value.startsWith('action-improvement-')) && q.options.some(o => o.value === '__skip__')) {
                assert.equal(q.options.some(o => o.sourceCard === forbidden), false);
            } else
                assert.equal(JSON.stringify(q).includes(forbidden), false, JSON.stringify(r.interaction));
        }
        r = passPreparationExchanges(s, r);
        const i = r.interaction;
        if (i.stateId !== 'wait' || i.request.kind === 'confirm-next-player')
            return ok(r);
        const q = i.request;
        if (pause === 'feed' && q.kind === 'feed' || pause === 'sow' && q.kind === 'farm-select' && q.farm.farmType === 'sow')
            return ok(r);
        if (q.kind === 'confirm-player-switch')
            r = choose(s, q.fromPlayerIndex, 'confirm');
        else if (q.kind === 'choice' || q.kind === 'select-trigger') {
            const active = q.options.filter(o => !('disabled' in o && o.disabled)), preferred = markers.flatMap(m => active.filter(o => JSON.stringify(o).includes(m))).find(o => !['__pass__', '__skip__', '__done__'].includes(o.value));
            const ordinaryRenovationImprovement = i.spaceId === 'house-redevelopment' && active.some(o => o.value.startsWith('action-improvement-')) && active.some(o => ['__pass__', '__skip__'].includes(o.value));
            const picked = (accept && !ordinaryRenovationImprovement ? preferred ?? active.find(o => !['__pass__', '__skip__', '__done__'].includes(o.value) && o.labelKey !== 'actions.exchange.name') : undefined) ?? active.find(o => ['__pass__', '__skip__', '__done__'].includes(o.value)) ?? active.find(o => o.value !== '__pass__');
            assert.ok(picked, JSON.stringify(i));
            r = choose(s, i.playerIndex, picked.value);
        }
        else if (q.kind === 'farm-select' && q.farm.farmType === 'sow') {
            const target = q.farm.selectableFields.find(f => f.allowedCrops.includes('grain'));
            assert.ok(target, JSON.stringify(i));
            r = select(s, i.playerIndex, { crops: [{ ...target.tile, crop: 'grain' }] });
        }
        else if (q.kind === 'farm-select' && q.farm.farmType === 'plow')
            r = select(s, i.playerIndex, { tile: q.farm.selectableTiles[0]! });
        else if (q.kind === 'animal-reorg')
            r = choose(s, i.playerIndex, 'confirm', { zones: q.zones });
        else if (q.kind === 'feed')
            r = choose(s, i.playerIndex, 'confirm', { selections: [] });
        else
            assert.fail(JSON.stringify(i));
    }
    assert.notEqual(r.interaction.stateId, 'wait', 'Resolution exhausted');
    return ok(r);
}
export function ready(s: GameSession, accept = false, markers: string[] = [], forbidden?: string, pause?: 'sow' | 'feed') { let r = s.getState(); if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player') {
    traces.push({ command: 'resolveChoice', actor: r.interaction.request.nextPlayerIndex, value: 'confirm' });
    r = confirmNext(s, r);
} r = finish(s, r, accept, markers, forbidden, pause); return ok(r); }
export function fill(s: GameSession, accept = false, markers: string[] = [], forbidden?: string, pause?: 'sow' | 'feed') { const r = ready(s, accept, markers, forbidden, pause); if (r.state.gameOver || r.interaction.stateId === 'wait')
    return r; const a = r.state.currentPlayerIndex, av = s.getActionAvailability(a), space = ['forest', 'clay-pit', 'reed-bank', 'grain-seeds', 'fishing', 'day-laborer', 'grove', 'copse', 'hollow-4', 'hollow', 'traveling-players', 'resource-market-4', 'resource-market'].find(id => av[id]); assert.ok(space, JSON.stringify(av)); return finish(s, take(s, a, space), accept, markers, forbidden, pause); }
export function reach(s: GameSession, target: number, accept = false, markers: string[] = [], forbidden?: string, pause?: 'sow' | 'feed') { for (let n = 0; n < 100; n++) {
    const r = ready(s, accept, markers, forbidden, pause);
    if (r.state.round === target || r.state.gameOver || r.interaction.stateId === 'wait')
        return r;
    assert.ok(r.state.round < target);
    fill(s, accept, markers, forbidden, pause);
} assert.fail('natural phase not reached'); }
export function end(s: GameSession, accept = false, markers: string[] = [], forbidden?: string, pause?: 'sow' | 'feed') { return reach(s, s.state.round + 1, accept, markers, forbidden, pause); }
export function final(s: GameSession) { for (let n = 0; n < 20; n++) {
    if (s.state.gameOver)
        return ok(s.getState());
    fill(s);
} assert.fail('actual final not reached'); }
export function minor(s: GameSession, a = 0) { let r = take(s, a, 'meeting-place'); for (let n = 0; n < 10; n++) {
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction));
    if (opts(r).some(o => o.value === 'B004_WoodPile' || o.value === 'A006_StorageBarn' || o.value.startsWith('Major_')))
        return r;
    const o = opts(r).find(o => o.value.startsWith('action-improvement-'));
    assert.ok(o, JSON.stringify(r.interaction));
    r = choose(s, a, o.value);
} assert.fail('minor menu not reached'); }
export function purchase(s: GameSession, id: string) { let r = minor(s); const o = opts(r).find(o => o.value === id || o.value === `minor:${id}`); assert.ok(o, JSON.stringify(r.interaction)); r = choose(s, 0, o.value); return finish(s, r, true, [id]); }
export function rejectBuy(s: GameSession, id: string) { const p = minor(s); assert.equal(opts(p).some(o => (o.value === id || o.value === `minor:${id}`) && !('disabled' in o && o.disabled)), false); const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, id)), fallback = opts(p).find(o => o.value === 'B004_WoodPile'); assert.ok(fallback); const r = finish(s, choose(s, 0, fallback.value)); assert.ok(r.state.players[0]!.minorHand.includes(id)); return { p, bad, r }; }
export function undo(s: GameSession) { traces.push({ command: 'undoAction' }); return ok(s.undoAction()); }
export function resource(r: SessionResponse, expected: Partial<Resource>, p = 0) { for (const [k, v] of Object.entries(expected))
    assert.equal(Object.entries(r.state.players[p]!.resources).find(([key]) => key === k)?.[1], v, k); }
export function bonus(r: SessionResponse, id: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cardBonusVp')?.entries.filter(e => 'cardId' in e && e.cardId === id).reduce((n, e) => n + e.score, 0) ?? 0; }
export function points(r: SessionResponse, id: string) { return r.scores?.[0]?.categories.find(c => c.key === 'cards')?.entries.filter(e => 'cardId' in e && e.cardId === id).reduce((n, e) => n + e.score, 0) ?? 0; }
export function occupied(r: SessionResponse, a = 0) { return r.state.actionSpaces.flatMap(x => x.takenBy).filter(x => x.playerId === r.state.players[a]!.id); }
export function major(s: GameSession, id: string, a = 0, accept = true) { let r = take(s, a, 'major-improvement'); for (let n = 0; n < 12; n++) {
    if (r.state.players[a]!.improvements.includes(id))
        return r;
    assert.ok(r.interaction.stateId === 'wait');
    const card = opts(r).find(o => o.value === id);
    if (card) {
        r = choose(s, a, card.value);
        continue;
    }
    const o = opts(r).find(o => o.value.startsWith('action-improvement-')) ?? opts(r).find(o => accept ? o.value !== '__pass__' && o.value !== '__skip__' && o.labelKey !== 'actions.exchange.name' : o.value === '__skip__');
    assert.ok(o, JSON.stringify(r.interaction));
    r = choose(s, r.interaction.playerIndex, o.value);
} assert.fail('major purchase not reached'); }
export function ownMajor(st: GameState, id: string, a = 0) { st.players[a]!.improvements.push(id); st.availableMajorImprovements = st.availableMajorImprovements.filter(x => x !== id); }
export function occupations(p: PlayerState, n: number) { p.occupationPlayed = ['A110_Roughcaster', 'A100_Curator', 'A099_FellowGrazer'].slice(0, n); }
export function house(p: PlayerState, n: number, type: PlayerState['houseType'] = 'wood') { p.rooms = n; p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 0, col: 0 }].slice(0, n); p.houseType = type; }
export function field(p: PlayerState, grain = 0, veg = 0) { p.fields = [{ row: 0, col: 1, stacks: grain ? [{ kind: 'grain', remaining: grain }] : [] }]; if (veg)
    p.fields.push({ row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: veg }] }); }
export function pen(p: PlayerState, types: Array<'sheep' | 'boar' | 'cattle'>) { p.pastures = types.map((type, col) => ({ id: `p${col}`, tiles: [{ row: 0, col }], animalType: type, animalCount: 1 })); const edges = new Set(types.flatMap((_t, col) => [`H-0-${col}`, `H-1-${col}`, `V-0-${col}`, `V-0-${col + 1}`])); p.fenceSegments = [...edges].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } })); for (const type of types)
    p.resources[type] = 1; }
export function complete(p: PlayerState, begging = 0) { pen(p, ['sheep', 'boar', 'cattle']); p.fields = []; for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++)
        if (!(row === 0 && col <= 2) && !(row >= 1 && col === 0))
            p.fields.push({ row, col, stacks: [] }); Object.assign(p.resources, { grain: 1, vegetable: 1, begging }); }
export function stableFarm(p: PlayerState, types: Array<'sheep' | 'boar' | 'cattle'>) { p.stableTiles = types.map((_t, i) => ({ row: 0, col: i + 1 })); p.stableAnimals = {}; for (const [t, i] of types.map((t, i): [
    'sheep' | 'boar' | 'cattle',
    number
] => [t, i])) {
    p.stableAnimals[`0-${i + 1}`] = { animalType: t, animalCount: 1 };
    p.resources[t]++;
} }
export function stored(r: SessionResponse) { return r.state.players[0]!.cardStates.E027_PiggyBank?.counters?.food ?? 0; }
export function renovation(s: GameSession, a = 0, accept = true, forbidden?: string) { let r = take(s, a, 'house-redevelopment'); r = finish(s, r, accept, ['A125_Priest', 'clay', 'Major_Fireplace1'], forbidden); return r; }
export function newborn(s: GameSession) { let r = take(s, 0, 'wish-children'); r = finish(s, r, false); assert.equal(familySize(r.state.players[0]!), 3); assert.equal(newbornCount(r.state.players[0]!), 1); return r; }
